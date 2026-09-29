// Read-only Firebase snapshot + local simulation. Deliberately no apply mode.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCsv, prepareMigration } from '../functions/src/migration2026.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.length !== 1 || !['--live-read-only','--fixture'].includes(args[0])) {
  console.error('Usage: node scripts/prepare-migration-2026.mjs --live-read-only | --fixture\nAucune écriture Firebase, aucun mode apply.'); process.exit(1);
}
const dir = path.join(root, 'docs/reprise-2026');
const files = ['02-operations-proposees.csv','03-soldes-adherents.csv'];
const inputHashes = {}; const sources = {};
const expected = JSON.parse(await fs.readFile(path.join(dir, 'manifest-validation.json'), 'utf8'));
for (const name of files) {
  const data = await fs.readFile(path.join(dir, name));
  inputHashes[name] = createHash('sha256').update(data).digest('hex');
  if (inputHashes[name] !== expected.files[name]) throw new Error(`Dossier modifié depuis validation : ${name}`);
  sources[name] = parseCsv(data.toString('utf8'));
}
const sourceSha = createHash('sha256').update(await fs.readFile(path.join(root,'Comptes Bar.xlsx'))).digest('hex');
let snapshot, capturedAt = new Date().toISOString();
if (args[0] === '--fixture') {
  snapshot = JSON.parse(await fs.readFile(path.join(root,'functions/test/fixtures/migration-baseline.json'),'utf8'));
} else {
  const require = createRequire(new URL('../package.json', import.meta.url));
  const backend = createRequire(new URL('../functions/package.json', import.meta.url));
  const cli = require('firebase-tools/lib/auth');
  const account = cli.getProjectDefaultAccount(root);
  if (!account) throw new Error('Connexion Firebase CLI requise.');
  const token = await cli.getAccessToken(account.tokens.refresh_token, []);
  const { GoogleAuth, OAuth2Client } = backend('google-auth-library');
  const { Firestore } = backend('@google-cloud/firestore');
  const client = new OAuth2Client();
  client.setCredentials({ access_token: token.access_token, expiry_date: Date.now()+3000000 });
  const db = new Firestore({ projectId:'ma-compta-bar-gap', auth:new GoogleAuth({authClient:client,projectId:'ma-compta-bar-gap'}) });
  try {
    // Consistent snapshot, including ownership, audit and existing projections.
    snapshot = await db.runTransaction(async tx => {
      const collections = ['config','members','operations','controls','events','calls','users','audit','migrations','publicSummary','publicOperations','publicExpenses','publicEvents','publicControls'];
      const results = await Promise.all(collections.map(c => tx.get(db.collection(c))));
      return Object.fromEntries(results.flatMap(s => s.docs.map(d => [d.ref.path,d.data()])));
    }, {readOnly:true});
  } finally { await db.terminate(); }
}
const out = path.join(root,'.migration-previews',args[0]==='--fixture'?'fixture':capturedAt.replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true,mode:0o700});
await fs.writeFile(path.join(out,'snapshot-before.json'),JSON.stringify({project:'ma-compta-bar-gap',capturedAt,fixture:args[0]==='--fixture',documents:snapshot},null,2),{mode:0o600});
const plan = prepareMigration({snapshot,operations:sources[files[0]],balances:sources[files[1]],sourceSha,inputHashes});
await fs.writeFile(path.join(out,'prepared-plan.json'),JSON.stringify({...plan,capturedAt},null,2),{mode:0o600});
const report = ['# Simulation de migration (aucune injection)', '', `Lot : ${plan.batch}`, `Empreinte : ${plan.planHash}`, `Documents proposés : ${Object.keys(plan.documents).length}`, 'Caisse : 10 000 FCFA. Avance GAP : 30 000 FCFA.', '', '| Adhérent | Dette au 30/09 | Avoir au 30/09 |', '|---|---:|---:|', ...plan.reconciliation.map(m=>`| ${m.name} | ${m.due} | ${m.credit} |`), '', '| Adhérent | Appel octobre–novembre | Dette après appel | Avoir restant |', '|---|---:|---:|---:|', ...plan.forecast.map(m=>`| ${m.name} | ${m.octoberNovember} | ${m.due} | ${m.credit} |`), '', 'Préparation seulement : aucun compte Auth créé, aucune donnée envoyée à Firestore.'].join('\n');
await fs.writeFile(path.join(out,'CONTROLE.md'),report,{mode:0o600});
console.log(JSON.stringify({mode:plan.mode,output:out,planHash:plan.planHash,documents:Object.keys(plan.documents).length,members:plan.reconciliation.length,cash:plan.cash,advancesOutstanding:plan.advancesOutstanding,octoberGross:plan.forecast.reduce((s,m)=>s+m.octoberNovember,0)},null,2));
