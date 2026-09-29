import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  applyCommand,
  publicData,
  cashBalance,
  addMonths,
  todayAtGabon,
} from "../src/domain.js";
let sequence = 0;
const context = (today = "2026-10-01") => ({
  today,
  now: `${today}T12:00:00.000Z`,
  actor: "admin",
});
function command(s, action, payload = {}, day) {
  return applyCommand(
    s,
    { id: `cmd_${++sequence}`, action, payload },
    context(day),
  );
}
function fixture(day = "2026-10-01") {
  let s = command(
    emptyState(),
    "setup",
    {
      name: "GAP",
      openingDate: "2026-09-28",
      openingBalance: 10000,
      firstDueMonth: "2026-10",
    },
    day,
  );
  s = command(
    s,
    "memberSave",
    {
      id: "alice",
      name: "Alice",
      email: "alice@gap.test",
      firstDueMonth: "2026-10",
    },
    day,
  );
  return s;
}
const payment = (id, memberId, amount, extras = {}) => ({
  id,
  type: "payment",
  memberId,
  amount,
  date: "2026-10-01",
  ...extras,
});
const expense = (id, amount, extras = {}) => ({
  id,
  type: "expense",
  label: "Café",
  amount,
  date: "2026-10-01",
  payer: "cash",
  category: "Café",
  ...extras,
});

