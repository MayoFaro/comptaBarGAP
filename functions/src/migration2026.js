/** Pure migration preparation. No Firebase connection and no writes. */
import { createHash } from 'node:crypto';
import { emptyState, ensure, refresh, cashBalance, publicData, addMonths, money, date } from './domain.js';
export const BATCH = 'excel_2026_v1';
export const SOURCE_SHA = 'cb25f89c6f611f2cb507951727678cc8208e44109e7c7bcf8820aaaf47aa1271';
export const PAUSED = ['PESTOU', 'PROVOT', 'RAMAHOLISON', 'BERANTO', 'BOLLIET'];
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function parseCsv(source) {
  source = source.replace(/^\uFEFF/, '');
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (c === ';' || c === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else cell += c;
  }
  ensure(!quoted, 'CSV : guillemets non fermés.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const headers = rows.shift(); ensure(headers && new Set(headers).size === headers.length, 'En-têtes CSV invalides.');
  return rows.map(r => { ensure(r.length === headers.length, 'Nombre de colonnes CSV invalide.'); return Object.fromEntries(headers.map((h, i) => [h, r[i]])); });
}
const integer = (s) => { ensure(/^-?\d+$/.test(String(s)), 'Montant CSV invalide.'); const n = Number(s); ensure(Number.isSafeInteger(n), 'Entier invalide.'); return n; };
const signed = (s) => { const n = integer(s); money(Math.abs(n), true); return n; };
const id = (s) => `${BATCH}_${s.replaceAll('-', '_')}`;
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_');

export function prepareMigration({ snapshot, operations, balances, sourceSha, inputHashes }) {
  ensure(sourceSha === SOURCE_SHA, 'Le classeur diffère de la source validée.');
  ensure(!snapshot[`migrations/${BATCH}`], 'Ce lot a déjà été importé.');
  const settings = snapshot['config/settings'];
  ensure(settings?.openingDate === '2026-09-29' && settings.openingBalance === 10000 && settings.firstDueMonth === '2026-10', 'Initialisation modifiée : nouveau rapprochement nécessaire.');
  const oldMembers = Object.entries(snapshot).filter(([p]) => p.startsWith('members/'));
  ensure(oldMembers.length >= 1, 'Gestionnaire absent.');
  for (const prefix of ['operations/', 'events/', 'controls/', 'calls/'])
    ensure(!Object.keys(snapshot).some(p => p.startsWith(prefix)), 'Des opérations ou événements existent : nouveau rapprochement nécessaire.');
  ensure(balances.length === 21 && new Set(balances.map(b => b.adherent)).size === 21, 'Liste des 21 adhérents invalide.');
  const reference = Object.fromEntries(balances.map(b => [b.adherent, b]));
  ensure(signed(reference.DEPERROIS?.solde_final_reprise_fcfa) === 144210 && signed(reference.PARE?.solde_final_reprise_fcfa) === 17830 && signed(reference['LE CAM']?.solde_final_reprise_fcfa) === 500, 'Corrections finales non validées.');
  const existingByName = new Map();
  for (const [path, m] of oldMembers) {
    ensure(reference[m.name] && !existingByName.has(m.name), 'Fiche supplémentaire ou nom ambigu : rapprocher avant import.');
    ensure(!m.openingDebt && !m.openingCredit && !Object.values(m.charges ?? {}).some(c => c.amount), 'Une fiche possède déjà un solde ou des cotisations : rapprochement requis.');
    ensure(m.firstDueMonth === '2026-10', 'Première échéance modifiée.');
    existingByName.set(m.name, { ...m, id: path.split('/')[1] });
  }
  const administrator = existingByName.get('DEPERROIS');
  ensure(administrator?.id === 'administrator' && administrator.uid === snapshot['config/access']?.adminUid, 'Correspondance du gestionnaire invalide.');
  ensure(snapshot[`users/${administrator.uid}`]?.memberId === 'administrator', 'Lien du compte administrateur invalide.');
  const state = emptyState();
  state.settings = { ...structuredClone(settings), openingDate: '2026-01-01', openingBalance: 454000, migration: { batch: BATCH, sourceSha } };
  const mapping = {}; const stamp = '2026-09-29T00:00:00.000Z';
  for (const b of balances) {
    const previous = existingByName.get(b.adherent);
    const memberId = previous?.id ?? `historique_${slug(b.adherent)}`;
    ensure(!state.members[memberId], 'Collision de fiches.'); mapping[b.adherent] = memberId;
    const opening = signed(b.solde_ouverture_excel_fcfa);
    state.members[memberId] = {
      ...previous, id: memberId, name: b.adherent, email: previous?.email ?? '', uid: previous?.uid ?? '', accessUid: previous?.accessUid ?? '',
      openingDebt: Math.max(0, -opening), openingCredit: Math.max(0, opening), firstDueMonth: '2026-10',
      terms: [{ from: '2026-01', to: null }],
      absences: PAUSED.includes(b.adherent) ? [{ from: '2026-10', to: null }] : [],
      charges: {}, createdAt: previous?.createdAt ?? stamp,
      migration: { batch: BATCH, sourceSha, note: 'Période administrative reconstituée, pas une date réelle d’adhésion. Appels historiques figés. Statuts octobre validés.' },
    };
  }
  const eventIds = { 'Repas du 17 août': `${BATCH}_repas_aout`, 'Dégustation de vins': `${BATCH}_degustation_vins` };
  state.events[eventIds['Repas du 17 août']] = { id: eventIds['Repas du 17 août'], name: 'Repas du 17 août', date: '2026-08-17', description: '' };
  state.events[eventIds['Dégustation de vins']] = { id: eventIds['Dégustation de vins'], name: 'Dégustation de vins', date: '2026-09-15', description: '' };
  const information = []; const seen = new Set(); let calls = 0;
  for (const row of operations) {
    ensure(!seen.has(row.id), 'Ligne proposée dupliquée.'); seen.add(row.id);
    const amount = integer(row.montant_fcfa); money(amount, true); date(row.date);
    ensure(row.date >= '2026-01-01' && row.date <= '2026-09-22', 'Date hors reprise.');
    const memberId = row.adherent_excel ? mapping[row.adherent_excel] : '';
    ensure(!row.adherent_excel || memberId, 'Adhérent non associé.');
    const provenance = { batch: BATCH, sourceSha, rowId: row.id, lines: row.lignes_excel, originalDate: row.date_excel, note: row.note, originalLabel: row.libelle };
    if (row.nature === 'absence_appel_sans_montant') { ensure(amount === 0 && signed(row.delta_caisse_fcfa) === 0 && signed(row.delta_compte_fcfa) === 0, 'Information non nulle.'); information.push(provenance); continue; }
    if (row.nature === 'appel_historique') {
      ensure(memberId && amount === 15000 && signed(row.delta_compte_fcfa) === -15000 && signed(row.delta_caisse_fcfa) === 0, 'Appel historique invalide.');
      const [from, to] = row.periode.split('/'); ensure(['2026-02', '2026-04', '2026-06', '2026-08'].includes(from) && to === addMonths(from, 1), 'Période historique invalide.');
      for (const p of [from, to]) {
        ensure(!state.members[memberId].charges[p], 'Double appel historique.');
        state.members[memberId].charges[p] = { month: p, rate: 7500, amount: 7500, exempt: false, dueDate: `${from}-01`, historical: true, migration: provenance };
      }
      calls++; continue;
    }
    const types = { paiement_cotisation: 'payment', depense_caisse: 'expense', depense_personnelle_avec_avoir: 'expense', remboursement_depense: 'reimbursement', vente_boissons: 'income', remboursement_avoir: 'refund', avance_a_recuperer: 'advance' };
    const type = types[row.nature]; ensure(type && amount > 0, 'Nature non prise en charge.');
    const payer = type === 'expense' ? (memberId ? 'member' : 'cash') : '';
    const expectedCash = ['payment','reimbursement','income'].includes(type) ? amount : type === 'refund' || type === 'advance' || payer === 'cash' ? -amount : 0;
    const expectedAccount = type === 'payment' || payer === 'member' ? amount : type === 'refund' ? -amount : 0;
    ensure(expectedCash === signed(row.delta_caisse_fcfa) && expectedAccount === signed(row.delta_compte_fcfa), 'Effets incompatibles avec le moteur comptable.');
    const label = type === 'payment' ? 'Cotisation' : type === 'refund' ? 'Remboursement d’avoir' : row.libelle || 'Achat pour l’association';
    const category = /café|intendance|thés/i.test(label) ? 'Café' : /vin|repas|crepe|déj|cake|croissant|chandeleur|boisson|croque/i.test(label) ? 'Alimentation' : 'Autre';
    const opId = id(row.id);
    state.operations[opId] = { id: opId, type, date: row.date, amount, label,
      memberId, payer, awardCredit: payer === 'member', category: type === 'expense' ? category : '',
      eventId: eventIds[row.evenement] ?? '', expenseId: row.lien_operation ? id(row.lien_operation) : '', advanceId: '',
      comment: row.note, priority: [], receiptPath: '', direction: '', cancelled: false, revision: 1,
      createdAt: stamp, updatedAt: stamp, reason: 'Reprise Excel validée', migration: provenance };
  }
  ensure(operations.length === 159 && calls === 62 && information.length === 3 && Object.keys(state.operations).length === 94, 'Périmètre de reprise incomplet.');
  for (const o of Object.values(state.operations).filter(o => o.type === 'reimbursement')) {
    const expense = state.operations[o.expenseId]; ensure(expense?.type === 'expense', 'Remboursement sans achat.');
    const total = Object.values(state.operations).filter(r => r.type === 'reimbursement' && r.expenseId === expense.id).reduce((s, r) => s + r.amount, 0);
    ensure(total <= expense.amount, 'Remboursement supérieur à achat.');
    o.category = expense.category; o.eventId = expense.eventId;
  }
  refresh(state, '2026-09-30');
  const reconciliation = balances.map(b => {
    const m = state.members[mapping[b.adherent]], actual = m.account.credit - m.account.due;
    ensure(actual === signed(b.solde_final_reprise_fcfa), `Solde divergent : ${b.adherent}.`);
    return { name: b.adherent, id: m.id, due: m.account.due, credit: m.account.credit, expected: signed(b.solde_final_reprise_fcfa) };
  });
  ensure(cashBalance(state) === 10000, 'Caisse divergente.');
  const projected = publicData(state);
  ensure(projected.summary.advancesOutstanding === 30000, 'Avance GAP divergente.');
  const publicJson = JSON.stringify(projected);
  for (const name of Object.keys(mapping)) ensure(!publicJson.includes(name), 'Nom privé dans les projections publiques.');
  const october = refresh(structuredClone(state), '2026-10-01');
  const forecast = Object.values(october.members).map(m => ({ name: m.name, status: m.status, octoberNovember: ['2026-10','2026-11'].reduce((n, p) => n + (m.charges[p]?.amount ?? 0), 0), due: m.account.due, credit: m.account.credit }));
  for (const m of forecast) ensure(m.octoberNovember === (PAUSED.includes(m.name) ? 0 : 15000), 'Échéance octobre incorrecte.');
  const documents = { 'config/settings': state.settings, 'publicSummary/current': projected.summary };
  for (const collection of ['members','operations','events']) for (const [key,value] of Object.entries(state[collection])) documents[`${collection}/${key}`] = value;
  for (const [key,collection] of Object.entries({operations:'publicOperations',expenses:'publicExpenses',events:'publicEvents'})) for (const [k,v] of Object.entries(projected[key])) documents[`${collection}/${k}`] = v;
  const baselineHash = digest(snapshot);
  const planHash = digest({ baselineHash, inputHashes, documents });
  documents[`migrations/${BATCH}`] = { batch: BATCH, sourceSha, inputHashes, baselineHash, planHash, information, mapping, expectedCash: 10000, forecast, status: 'prepared' };
  return { batch: BATCH, mode: 'PREPARATION_ONLY', planHash, baselineHash, inputHashes, mapping, reconciliation, forecast, cash:10000, advancesOutstanding:30000, documents, state };
}
