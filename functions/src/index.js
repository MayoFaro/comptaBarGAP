import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { createHash } from "node:crypto";
import {
  applyCommand,
  emptyState,
  publicData,
  todayAtGabon,
  DomainError,
  ensure,
  text,
  refresh,
} from "./domain.js";

if (process.env.FIRESTORE_EMULATOR_HOST)
  process.env.METADATA_SERVER_DETECTION = "none";
initializeApp();
const db = getFirestore();
if (process.env.FIRESTORE_EMULATOR_HOST)
  db.settings({ universeDomain: "googleapis.com" });
const region = "europe-west1";
const collections = ["members", "operations", "controls", "events", "calls"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
async function load(tx) {
  const [config, ...snapshots] = await Promise.all([
    tx.get(db.doc("config/settings")),
    ...collections.map((c) => tx.get(db.collection(c))),
  ]);
  const state = emptyState();
  state.settings = config.exists ? config.data() : null;
  for (let i = 0; i < collections.length; i++)
    state[collections[i]] = Object.fromEntries(
      snapshots[i].docs.map((d) => [d.id, d.data()]),
    );
  return state;
}
function syncMap(tx, name, before, after) {
  for (const [id, value] of Object.entries(after))
    if (!same(before[id], value)) tx.set(db.collection(name).doc(id), value);
  for (const id of Object.keys(before))
    if (!after[id]) tx.delete(db.collection(name).doc(id));
}
function persist(tx, before, after) {
  if (!same(before.settings, after.settings))
    tx.set(db.doc("config/settings"), after.settings);
  for (const c of collections) syncMap(tx, c, before[c], after[c]);
  const oldPublic = publicData(before),
    next = publicData(after);
  if (!same(oldPublic.summary, next.summary))
    tx.set(db.doc("publicSummary/current"), next.summary);
  for (const [key, name] of Object.entries({
    operations: "publicOperations",
    expenses: "publicExpenses",
    events: "publicEvents",
    controls: "publicControls",
  }))
    syncMap(tx, name, oldPublic[key], next[key]);
}
function businessSnapshot(state) {
  return {
    ...state,
    members: Object.fromEntries(
      Object.entries(state.members).map(([id, m]) => {
        const { account, charges, status, ...data } = m;
        return [id, data];
      }),
    ),
  };
}
function auditDiff(before, after) {
  const a = businessSnapshot(before),
    b = businessSnapshot(after),
    changes = [];
  if (!same(a.settings, b.settings))
    changes.push({
      collection: "config",
      id: "settings",
      before: a.settings,
      after: b.settings,
    });
  for (const c of collections)
    for (const id of new Set([...Object.keys(a[c]), ...Object.keys(b[c])]))
      if (!same(a[c][id], b[c][id]))
        changes.push({
          collection: c,
          id,
          before: a[c][id] ?? null,
          after: b[c][id] ?? null,
        });
  return changes;
}
async function execute(command, uid, authEmail = "", system = false) {
  ensure(
    command && /^[a-zA-Z0-9_-]{8,100}$/.test(command.id ?? ""),
    "Identifiant de commande requis.",
  );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(command))
    .digest("hex");
  return db.runTransaction(async (tx) => {
    const accessRef = db.doc("config/access");
    const [access, existing] = await Promise.all([
      tx.get(accessRef),
      tx.get(db.doc(`audit/${command.id}`)),
      tx.get(db.doc("config/revision")),
    ]);
    if (!system && access.data()?.adminUid !== uid)
      throw new HttpsError(
        "permission-denied",
        "Droits administrateur requis.",
      );
    if (existing.exists) {
      ensure(
        existing.data().actor === uid &&
          existing.data().fingerprint === fingerprint,
        "Cet identifiant de commande a déjà été utilisé.",
      );
      return existing.data().result;
    }
    const before = await load(tx);
    const now = new Date().toISOString(),
      today = todayAtGabon();
    let after;
    if (command.action === "transfer") {
      after = refresh(structuredClone(before), today);
      const member = after.members[command.payload.memberId];
      ensure(
        member?.uid && member.uid !== uid && ["Actif", "En pause"].includes(member.status),
        "Choisissez un autre adhérent actif ayant activé son accès.",
      );
      text(command.payload.reason, "Motif");
      const targetUser = await getAuth().getUser(member.uid);
      ensure(
        !targetUser.disabled && targetUser.emailVerified,
        "Le nouveau gestionnaire doit disposer d’un accès vérifié.",
      );
      tx.update(accessRef, { adminUid: member.uid, updatedAt: now });
      tx.set(db.doc(`users/${uid}`), { role: "MEMBER" }, { merge: true });
      tx.set(
        db.doc(`users/${member.uid}`),
        { role: "ADMIN", memberId: member.id },
        { merge: true },
      );
    } else {
      if (
        command.action === "operationSave" &&
        before.operations[command.payload?.id]
      )
        ensure(
          command.payload.revision ===
            before.operations[command.payload.id].revision,
          "Cette opération a été modifiée. Rechargez-la avant de corriger.",
        );
      after = applyCommand(before, command, { actor: uid, now, today });
      if (command.action === "setup") {
        const memberId = "administrator";
        after = applyCommand(
          after,
          {
            id: `${command.id}_member`,
            action: "memberSave",
            payload: {
              id: memberId,
              name: command.payload.adminName || "Gestionnaire",
              email: authEmail,
              firstDueMonth: after.settings.firstDueMonth,
              joinMonth: after.settings.openingDate.slice(0, 7),
              openingDebt: 0,
              openingCredit: 0,
            },
          },
          { actor: uid, now, today },
        );
        after.members[memberId].uid = uid;
        tx.set(db.doc(`users/${uid}`), { role: "ADMIN", memberId });
      }
    }
    persist(tx, before, after);
    const result = { ok: true, id: command.id };
    tx.set(db.doc(`audit/${command.id}`), {
      actor: uid,
      action: command.action,
      at: now,
      fingerprint,
      reason: command.payload?.reason ?? "",
      result,
      changes: auditDiff(before, after),
      ...(command.action === "transfer"
        ? {
            previousAdmin: uid,
            nextAdmin: after.members[command.payload.memberId].uid,
          }
        : {}),
    });
    // The revision is also a common transaction lock for all financial commands.
    tx.set(db.doc("config/revision"), { revision: now, commandId: command.id });
    return result;
  });
}
export const command = onCall(
  { region, timeoutSeconds: 120, memory: "512MiB", maxInstances: 5 },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Connectez-vous.");
    if (!request.auth.token.email_verified)
      throw new HttpsError(
        "permission-denied",
        "Vérifiez votre adresse email.",
      );
    try {
      return await execute(
        request.data,
        request.auth.uid,
        request.auth.token.email ?? "",
      );
    } catch (error) {
      if (error instanceof DomainError)
        throw new HttpsError("failed-precondition", error.message);
      throw error;
    }
  },
);
// Provision Auth only: private member access is granted after email verification.
export const createMemberAccess = onCall(
  { region, maxInstances: 5 },
  async (request) => {
    if (!request.auth?.token.email_verified)
      throw new HttpsError("permission-denied", "Connectez-vous avec une adresse vérifiée.");
    const memberId = request.data?.memberId;
    if (typeof memberId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(memberId))
      throw new HttpsError("invalid-argument", "Adhérent invalide.");
    const ref = db.doc(`members/${memberId}`);
    const accessRef = db.doc("config/access");
    const [access, member] = await Promise.all([accessRef.get(), ref.get()]);
    if (access.data()?.adminUid !== request.auth.uid)
      throw new HttpsError("permission-denied", "Droits administrateur requis.");
    const email = member.data()?.email;
    if (!email)
      throw new HttpsError("failed-precondition", "Renseignez l’email de la fiche adhérent.");
    let user;
    try {
      user = await getAuth().getUserByEmail(email);
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      try {
        user = await getAuth().createUser({ email });
      } catch (creationError) {
        if (creationError.code !== "auth/email-already-exists") throw creationError;
        user = await getAuth().getUserByEmail(email);
      }
    }
    if (user.disabled)
      throw new HttpsError("failed-precondition", "Ce compte est désactivé dans Firebase.");
    // Auth and Firestore cannot share a transaction. Recheck authority and the
    // member before granting the invitation; a retry reuses the same Auth user.
    await db.runTransaction(async (tx) => {
      const [currentAccess, current, linked] = await Promise.all([
        tx.get(accessRef), tx.get(ref), tx.get(db.doc(`users/${user.uid}`)),
      ]);
      if (currentAccess.data()?.adminUid !== request.auth.uid)
        throw new HttpsError("permission-denied", "Droits administrateur requis.");
      const m = current.data();
      if (!m || m.email !== email ||
          (m.uid && m.uid !== user.uid) ||
          (m.accessUid && m.accessUid !== user.uid) ||
          (linked.data()?.memberId && linked.data().memberId !== memberId))
        throw new HttpsError("failed-precondition", "La fiche ou son accès a changé. Rechargez-la.");
      if (m.accessUid === user.uid || m.uid === user.uid) return;
      const at = new Date().toISOString();
      tx.update(ref, { accessUid: user.uid });
      tx.set(db.collection("audit").doc(), {
        actor: request.auth.uid, action: "createMemberAccess", at,
        changes: [{ collection: "members", id: memberId,
          before: { accessUid: null }, after: { accessUid: user.uid } }],
      });
    });
    return { ok: true };
  },
);
export const activateMyAccount = onCall(
  { region, maxInstances: 5 },
  async (request) => {
    if (!request.auth?.token.email_verified || !request.auth.token.email)
      throw new HttpsError(
        "permission-denied",
        "Vérifiez votre email avant d’activer votre accès.",
      );
    const email = request.auth.token.email.toLowerCase(),
      uid = request.auth.uid;
    return db.runTransaction(async (tx) => {
      const [members, access] = await Promise.all([
        tx.get(db.collection("members").where("email", "==", email)),
        tx.get(db.doc("config/access")),
      ]);
      if (members.size !== 1)
        throw new HttpsError(
          "permission-denied",
          "Demandez au gestionnaire d’associer cet email à votre fiche.",
        );
      const m = members.docs[0];
      if (m.data().accessUid !== uid && m.data().uid !== uid && access.data()?.adminUid !== uid)
        throw new HttpsError("permission-denied", "Demandez au gestionnaire de créer votre accès.");
      if (m.data().uid && m.data().uid !== uid)
        throw new HttpsError(
          "permission-denied",
          "Cette fiche possède déjà un accès.",
        );
      tx.update(m.ref, { uid });
      tx.set(db.doc(`users/${uid}`), {
        memberId: m.id,
        role: access.data()?.adminUid === uid ? "ADMIN" : "MEMBER",
      });
      return { ok: true };
    });
  },
);
export const accrueSubscriptions = onSchedule(
  {
    region,
    schedule: "5 0 * * *",
    timeZone: "Africa/Libreville",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async () => {
    const settings = await db.doc("config/settings").get();
    if (settings.exists)
      await execute(
        { id: `daily_${todayAtGabon()}`, action: "refresh", payload: {} },
        "system",
        "",
        true,
      );
  },
);