test("échéances à venir, décembre/janvier, absence de doublons", () => {
  let s = fixture("2026-09-28");
  assert.equal(s.members.alice.account.due, 0);
  s = command(s, "refresh");
  assert.equal(s.members.alice.account.due, 15000);
  assert.deepEqual(
    s.members.alice.account.charges.map((c) => c.month),
    ["2026-10", "2026-11"],
  );
  s = command(s, "refresh", {}, "2026-12-01");
  assert.equal(s.members.alice.account.due, 30000);
  assert.equal(s.members.alice.charges["2027-01"].dueDate, "2026-12-01");
  assert.deepEqual(command(s, "refresh", {}, "2026-12-01"), s);
});
test("20 000 payés pour 30 000 dus : solde 10 000, caisse +20 000", () => {
  let s = fixture("2026-12-01");
  s = command(s, "operationSave", payment("p1", "alice", 20000), "2026-12-01");
  assert.equal(cashBalance(s), 30000);
  assert.equal(s.members.alice.account.due, 10000);
  assert.equal(s.members.alice.account.credit, 0);
  assert.deepEqual(
    s.members.alice.account.charges.map((c) => c.paid),
    [7500, 7500, 5000, 0],
  );
});
test("trop-versé consommé automatiquement à l’échéance suivante", () => {
  let s = fixture();
  s = command(s, "operationSave", payment("p1", "alice", 20000));
  assert.equal(s.members.alice.account.credit, 5000);
  assert.equal(s.members.alice.account.due, 0);
  s = command(s, "refresh", {}, "2026-12-01");
  assert.equal(s.members.alice.account.due, 10000);
  assert.equal(s.members.alice.account.credit, 0);
  assert.equal(cashBalance(s), 30000);
});
test("avance personnelle, annulation d’un avoir consommé, sans impact espèces", () => {
  let s = fixture();
  s = command(
    s,
    "operationSave",
    expense("e1", 60000, {
      payer: "member",
      memberId: "alice",
      awardCredit: true,
    }),
  );
  assert.equal(cashBalance(s), 10000);
  assert.equal(s.members.alice.account.credit, 45000);
  assert.equal(publicData(s).operations.e1, undefined);
  assert.equal(publicData(s).expenses.e1.fromCash, false);
  s = command(s, "operationCancel", { operationId: "e1", reason: "Erreur" });
  assert.equal(s.members.alice.account.due, 15000);
  assert.equal(cashBalance(s), 10000);
});
test("remboursement partiel d’avoir, plafonds et annulation", () => {
  let s = fixture();
  s = command(s, "operationSave", payment("p1", "alice", 30000));
  s = command(s, "operationSave", {
    id: "r1",
    type: "refund",
    memberId: "alice",
    amount: 10000,
    date: "2026-10-01",
    reason: "Départ",
  });
  assert.equal(cashBalance(s), 30000);
  assert.equal(s.members.alice.account.credit, 5000);
  assert.throws(
    () =>
      command(s, "operationSave", {
        id: "r2",
        type: "refund",
        memberId: "alice",
        amount: 6000,
        date: "2026-10-01",
        reason: "Solde",
      }),
    /Avoir disponible/,
  );
  s = command(s, "operationCancel", { operationId: "r1", reason: "Erreur" });
  assert.equal(s.members.alice.account.credit, 15000);
  assert.equal(cashBalance(s), 40000);
});
test("imputation manuelle prioritaire et correction du bénéficiaire", () => {
  let s = fixture("2026-12-01");
  s = command(
    s,
    "memberSave",
    { id: "bob", name: "Bob", firstDueMonth: "2026-10" },
    "2026-12-01",
  );
  s = command(
    s,
    "operationSave",
    payment("p1", "alice", 7500, { priority: ["2026-12"] }),
    "2026-12-01",
  );
  assert.equal(
    s.members.alice.account.charges.find((c) => c.month === "2026-12").paid,
    7500,
  );
  s = command(
    s,
    "operationSave",
    payment("p1", "bob", 7500, { reason: "Mauvaise personne" }),
    "2026-12-01",
  );
  assert.equal(cashBalance(s), 17500);
  assert.equal(s.members.alice.account.due, 30000);
  assert.equal(s.members.bob.account.due, 22500);
  assert.equal(JSON.stringify(publicData(s)).includes("alice"), false);
  assert.equal(JSON.stringify(publicData(s)).includes("bob"), false);
});
test("pause rétroactive, restauration et départ/réintégration", () => {
  let s = fixture();
  s = command(s, "operationSave", payment("p1", "alice", 15000));
  s = command(s, "memberPeriods", {
    memberId: "alice",
    absences: [{ from: "2026-11", to: "2027-01" }],
    reason: "Absence",
  });
  assert.equal(s.members.alice.account.credit, 7500);
  s = command(s, "refresh", {}, "2026-12-01");
  assert.equal(s.members.alice.account.due, 0);
  s = command(
    s,
    "memberPeriods",
    { memberId: "alice", absences: [], reason: "Retour" },
    "2026-12-01",
  );
  assert.equal(s.members.alice.account.due, 15000);
  s = command(
    s,
    "memberPeriods",
    {
      memberId: "alice",
      terms: [
        { from: "2026-10", to: "2026-11" },
        { from: "2027-04", to: null },
      ],
      reason: "Départ et retour",
    },
    "2027-04-01",
  );
  assert.equal(s.members.alice.account.due, 15000);
  assert.equal(s.members.alice.status, "Actif");
});
test("tarif daté inchangé pour le passé et changement à cheval sur une période", () => {
  let s = fixture();
  s = command(s, "settings", {
    rate: { from: "2027-01", amount: 8000 },
    reason: "Nouveau tarif",
  });
  s = command(s, "refresh", {}, "2026-12-01");
  assert.equal(s.members.alice.charges["2026-12"].amount, 7500);
  assert.equal(s.members.alice.charges["2027-01"].amount, 8000);
  assert.throws(
    () =>
      command(
        s,
        "settings",
        { rate: { from: "2027-01", amount: 9000 }, reason: "Erreur" },
        "2026-12-01",
      ),
    /déjà émise/,
  );
});
test("contrôle mémorisé, écart sans correction automatique", () => {
  let s = fixture();
  s = command(s, "control", {
    mode: "denominations",
    counts: { 10000: 0, 5000: 1 },
  });
  const c = Object.values(s.controls)[0];
  assert.equal(c.theoretical, 10000);
  assert.equal(c.physical, 5000);
  assert.equal(c.difference, -5000);
  assert.equal(cashBalance(s), 10000);
  s = command(s, "operationSave", {
    id: "a1",
    type: "adjustment",
    label: "Écart de caisse",
    amount: 5000,
    direction: "out",
    date: "2026-10-01",
    reason: "Comptage confirmé",
  });
  assert.equal(cashBalance(s), 5000);
  assert.equal(Object.values(s.controls)[0].theoretical, 10000);
  assert.equal(JSON.stringify(publicData(s)).includes("counts"), false);
});
test("remboursements liés, plafond, annulation dépendante et événements", () => {
  let s = fixture();
  s = command(s, "eventSave", { id: "ev", name: "Repas", date: "2026-10-01" });
  s = command(s, "operationSave", expense("e1", 60000, { eventId: "ev" }));
  s = command(s, "operationSave", {
    id: "r1",
    type: "reimbursement",
    label: "Intendance",
    expenseId: "e1",
    amount: 45000,
    date: "2026-10-01",
  });
  assert.equal(publicData(s).events.ev.net, 15000);
  assert.equal(publicData(s).expenses.e1.net, 15000);
  assert.throws(
    () =>
      command(s, "operationCancel", { operationId: "e1", reason: "Erreur" }),
    /remboursements liés/,
  );
  assert.throws(
    () =>
      command(s, "operationSave", {
        id: "r2",
        type: "reimbursement",
        label: "Trop",
        expenseId: "e1",
        amount: 20000,
        date: "2026-10-01",
      }),
    /dépassent/,
  );
});
test("reprise dette/avoir sans mouvement caisse et appel sans sélection", () => {
  let s = fixture("2026-09-28");
  s = command(
    s,
    "memberSave",
    { id: "bob", name: "Bob", firstDueMonth: "2026-10", openingCredit: 20000 },
    "2026-09-28",
  );
  s = command(
    s,
    "memberSave",
    {
      id: "charlie",
      name: "Charlie",
      firstDueMonth: "2026-10",
      openingDebt: 12000,
    },
    "2026-09-28",
  );
  assert.equal(cashBalance(s), 10000);
  s = command(s, "call", { start: "2026-10", memberIds: [] });
  assert.equal(s.members.bob.account.credit, 5000);
  assert.equal(s.members.charlie.account.due, 27000);
  assert.equal(s.members.alice.account.due, 15000);
  assert.equal(s.calls["2026-10"].members.length, 0);
});
test("données privées absentes de toutes les projections publiques", () => {
  let s = fixture();
  s = command(
    s,
    "operationSave",
    payment("p1", "alice", 20000, { comment: "secret-identite", eventId: "" }),
  );
  s = command(
    s,
    "operationSave",
    expense("e1", 2000, {
      receiptPath: "receipts/e1/secret.pdf",
      comment: "secret-document",
    }),
  );
  const json = JSON.stringify(publicData(s));
  for (const value of [
    "secret",
    "alice",
    "uid",
    "memberId",
    "receiptPath",
    "comment",
    "priority",
    "reason",
  ])
    assert.equal(json.includes(value), false, value);
});
test("formats invalides, mois, dates, montants et historique protégé", () => {
  const s = fixture();
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(todayAtGabon(new Date("2026-09-30T23:30:00Z")), "2026-10-01");
  for (const amount of [-1, 0, 1.5, NaN, Infinity, "15000"])
    assert.throws(
      () => command(s, "operationSave", payment("p", "alice", amount)),
      /Montant invalide/,
    );
  assert.throws(
    () =>
      command(
        s,
        "operationSave",
        payment("p", "alice", 100, { date: "2026-02-30" }),
      ),
    /Date invalide/,
  );
  assert.throws(
    () => command(s, "memberDelete", { memberId: "alice" }),
    /historique/,
  );
});

