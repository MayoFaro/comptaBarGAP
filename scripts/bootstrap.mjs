// Run from repo root: node scripts/bootstrap.mjs --emulator
// For production: GOOGLE_APPLICATION_CREDENTIALS=... GCLOUD_PROJECT=... ADMIN_EMAIL=... node scripts/bootstrap.mjs
import { createRequire } from "node:module";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const local = process.argv.includes("--emulator");
if (local) {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
  process.env.METADATA_SERVER_DETECTION = "none";
  process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
}
const projectId = local ? "demo-comptes-bar-gap" : process.env.GCLOUD_PROJECT;
const email = local ? "admin@gap.test" : process.env.ADMIN_EMAIL;
if (!projectId || !email)
  throw new Error("GCLOUD_PROJECT et ADMIN_EMAIL sont requis.");
// Optional local CLI credentials stay in memory; no service-account key is written.
let credential;
let cliFirestore;
if (!local && process.argv.includes("--firebase-cli")) {
  const rootRequire = createRequire(new URL("../package.json", import.meta.url));
  const cliAuth = rootRequire("firebase-tools/lib/auth");
  const account = cliAuth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error("Connectez le CLI avec firebase login.");
  const { GoogleAuth, OAuth2Client } = require("google-auth-library");
  const { Firestore } = require("@google-cloud/firestore");
  const token = await cliAuth.getAccessToken(account.tokens.refresh_token, []);
  const client = new OAuth2Client();
  client.setCredentials({ access_token: token.access_token, expiry_date: Date.now() + 3000000 });
  client.refreshHandler = async () => {
    const fresh = await cliAuth.getAccessToken(account.tokens.refresh_token, []);
    return { access_token: fresh.access_token, expiry_date: Date.now() + 3000000 };
  };
  cliFirestore = new Firestore({ projectId, auth: new GoogleAuth({ authClient: client, projectId }) });
  credential = {
    async getAccessToken() {
      const token = await cliAuth.getAccessToken(account.tokens.refresh_token, []);
      return { access_token: token.access_token, expires_in: 3600 };
    },
  };
}
initializeApp({ projectId, ...(credential ? { credential } : {}) });
const db = cliFirestore ?? getFirestore(),
  auth = getAuth();
if (local) db.settings({ universeDomain: "googleapis.com" });
if ((await db.doc("config/access").get()).exists)
  throw new Error(
    "Administrateur déjà initialisé. Utilisez la passation dans l’application.",
  );
let user;
try {
  user = await auth.getUserByEmail(email);
} catch (error) {
  if (error.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({
    email,
    ...(local ? { password: "Gap-local-2026!", emailVerified: true } : {}),
  });
}
await db.runTransaction(async (tx) => {
  const access = await tx.get(db.doc("config/access"));
  if (access.exists)
    throw new Error("Initialisation concurrente : administrateur déjà créé.");
  tx.set(access.ref, {
    adminUid: user.uid,
    createdAt: new Date().toISOString(),
  });
  tx.set(db.doc(`users/${user.uid}`), { role: "ADMIN", memberId: "" });
});
console.log(
  local
    ? "Accès local : admin@gap.test / Gap-local-2026!"
    : "Administrateur initial enregistré. Utilisez « Mot de passe oublié » puis vérifiez votre email.",
);

await db.terminate();
