/** Pure accounting model. Currency is integer FCFA; dates/months are ISO strings. */
export class DomainError extends Error {}
export function ensure(value, message) {
  if (!value) throw new DomainError(message);
}
export function text(value, label, max = 200) {
  ensure(
    typeof value === "string" && value.trim().length > 0 && value.length <= max,
    `${label} invalide.`,
  );
  return value.trim();
}
export function money(value, zero = false) {
  ensure(
    Number.isSafeInteger(value) &&
      value >= (zero ? 0 : 1) &&
      value <= 1000000000,
    "Montant invalide (FCFA entiers).",
  );
  return value;
}
export function month(value) {
  ensure(
    /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") &&
      value >= "2000-01" &&
      value <= "2100-12",
    "Mois invalide.",
  );
  return value;
}
export function date(value) {
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(value ?? "") &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value,
    "Date invalide.",
  );
  month(value.slice(0, 7));
  return value;
}
export function addMonths(value, n) {
  const [y, m] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}
export function todayAtGabon(now = new Date()) {
  return new Date(now.getTime() + 3600000).toISOString().slice(0, 10);
}
export function emptyState() {
  return {
    settings: null,
    members: {},
    operations: {},
    controls: {},
    events: {},
    calls: {},
  };
}
export function activeAt(member, period) {
  return member.terms.some(
    (t) => t.from <= period && (!t.to || period <= t.to),
  );
}
export function absentAt(member, period) {
  return member.absences.some((t) => t.from <= period && (!t.to || period <= t.to));
}
export function rateAt(settings, period) {
  return (
    [...settings.rates].reverse().find((r) => r.from <= period)?.amount ?? 0
  );
}
export function cycleAt(settings, period) {
  const schedule = [...settings.schedules]
    .reverse()
    .find((s) => s.from <= period);
  if (!schedule) return null;
  let start = schedule.from;
  while (addMonths(start, schedule.frequency) <= period)
    start = addMonths(start, schedule.frequency);
  return {
    start,
    end: addMonths(start, schedule.frequency - 1),
    frequency: schedule.frequency,
  };
}
function accrue(state, today) {
  const current = today.slice(0, 7);
  for (const m of Object.values(state.members)) {
    for (let p = m.firstDueMonth; p <= current; p = addMonths(p, 1)) {
      const cycle = cycleAt(state.settings, p);
      if (!cycle || cycle.start > current) continue;
      for (let q = cycle.start; q <= cycle.end; q = addMonths(q, 1)) {
        if (q < m.firstDueMonth || m.charges[q]?.historical) continue;
        const exempt = !activeAt(m, q) || absentAt(m, q);
        if (!m.charges[q])
          m.charges[q] = {
            month: q,
            rate: rateAt(state.settings, q),
            dueDate: `${cycle.start}-01`,
          };
        m.charges[q].amount = exempt ? 0 : m.charges[q].rate;
        m.charges[q].exempt = exempt;
      }
    }
    // A status/absence correction also revisits previously emitted future months.
    for (const c of Object.values(m.charges)) {
      if (c.historical) continue; // Validated imported calls are not recalculated.
      c.exempt = !activeAt(m, c.month) || absentAt(m, c.month);
      c.amount = c.exempt ? 0 : c.rate;
    }
  }
}
function cashDelta(op) {
  if (op.cancelled) return 0;
  if (["payment", "reimbursement", "income", "advanceReturn"].includes(op.type))
    return op.amount;
  if (["refund", "advance"].includes(op.type) || (op.type === "expense" && op.payer === "cash"))
    return -op.amount;
  if (op.type === "adjustment")
    return op.direction === "in" ? op.amount : -op.amount;
  return 0;
}
export function accountFor(state, member) {
  const charges = Object.values(member.charges).map((c) => ({ ...c, paid: 0 }));
  if (member.openingDebt)
    charges.push({
      month: "opening",
      label: "Solde antérieur",
      amount: member.openingDebt,
      paid: 0,
      dueDate: state.settings.openingDate,
      exempt: false,
    });
  charges.sort((a, b) =>
    a.month === "opening"
      ? -1
      : b.month === "opening"
        ? 1
        : a.month.localeCompare(b.month),
  );
  const linked = Object.values(state.operations)
    .filter((o) => !o.cancelled && o.memberId === member.id)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
  const payments = linked.filter((o) => o.type === "payment");
  const credits = linked.filter(
    (o) => o.type === "expense" && o.awardCredit && o.payer === "member",
  );
  const refunds = linked
    .filter((o) => o.type === "refund")
    .reduce((sum, o) => sum + o.amount, 0);
  let refundLeft = refunds;
  let credit = 0;
  const allocations = [];
  const sources = [
    { id: "opening", amount: member.openingCredit, priority: [] },
    ...linked
      .filter((o) => o.type === "payment" || credits.includes(o))
      .map((o) => ({ ...o, priority: o.priority ?? [] })),
  ];
  // Refunds remove unallocated value. Recomputing also reopens debt when a
  // previously consumed credit is corrected or cancelled.
  let availableTotal = sources.reduce((sum, s) => sum + s.amount, 0) - refunds;
  ensure(
    availableTotal >= 0,
    "Cette correction rendrait les remboursements supérieurs aux crédits reçus.",
  );
  for (const source of sources) {
    let available = source.amount;
    const taken = Math.min(refundLeft, available);
    available -= taken;
    refundLeft -= taken;
    const ordered = [...charges].sort((a, b) => {
      const ai = source.priority.indexOf(a.month),
        bi = source.priority.indexOf(b.month);
      return (
        (ai < 0 ? 9999 : ai) - (bi < 0 ? 9999 : bi) ||
        charges.indexOf(a) - charges.indexOf(b)
      );
    });
    for (const c of ordered) {
      const applied = Math.min(available, c.amount - c.paid);
      if (applied > 0) {
        c.paid += applied;
        available -= applied;
        allocations.push({
          sourceId: source.id,
          month: c.month,
          amount: applied,
        });
      }
    }
    credit += available;
  }
  return {
    due: charges.reduce((sum, c) => sum + c.amount - c.paid, 0),
    credit,
    charges,
    allocations,
    payments: payments.map((o) => ({
      id: o.id,
      date: o.date,
      amount: o.amount,
    })),
    credits: credits.map((o) => ({
      id: o.id,
      date: o.date,
      amount: o.amount,
      label: o.label,
    })),
    refunds: linked
      .filter((o) => o.type === "refund")
      .map((o) => ({ id: o.id, date: o.date, amount: o.amount })),
  };
}
export function refresh(state, today) {
  if (!state.settings) return state;
  accrue(state, today);
  for (const m of Object.values(state.members)) {
    m.account = accountFor(state, m);
    m.status = !activeAt(m, today.slice(0, 7))
      ? m.terms.some((t) => t.from > today.slice(0, 7))
        ? "À venir"
        : "Parti"
      : absentAt(m, today.slice(0, 7))
        ? "En pause"
        : "Actif";
  }
  return state;
}
export function cashBalance(state) {
  return (
    (state.settings?.openingBalance ?? 0) +
    Object.values(state.operations).reduce((sum, o) => sum + cashDelta(o), 0)
  );
}
function validMember(state, id) {
  ensure(state.members[id], "Adhérent introuvable.");
  return state.members[id];
}
function validId(value) {
  ensure(
    typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value),
    "Identifiant invalide.",
  );
  return value;
}
function periods(value) {
  ensure(Array.isArray(value) && value.length <= 100, "Périodes invalides.");
  return value.map((p) => {
    const from = month(p.from),
      to = p.to ? month(p.to) : null;
    ensure(!to || to >= from, "Fin antérieure au début.");
    return { from, to };
  });
}
function validateOperation(state, input, today) {
  const allowed = [
    "payment",
    "expense",
    "reimbursement",
    "income",
    "refund",
    "adjustment",
    "advance",
    "advanceReturn",
  ];
  ensure(allowed.includes(input.type), "Type invalide.");
  const op = {
    id: validId(input.id),
    type: input.type,
    amount: money(input.amount),
    date: date(input.date),
    label: "",
    comment:
      typeof input.comment === "string" ? input.comment.slice(0, 2000) : "",
    category: "",
    eventId: "",
    memberId: "",
    payer: "",
    awardCredit: false,
    expenseId: "",
    advanceId: "",
    direction: "",
    priority: [],
    receiptPath: "",
  };
  ensure(
    op.date >= state.settings.openingDate && op.date <= today,
    "La date doit être comprise entre la bascule et aujourd’hui.",
  );
  if (input.eventId) {
    ensure(state.events[input.eventId], "Événement introuvable.");
    op.eventId = input.eventId;
  }
  if (["payment", "refund"].includes(op.type)) {
    validMember(state, input.memberId);
    op.memberId = input.memberId;
    op.label = op.type === "payment" ? "Cotisation" : "Remboursement d’avoir";
  } else op.label = text(input.label, "Libellé public");
  if (op.type === "payment" && input.priority) {
    ensure(
      Array.isArray(input.priority) && input.priority.length <= 240,
      "Imputation invalide.",
    );
    op.priority = [
      ...new Set(input.priority.map((p) => (p === "opening" ? p : month(p)))),
    ];
    ensure(
      op.priority.every((p) =>
        p === "opening"
          ? state.members[op.memberId].openingDebt > 0
          : state.members[op.memberId].charges[p]?.amount > 0,
      ),
      "La période choisie n’est pas due.",
    );
  }
  if (op.type === "expense") {
    ensure(
      ["cash", "member", "thirdParty"].includes(input.payer),
      "Payeur invalide.",
    );
    op.payer = input.payer;
    if (op.payer === "member") {
      validMember(state, input.memberId);
      op.memberId = input.memberId;
      op.awardCredit = input.awardCredit === true;
    }
    ensure(
      state.settings.categories.includes(input.category),
      "Catégorie invalide.",
    );
    op.category = input.category;
    if (input.receiptPath) {
      ensure(
        new RegExp(`^receipts/${op.id}/[a-zA-Z0-9_.-]+$`).test(
          input.receiptPath,
        ),
        "Justificatif invalide.",
      );
      op.receiptPath = input.receiptPath;
    }
  }
  if (op.type === "reimbursement") {
    const expense = state.operations[input.expenseId];
    ensure(
      expense?.type === "expense" && !expense.cancelled,
      "Dépense d’origine introuvable.",
    );
    op.expenseId = expense.id;
    op.category = expense.category;
    op.eventId = expense.eventId;
  }
  if (op.type === "advanceReturn") {
    const advance = state.operations[input.advanceId];
    ensure(advance?.type === "advance" && !advance.cancelled, "Avance introuvable.");
    op.advanceId = advance.id;
  }
  if (op.type === "adjustment") {
    ensure(["in", "out"].includes(input.direction), "Sens invalide.");
    op.direction = input.direction;
  }
  return op;
}
function validateLinks(state) {
  for (const op of Object.values(state.operations).filter(o => !o.cancelled && o.type === "advanceReturn")) {
    const advance = state.operations[op.advanceId];
    ensure(advance?.type === "advance" && !advance.cancelled, "Annulez d’abord les remboursements de cette avance.");
    const received = Object.values(state.operations).filter(o => !o.cancelled && o.type === "advanceReturn" && o.advanceId === advance.id).reduce((sum, o) => sum + o.amount, 0);
    ensure(received <= advance.amount, "Les remboursements dépassent l’avance.");
  }
  for (const op of Object.values(state.operations).filter(
    (o) => !o.cancelled && o.type === "reimbursement",
  )) {
    const expense = state.operations[op.expenseId];
    ensure(
      expense && !expense.cancelled && expense.type === "expense",
      "Annulez d’abord les remboursements liés à cette dépense.",
    );
    const sum = Object.values(state.operations)
      .filter(
        (o) =>
          !o.cancelled &&
          o.type === "reimbursement" &&
          o.expenseId === expense.id,
      )
      .reduce((s, o) => s + o.amount, 0);
    ensure(
      sum <= expense.amount,
      "Les remboursements reçus dépassent la dépense.",
    );
    op.category = expense.category;
    op.eventId = expense.eventId;
  }
}
export function applyCommand(previous, command, context) {
  const state = structuredClone(previous),
    { today, now, actor } = context;
  const p = command.payload ?? {};
  const id = command.id;
  ensure(
    command.action === "setup" || state.settings,
    "Initialisez l’association.",
  );
  refresh(state, today);
  switch (command.action) {
    case "setup": {
      ensure(!state.settings, "Association déjà initialisée.");
      const openingDate = date(p.openingDate);
      ensure(openingDate <= today, "La bascule ne peut être future.");
      const first = month(p.firstDueMonth);
      ensure(
        first >= openingDate.slice(0, 7),
        "Première échéance antérieure à la bascule.",
      );
      ensure(
        Number(first.slice(5)) % 2 === 0,
        "Choisissez un mois pair pour la première échéance.",
      );
      state.settings = {
        name: text(p.name, "Nom"),
        openingDate,
        openingBalance: money(p.openingBalance, true),
        firstDueMonth: first,
        rates: [{ from: first, amount: money(p.monthlyRate ?? 7500) }],
        schedules: [{ from: first, frequency: 2 }],
        noticeDays: 5,
        categories: ["Café", "Alimentation", "Matériel", "Entretien", "Autre"],
        denominations: [10000, 5000],
      };
      break;
    }
    case "memberSave": {
      const memberId = validId(p.id);
      const old = state.members[memberId];
      const email = (p.email ?? "").trim().toLowerCase();
      ensure(
        !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        "Email invalide.",
      );
      ensure(
        !email ||
          !Object.values(state.members).some(
            (m) => m.id !== memberId && m.email === email,
          ),
        "Email déjà associé à un adhérent.",
      );
      ensure(
        (!old?.uid && !old?.accessUid) || old.email === email,
        "Un accès créé conserve son email ; contactez le gestionnaire Firebase pour le modifier.",
      );
      const firstDueMonth = month(p.firstDueMonth ?? old?.firstDueMonth);
      ensure(
        firstDueMonth >= state.settings.firstDueMonth,
        "Échéance antérieure à la bascule.",
      );
      if (old)
        ensure(
          firstDueMonth === old.firstDueMonth,
          "Le mois de reprise est définitif ; corrigez les absences ou le solde antérieur.",
        );
      const openingDebt = money(p.openingDebt ?? 0, true),
        openingCredit = money(p.openingCredit ?? 0, true);
      ensure(
        !openingDebt || !openingCredit,
        "Renseignez une dette OU un avoir antérieur.",
      );
      if (old) text(p.reason, "Motif de modification");
      state.members[memberId] = {
        id: memberId,
        name: text(p.name, "Nom"),
        email,
        uid: old?.uid ?? "",
        accessUid: old?.accessUid ?? "",
        firstDueMonth,
        openingDebt,
        openingCredit,
        terms: old?.terms ?? [
          { from: month(p.joinMonth ?? firstDueMonth), to: null },
        ],
        absences: old?.absences ?? [],
        charges: old?.charges ?? {},
        ...(old?.migration ? { migration: old.migration } : {}),
        createdAt: old?.createdAt ?? now,
      };
      break;
    }
    case "memberPeriods": {
      const m = validMember(state, p.memberId);
      text(p.reason, "Motif");
      if (p.terms) {
        m.terms = periods(p.terms);
        ensure(m.terms.length > 0, "Une période d’adhésion est requise.");
      }
      if (p.absences) {
        m.absences = periods(p.absences);

      }
      break;
    }
    case "memberDelete": {
      const m = validMember(state, p.memberId);
      ensure(
        !m.uid &&
          !m.accessUid &&
          !m.openingDebt &&
          !m.openingCredit &&
          !Object.values(m.charges).some((c) => c.amount > 0) &&
          !Object.values(state.operations).some((o) => o.memberId === m.id) &&
          !Object.values(state.calls).some((c) =>
            c.members.some((x) => x.memberId === m.id),
          ),
        "Cette fiche possède un historique. Enregistrez un départ.",
      );
      delete state.members[m.id];
      break;
    }
    case "operationSave": {
      const old = state.operations[p.id];
      ensure(!old?.migration, "Opération historique verrouillée ; utilisez une correction de reprise contrôlée.");
      ensure(!old?.cancelled, "Une opération annulée ne peut être modifiée.");
      if (old || ["refund", "adjustment"].includes(p.type))
        text(p.reason, "Motif");
      if (old)
        ensure(
          old.type === p.type,
          "Le type est définitif ; annulez puis recréez l’opération.",
        );
      const op = validateOperation(state, p, today);
      if (op.type === "refund") {
        const without = structuredClone(state);
        delete without.operations[op.id];
        refresh(without, today);
        ensure(
          without.members[op.memberId].account.credit >= op.amount,
          "Avoir disponible insuffisant.",
        );
        ensure(
          cashBalance(without) >= op.amount,
          "Caisse insuffisante pour ce remboursement.",
        );
      }
      op.createdAt = old?.createdAt ?? now;
      op.updatedAt = now;
      op.cancelled = false;
      op.reason = p.reason ?? "";
      op.revision = (old?.revision ?? 0) + 1;
      state.operations[op.id] = op;
      validateLinks(state);
      break;
    }
    case "operationCancel": {
      const op = state.operations[p.operationId];
      ensure(op && !op.cancelled, "Opération introuvable ou déjà annulée.");
      ensure(!op.migration, "Opération historique verrouillée ; utilisez une correction de reprise contrôlée.");
      op.cancelled = true;
      op.reason = text(p.reason, "Motif");
      op.updatedAt = now;
      op.revision += 1;
      validateLinks(state);
      break;
    }
    case "control": {
      let physical;
      let counts = {};
      if (p.mode === "denominations") {
        ensure(p.counts && typeof p.counts === "object", "Comptage requis.");
        physical = 0;
        for (const d of state.settings.denominations) {
          const count = money(p.counts[d] ?? 0, true);
          ensure(count <= 100000, "Nombre de coupures invalide.");
          counts[d] = count;
          physical += d * count;
        }
        money(physical, true);
      } else physical = money(p.physical, true);
      const theoretical = cashBalance(state);
      state.controls[id] = {
        id,
        date: today,
        createdAt: now,
        theoretical,
        physical,
        difference: physical - theoretical,
        counts,
        note: (p.note ?? "").slice(0, 2000),
        actor,
      };
      break;
    }
    case "eventSave": {
      const eventId = validId(p.id);
      state.events[eventId] = {
        id: eventId,
        name: text(p.name, "Nom public"),
        date: date(p.date),
        description: (p.description ?? "").slice(0, 1000),
      };
      break;
    }
    case "settings": {
      text(p.reason, "Motif");
      if (p.name !== undefined) state.settings.name = text(p.name, "Nom");
      if (p.categories) {
        ensure(
          Array.isArray(p.categories) &&
            p.categories.length > 0 &&
            p.categories.length <= 100,
          "Catégories invalides.",
        );
        state.settings.categories = [
          ...new Set(p.categories.map((c) => text(c, "Catégorie", 60))),
        ];
      }
      if (p.denominations) {
        ensure(
          Array.isArray(p.denominations) &&
            p.denominations.length > 0 &&
            p.denominations.length <= 20,
          "Coupures invalides.",
        );
        state.settings.denominations = [
          ...new Set(p.denominations.map((d) => money(d))),
        ].sort((a, b) => b - a);
      }
      if (p.noticeDays !== undefined) {
        ensure(
          Number.isInteger(p.noticeDays) &&
            p.noticeDays >= 0 &&
            p.noticeDays <= 31,
          "Délai invalide.",
        );
        state.settings.noticeDays = p.noticeDays;
      }
      if (p.rate) {
        const from = month(p.rate.from);
        ensure(
          from > today.slice(0, 7),
          "Un nouveau tarif prend effet un mois futur.",
        );
        ensure(
          !Object.values(state.members).some((m) => m.charges[from]),
          "Cette période est déjà émise.",
        );
        state.settings.rates = [
          ...state.settings.rates.filter((r) => r.from !== from),
          { from, amount: money(p.rate.amount) },
        ].sort((a, b) => a.from.localeCompare(b.from));
      }
      if (p.schedule) {
        const from = month(p.schedule.from);
        ensure(
          from > today.slice(0, 7) && from >= state.settings.firstDueMonth,
          "La fréquence change à une échéance future.",
        );
        ensure(
          [1, 2, 3, 6, 12].includes(p.schedule.frequency),
          "Fréquence invalide.",
        );
        const cycle = cycleAt(state.settings, from);
        ensure(
          cycle?.start === from,
          "Choisissez le début d’un prochain appel.",
        );
        state.settings.schedules = [
          ...state.settings.schedules.filter((s) => s.from < from),
          { from, frequency: p.schedule.frequency },
        ];
      }
      break;
    }
    case "call": {
      const start = month(p.start);
      const cycle = cycleAt(state.settings, start);
      ensure(cycle?.start === start, "Début d’appel invalide.");
      ensure(Array.isArray(p.memberIds), "Sélection requise.");
      const selected = [...new Set(p.memberIds)].map((memberId) => {
        const m = validMember(state, memberId);
        let grossAmount = 0, paid = 0, earlierUnbilled = 0;
        for (let q = m.firstDueMonth; q <= cycle.end; q = addMonths(q, 1)) {
          if (!activeAt(m, q) || absentAt(m, q)) continue;
          const charge = m.charges[q];
          const monthly = charge?.amount ?? rateAt(state.settings, q);
          if (q < cycle.start) {
            if (!charge) earlierUnbilled += monthly;
          } else {
            grossAmount += monthly;
            paid += m.account.charges.find(c => c.month === q)?.paid ?? 0;
          }
        }
        const usableCredit = Math.max(0, m.account.credit - earlierUnbilled);
        const amount = Math.max(0, grossAmount - paid - usableCredit);
        return { memberId, name: m.name, amount, grossAmount };
      });
      state.calls[start] = {
        id: start,
        start,
        end: cycle.end,
        members: selected,
        createdAt: now,
        message: `${state.settings.name} — Cotisations ${start} à ${cycle.end}\nÀ régler dès le ${start}-01, après paiements et avoirs.\n${selected.map((m) => `${m.name} : ${m.amount.toLocaleString("fr-FR")} FCFA`).join("\n")}\nMerci !`,
      };
      break;
    }
    case "refresh":
      break;
    default:
      throw new DomainError("Action inconnue.");
  }
  refresh(state, today);
  return state;
}
export function publicData(state) {
  if (!state.settings)
    return {
      summary: { name: "Comptes Bar GAP", initialized: false },
      operations: {},
      expenses: {},
      controls: {},
      events: {},
    };
  const operations = {
    opening: {
      id: "opening",
      type: "opening",
      date: state.settings.openingDate,
      label: "Solde d’ouverture",
      amount: state.settings.openingBalance,
      delta: state.settings.openingBalance,
      category: "",
      eventId: "",
      cancelled: false,
      revision: 1,
    },
  };
  const expenses = {},
    events = {},
    controls = {};
  let contributions = 0,
    reimbursements = 0,
    spending = 0,
    refunds = 0,
    advancesOutstanding = 0;
  for (const op of Object.values(state.operations)) {
    const privateMember = ["payment", "refund"].includes(op.type);
    const common = {
      id: op.id,
      type: op.type,
      date: op.date,
      label: op.label,
      amount: op.amount,
      category: privateMember ? "" : op.category,
      eventId: privateMember ? "" : op.eventId,
      cancelled: op.cancelled,
      revision: op.revision,
    };
    if (
      cashDelta(op) ||
      (op.cancelled &&
        ([
          "payment",
          "refund",
          "reimbursement",
          "income",
          "adjustment",
          "advance",
          "advanceReturn",
        ].includes(op.type) ||
          op.payer === "cash"))
    ) {
      operations[op.id] = {
        ...common,
        delta: cashDelta({ ...op, cancelled: false }),
      };
    }
    if (op.type === "expense") {
      const received = Object.values(state.operations)
        .filter(
          (r) =>
            !r.cancelled && r.type === "reimbursement" && r.expenseId === op.id,
        )
        .reduce((s, r) => s + r.amount, 0);
      expenses[op.id] = {
        ...common,
        fromCash: op.payer === "cash",
        reimbursed: received,
        net: op.amount - received,
      };
    }
    if (!op.cancelled) {
      if (op.type === "advance") advancesOutstanding += op.amount;
      if (op.type === "advanceReturn") advancesOutstanding -= op.amount;
      if (op.type === "payment") contributions += op.amount;
      if (op.type === "reimbursement") reimbursements += op.amount;
      if (op.type === "expense") spending += op.amount;
      if (op.type === "refund") refunds += op.amount;
    }
  }
  for (const e of Object.values(state.events)) {
    const related = Object.values(state.operations).filter(
      (o) => !o.cancelled && o.eventId === e.id,
    );
    const cost = related
      .filter((o) => o.type === "expense")
      .reduce((s, o) => s + o.amount, 0);
    const income = related
      .filter((o) => ["income", "reimbursement"].includes(o.type))
      .reduce((s, o) => s + o.amount, 0);
    events[e.id] = { ...e, expenses: cost, income, net: cost - income };
  }
  for (const c of Object.values(state.controls))
    controls[c.id] = {
      id: c.id,
      date: c.date,
      createdAt: c.createdAt,
      theoretical: c.theoretical,
      physical: c.physical,
      difference: c.difference,
    };
  const lastControl =
    Object.values(controls).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )[0] ?? null;
  return {
    summary: {
      initialized: true,
      name: state.settings.name,
      balance: cashBalance(state),
      contributions,
      reimbursements,
      spending,
      refunds,
      advancesOutstanding,
      netCost: spending - reimbursements,
      lastControl,
    },
    operations,
    expenses,
    events,
    controls,
  };
}