test('adhésion actuelle distincte de la première échéance à reprendre', () => {
  let s = fixture('2026-09-28');
  s = command(s, 'memberSave', {
    id: 'bob', name: 'Bob', firstDueMonth: '2026-10', joinMonth: '2026-09',
  }, '2026-09-28');
  assert.equal(s.members.bob.status, 'Actif');
  assert.equal(s.members.bob.account.due, 0);
  s = command(s, 'refresh');
  assert.equal(s.members.bob.account.due, 15000);
});

test('appels nets des paiements et avoirs, y compris les échéances intermédiaires', () => {
  let s = fixture('2026-09-28');
  s = command(s, 'memberSave', { id: 'alice', name: 'Alice', firstDueMonth: '2026-10', openingCredit: 20000, reason: 'Reprise' }, '2026-09-28');
  s = command(s, 'call', { start: '2026-10', memberIds: ['alice'] }, '2026-09-28');
  assert.equal(s.calls['2026-10'].members[0].amount, 0);
  s = command(s, 'call', { start: '2026-12', memberIds: ['alice'] }, '2026-09-28');
  assert.equal(s.calls['2026-12'].members[0].amount, 10000);
  s = command(s, 'call', { start: '2026-10', memberIds: ['alice'] });
  assert.equal(s.calls['2026-10'].members[0].amount, 0);
  assert.equal(s.members.alice.account.credit, 5000);
  assert.equal(cashBalance(s), 10000);
});
