import { before, after, test } from "node:test";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  updateDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
let env;
before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-comptes-bar-gap",
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync("../firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync("../storage.rules", "utf8"),
    },
  });
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await Promise.all([
      setDoc(doc(db, "config/access"), { adminUid: "admin" }),
      setDoc(doc(db, "config/settings"), { name: "GAP" }),
      setDoc(doc(db, "members/alice"), {
        uid: "alice",
        name: "Alice",
        account: { credit: 5000 },
      }),
      setDoc(doc(db, "members/bob"), {
        uid: "bob",
        name: "Bob",
        account: { credit: 1000 },
      }),
      setDoc(doc(db, "users/alice"), { memberId: "alice", role: "MEMBER" }),
      setDoc(doc(db, "operations/pay"), {
        memberId: "alice",
        comment: "secret",
      }),
      setDoc(doc(db, "publicOperations/pay"), {
        label: "Cotisation",
        amount: 15000,
      }),
      setDoc(doc(db, "publicSummary/current"), { balance: 10000 }),
      setDoc(doc(db, "controls/c1"), { counts: { 10000: 1 } }),
    ]);
    await uploadBytes(
      ref(ctx.storage(), "receipts/e1/file.pdf"),
      new Uint8Array([37, 80, 68, 70]),
      { contentType: "application/pdf" },
    );
  });
});
after(async () => {
  await env.cleanup();
});
test("public : lecture des projections, aucun accès aux comptes ou écritures privées", async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDocs(collection(db, "publicOperations")));
  await assertSucceeds(getDoc(doc(db, "publicSummary/current")));
  for (const path of [
    "members/alice",
    "operations/pay",
    "controls/c1",
    "config/settings",
    "users/alice",
  ])
    await assertFails(getDoc(doc(db, path)));
});
test("adhérent : son compte uniquement, aucune écriture directe ni élévation de rôle", async () => {
  const db = env.authenticatedContext("alice").firestore();
  await assertSucceeds(getDoc(doc(db, "members/alice")));
  await assertSucceeds(getDoc(doc(db, "users/alice")));
  await assertFails(getDoc(doc(db, "members/bob")));
  await assertFails(getDocs(collection(db, "members")));
  await assertFails(updateDoc(doc(db, "users/alice"), { role: "ADMIN" }));
  await assertFails(setDoc(doc(db, "operations/new"), { amount: 1 }));
  await assertFails(
    updateDoc(doc(db, "members/alice"), { "account.credit": 999999 }),
  );
});
test("administrateur : lecture privée, mutations financières uniquement par serveur", async () => {
  const db = env.authenticatedContext("admin").firestore();
  await assertSucceeds(getDocs(collection(db, "members")));
  await assertSucceeds(getDoc(doc(db, "operations/pay")));
  await assertFails(setDoc(doc(db, "operations/new"), { amount: 1 }));
  await assertFails(
    setDoc(doc(db, "publicOperations/fake"), { amount: 99999 }),
  );
});
test("justificatifs : lecture et upload réservés à l’admin, formats limités", async () => {
  const admin = env.authenticatedContext("admin").storage();
  await assertSucceeds(getBytes(ref(admin, "receipts/e1/file.pdf")));
  await assertSucceeds(
    uploadBytes(ref(admin, "receipts/e2/file.png"), new Uint8Array([1]), {
      contentType: "image/png",
    }),
  );
  await assertFails(
    uploadBytes(ref(admin, "receipts/e2/file.html"), new Uint8Array([1]), {
      contentType: "text/html",
    }),
  );
  for (const ctx of [
    env.unauthenticatedContext(),
    env.authenticatedContext("alice"),
  ]) {
    await assertFails(getBytes(ref(ctx.storage(), "receipts/e1/file.pdf")));
    await assertFails(
      uploadBytes(
        ref(ctx.storage(), "receipts/e2/fake.png"),
        new Uint8Array([1]),
        { contentType: "image/png" },
      ),
    );
  }
});
test("passation : les droits de l’ancien administrateur cessent immédiatement", async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    updateDoc(doc(ctx.firestore(), "config/access"), { adminUid: "bob" }),
  );
  await assertFails(
    getDoc(
      doc(env.authenticatedContext("admin").firestore(), "operations/pay"),
    ),
  );
  await assertSucceeds(
    getDoc(doc(env.authenticatedContext("bob").firestore(), "operations/pay")),
  );
  await assertFails(
    getBytes(
      ref(env.authenticatedContext("admin").storage(), "receipts/e1/file.pdf"),
    ),
  );
});
