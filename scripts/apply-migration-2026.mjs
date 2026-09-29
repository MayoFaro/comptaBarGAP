// One-shot production migration. Requires an explicit validated batch.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { BATCH, SOURCE_SHA, digest, parseCsv, prepareMigration } from "../functions/src/migration2026.js";

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv[2] !== "--apply" || process.argv[3] !== BATCH || process.argv.length !== 4)
  throw new Error(`Usage : node scripts/apply-migration-2026.mjs --apply ${BATCH}`);
const require = createRequire(new URL("../package.json", import.meta.url));
const backend = createRequire(new URL("../functions/package.json", import.meta.url));
const cli = require("firebase-tools/lib/auth");
const account = cli.getProjectDefaultAccount(root);
if (!account) throw new Error("Connexion Firebase CLI requise.");
const token = await cli.getAccessToken(account.tokens.refresh_token, []);
const { GoogleAuth, OAuth2Client } = backend("google-auth-library");
const { Firestore } = backend("@google-cloud/firestore");
const client = new OAuth2Client();
client.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 3000000 });
const db = new Firestore({ projectId: "ma-compta-bar-gap",
  auth: new GoogleAuth({ authClient: client, projectId: "ma-compta-bar-gap" }) });
const collections = [
  "config", "members", "operations", "controls", "events", "calls", "users",
  "audit", "migrations", "publicSummary", "publicOperations", "publicExpenses",
  "publicEvents", "publicControls",
];
const readSnapshot = async reader => {
  const snapshots = await Promise.all(collections.map(name => reader.get(db.collection(name))));
  return Object.fromEntries(snapshots.flatMap(s =>
    s.docs.map(document => [document.ref.path, document.data()])));
};

const dossier = path.join(root, "docs/reprise-2026");
const files = ["02-operations-proposees.csv", "03-soldes-adherents.csv"];
const manifest = JSON.parse(
  await fs.readFile(path.join(dossier, "manifest-validation.json"), "utf8"));
const inputHashes = {}, sources = {};
for (const name of files) {
  const data = await fs.readFile(path.join(dossier, name));
  inputHashes[name] = createHash("sha256").update(data).digest("hex");
  if (inputHashes[name] !== manifest.files[name])
    throw new Error(`Dossier modifié depuis validation : ${name}`);
  sources[name] = parseCsv(data.toString("utf8"));
}
const workbook = await fs.readFile(path.join(root, "Comptes Bar.xlsx"));
const sourceSha = createHash("sha256").update(workbook).digest("hex");
if (sourceSha !== SOURCE_SHA) throw new Error("Le classeur source a changé.");

const startedAt = new Date().toISOString();
const backupDir = path.join(root, ".migration-previews",
  `apply-${startedAt.replace(/[:.]/g, "-")}`);
await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
try {
  const before = await db.runTransaction(readSnapshot, { readOnly: true });
  await fs.writeFile(path.join(backupDir, "snapshot-before.json"),
    JSON.stringify({ project: "ma-compta-bar-gap", capturedAt: startedAt,
      documents: before }, null, 2), { mode: 0o600 });
  const plan = prepareMigration({
    snapshot: before,
    operations: sources[files[0]],
    balances: sources[files[1]],
    sourceSha,
    inputHashes,
  });
  await fs.writeFile(path.join(backupDir, "prepared-plan.json"),
    JSON.stringify(plan, null, 2), { mode: 0o600 });
  const completedAt = new Date().toISOString();
  await db.runTransaction(async tx => {
    const current = await readSnapshot(tx);
    if (digest(current) !== plan.baselineHash)
      throw new Error("La production a changé depuis la préparation. Import annulé.");
    if (current[`migrations/${BATCH}`]) throw new Error("Ce lot a déjà été appliqué.");
    for (const [documentPath, value] of Object.entries(plan.documents))
      tx.set(db.doc(documentPath), value);
    tx.set(db.doc(`migrations/${BATCH}`), {
      status: "complete",
      completedAt,
      appliedBy: account.user.email,
      planHash: plan.planHash,
    }, { merge: true });
    tx.set(db.doc(`audit/migration_${BATCH}`), {
      actor: current["config/access"].adminUid,
      action: "migration2026",
      at: completedAt,
      reason: "Reprise Excel 2026 validée par le gestionnaire",
      result: { ok: true, batch: BATCH, planHash: plan.planHash },
      changes: [],
    });
    tx.set(db.doc("config/revision"), {
      revision: completedAt,
      commandId: `migration_${BATCH}`,
    });
  });

  const after = await db.runTransaction(readSnapshot, { readOnly: true });
  const marker = after[`migrations/${BATCH}`];
  const summary = after["publicSummary/current"];
  const members = Object.entries(after).filter(([key]) => key.startsWith("members/"));
  if (marker?.status !== "complete" || marker.planHash !== plan.planHash)
    throw new Error("Le marqueur final de migration est invalide.");
  if (summary?.balance !== 10000 || summary.advancesOutstanding !== 30000)
    throw new Error("Le contrôle final de caisse ou d’avance a échoué.");
  if (members.length !== 21 ||
      after["members/administrator"]?.name !== "DEPERROIS" ||
      after["members/administrator"]?.account?.credit !== 144210)
    throw new Error("Le contrôle final des adhérents a échoué.");
  await fs.writeFile(path.join(backupDir, "snapshot-after.json"),
    JSON.stringify({ project: "ma-compta-bar-gap",
      capturedAt: new Date().toISOString(), documents: after }, null, 2),
    { mode: 0o600 });
  console.log(JSON.stringify({
    status: "complete",
    batch: BATCH,
    planHash: plan.planHash,
    backupDir,
    members: members.length,
    operations: Object.keys(after).filter(key => key.startsWith("operations/")).length,
    cash: summary.balance,
    advancesOutstanding: summary.advancesOutstanding,
  }, null, 2));
} finally {
  await db.terminate();
}
