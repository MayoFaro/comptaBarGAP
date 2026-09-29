// This harness applies the prepared plan ONLY to disposable local emulators.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeApp as clientApp, deleteApp as deleteClient } from 'firebase/app';
import { getAuth as clientAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { prepareMigration, parseCsv, SOURCE_SHA, BATCH } from '../src/migration2026.js';
const projectId='demo-comptes-bar-gap';
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8080');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9099');
assert.equal(process.env.GCLOUD_PROJECT,projectId);
process.env.METADATA_SERVER_DETECTION='none';
test('chargement émulateur : transaction, recalcul serveur, accès admin et remboursement GAP',async()=>{
  const app=initializeApp({projectId},'migration-stage'), db=getFirestore(app), auth=getAuth(app);
  db.settings({universeDomain:'googleapis.com'});
  let client;
  try {
    const reset=await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,{method:'DELETE'});assert.equal(reset.ok,true);
    try{await auth.deleteUser('fixture-admin')}catch(e){if(e.code!=='auth/user-not-found')throw e}
    await auth.createUser({uid:'fixture-admin',email:'admin@example.test',emailVerified:true,password:'Local-migration-123!'});
    const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/migration-baseline.json',import.meta.url),'utf8'));
    const load=name=>parseCsv(fs.readFileSync(new URL(`../../docs/reprise-2026/${name}`,import.meta.url),'utf8'));
    const plan=prepareMigration({snapshot,operations:load('02-operations-proposees.csv'),balances:load('03-soldes-adherents.csv'),sourceSha:SOURCE_SHA,inputHashes:{fixture:'emulator'}});
    // Preserve the existing Auth link and settings in the same way as a future migration.
    const seed=db.batch();for(const [p,v] of Object.entries(snapshot))seed.set(db.doc(p),v);await seed.commit();
    await db.runTransaction(async tx=>{
      assert.equal((await tx.get(db.doc(`migrations/${BATCH}`))).exists,false);
      for(const [p,v] of Object.entries(plan.documents))tx.set(db.doc(p),v);
      tx.set(db.doc(`migrations/${BATCH}`),{status:'complete'},{merge:true});
      tx.set(db.doc('config/revision'),{revision:'emulator-migration',commandId:BATCH});
    });
    assert.equal((await db.collection('members').get()).size,21);
    assert.equal((await db.doc('publicSummary/current').get()).data().balance,10000);
    assert.equal((await db.doc('members/administrator').get()).data().account.credit,144210);
    client=clientApp({projectId,apiKey:'demo-key'},'migration-client');
    const ca=clientAuth(client);connectAuthEmulator(ca,'http://127.0.0.1:9099',{disableWarnings:true});await signInWithEmailAndPassword(ca,'admin@example.test','Local-migration-123!');
    const functions=getFunctions(client,'europe-west1');connectFunctionsEmulator(functions,'127.0.0.1',5001);
    const command=httpsCallable(functions,'command');
    await command({id:'migration_refresh_001',action:'refresh',payload:{}});
    assert.equal((await db.doc('publicSummary/current').get()).data().balance,10000);
    const before=(await db.doc('members/administrator').get()).data();
    assert.equal(before.charges['2026-08'].amount,7500);
    await assert.rejects(command({id:'migration_cancel_001',action:'operationCancel',payload:{operationId:`${BATCH}_excel_921`,reason:'Test'}}),/verrouillée/);
    await command({id:'migration_gap_repay_001',action:'operationSave',payload:{id:'gap_return',type:'advanceReturn',advanceId:`${BATCH}_excel_1066`,date:'2026-09-29',amount:30000,label:'Remboursement GAP'}});
    const summary=(await db.doc('publicSummary/current').get()).data();
    assert.equal(summary.balance,40000);assert.equal(summary.advancesOutstanding,0);
    assert.equal((await db.doc('members/administrator').get()).data().account.credit,before.account.credit);
  } finally {if(client)await deleteClient(client);await db.terminate();await deleteApp(app)}
});
