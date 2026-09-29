import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  initializeApp as adminApp,
  deleteApp as deleteAdminApp,
} from "firebase-admin/app";
import { getAuth as adminAuth } from "firebase-admin/auth";
import { getFirestore as adminDb } from "firebase-admin/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import { todayAtGabon, addMonths } from "../src/domain.js";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-comptes-bar-gap";
process.env.METADATA_SERVER_DETECTION = "none";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const projectId = "demo-comptes-bar-gap";
let app, db, auth;
const clients = [];
let sequence = 0;
const date = todayAtGabon();
let start = date.slice(0, 7);
if (Number(start.slice(5)) % 2) start = addMonths(start, -1);
async function client(uid, verified = true) {
  const email = `${uid}@gap.test`,
    password = "Local-test-123!";
  try {
    await auth.deleteUser(uid);
  } catch (e) {
    if (e.code !== "auth/user-not-found") throw e;
  }
  await auth.createUser({ uid, email, password, emailVerified: verified });
  const app = initializeApp(
    {
      projectId,
      apiKey: "demo-key",
      authDomain: `${projectId}.firebaseapp.com`,
    },
    uid,
  );
  clients.push(app);
  const a = getAuth(app);
  connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  await signInWithEmailAndPassword(a, email, password);
  const f = getFunctions(app, "europe-west1");
  connectFunctionsEmulator(f, "127.0.0.1", 5001);
  return {
    uid,
    auth: a,
    command: async (action, payload = {}, id = `integration_${++sequence}`) =>
      httpsCallable(f, "command")({ id, action, payload }),
    provision: (memberId) => httpsCallable(f, "createMemberAccess")({ memberId }),
    activate: () => httpsCallable(f, "activateMyAccount")(),
  };
}
before(async () => {
  await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  app = adminApp({ projectId }, "integration");
  db = adminDb(app);
  db.settings({ universeDomain: "googleapis.com" });
  auth = adminAuth(app);
});
after(async () => {
  await Promise.all(clients.map(deleteApp));
  await db.terminate();
  await deleteAdminApp(app);
});
test("parcours complet : activation, encaissement, concurrence, contrôle et passation", async () => {
  const admin = await client("integration_admin"),
    alice = await client("integration_alice"),
    stranger = await client("integration_stranger");
  const unverified = await client("integration_unverified", false);
  await assert.rejects(unverified.activate(), /Vérifiez/);
  await assert.rejects(unverified.command("refresh"), /Vérifiez/);
  await db.doc("config/access").set({ adminUid: admin.uid });
  await db.doc(`users/${admin.uid}`).set({ role: "ADMIN", memberId: "" });
  await admin.command("setup", {
    name: "GAP test",
    adminName: "Gestionnaire",
    openingDate: `${start}-01`,
    openingBalance: 10000,
    firstDueMonth: start,
  });
  await admin.command("memberSave", {
    id: "alice",
    name: "Alice privée",
    email: "integration_alice@gap.test",
    firstDueMonth: start,
  });
  await assert.rejects(stranger.activate(), /gestionnaire/);
  await assert.rejects(alice.activate(), /créer votre accès/);
  await assert.rejects(stranger.provision("alice"), /administrateur/);
  await assert.rejects(unverified.provision("alice"), /vérifiée/);
  await Promise.all([admin.provision("alice"), admin.provision("alice")]);
  assert.equal((await db.doc("members/alice").get()).data().accessUid, alice.uid);
  assert.equal((await db.doc(`users/${alice.uid}`).get()).exists, false);
  await alice.activate();
  await admin.command("memberSave", {
    id: "new_access", name: "Nouvel accès", email: "new_access@gap.test",
    firstDueMonth: start,
  });
  try { await auth.deleteUser((await auth.getUserByEmail("new_access@gap.test")).uid); }
  catch (e) { if (e.code !== "auth/user-not-found") throw e; }
  await Promise.all([admin.provision("new_access"), admin.provision("new_access")]);
  const created = await auth.getUserByEmail("new_access@gap.test");
  assert.equal(created.emailVerified, false);
  assert.equal((await db.doc(`users/${created.uid}`).get()).exists, false);
  assert.equal((await db.doc("members/new_access").get()).data().uid, "");
  await admin.command("memberSave", {
    id: "new_access", name: "Nom corrigé", email: "new_access@gap.test",
    firstDueMonth: start, reason: "Correction du nom",
  });
  assert.equal((await db.doc("members/new_access").get()).data().accessUid, created.uid);
  await assert.rejects(admin.command("memberSave", {
    id: "new_access", name: "Nom corrigé", email: "other@gap.test",
    firstDueMonth: start, reason: "Changement email",
  }), /conserve son email/);
  assert.equal(
    (await db.doc(`users/${alice.uid}`).get()).data().memberId,
    "alice",
  );
  await assert.rejects(alice.command("operationSave", {}), /administrateur/);
  const payment = {
    id: "pay",
    type: "payment",
    memberId: "alice",
    amount: 30000,
    date,
    comment: "secret",
  };
  await Promise.all([
    admin.command("operationSave", payment, "same_payment_0001"),
    admin.command("operationSave", payment, "same_payment_0001"),
  ]);
  assert.equal(
    (await db.doc("publicSummary/current").get()).data().balance,
    40000,
  );
  assert.equal(
    (await db.doc("members/alice").get()).data().account.credit,
    15000,
  );
  await assert.rejects(
    admin.command(
      "operationSave",
      { ...payment, amount: 31000 },
      "same_payment_0001",
    ),
    /déjà été utilisé/,
  );
  const refund = (i) => ({
    id: `refund_${i}`,
    type: "refund",
    memberId: "alice",
    amount: 10000,
    date,
    reason: "Départ",
  });
  const outcomes = await Promise.allSettled([
    admin.command("operationSave", refund(1)),
    admin.command("operationSave", refund(2)),
  ]);
  assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
  assert.equal(
    (await db.doc("members/alice").get()).data().account.credit,
    5000,
  );
  assert.equal(
    (await db.doc("publicSummary/current").get()).data().balance,
    30000,
  );
  const pub = JSON.stringify(
    (await db.collection("publicOperations").get()).docs.map((d) => d.data()),
  );
  assert.equal(pub.includes("Alice privée"), false);
  assert.equal(pub.includes("secret"), false);
  assert.equal(pub.includes("memberId"), false);
  await admin.command(
    "control",
    { mode: "simple", physical: 29000 },
    "control_0001",
  );
  assert.equal(
    (await db.doc("publicControls/control_0001").get()).data().difference,
    -1000,
  );
  assert.equal(
    (await db.doc("publicSummary/current").get()).data().balance,
    30000,
  );
  await assert.rejects(
    admin.command("operationSave", {
      ...payment,
      amount: 28000,
      reason: "Correction",
      revision: 0,
    }),
    /modifiée/,
  );
  await admin.command("transfer", {
    memberId: "alice",
    reason: "Passation test",
  });
  await assert.rejects(
    admin.command("control", { mode: "simple", physical: 30000 }),
    /administrateur/,
  );
  await assert.rejects(admin.provision("new_access"), /administrateur/);
  await alice.command("control", { mode: "simple", physical: 30000 });
  assert.equal(
    (await db.doc(`users/${admin.uid}`).get()).data().role,
    "MEMBER",
  );
});
