import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { prepareMigration, parseCsv, SOURCE_SHA, BATCH, PAUSED, digest } from '../src/migration2026.js';
import { applyCommand, refresh, publicData, cashBalance } from '../src/domain.js';
const fixture = JSON.parse(fs.readFileSync(new URL('./fixtures/migration-baseline.json',import.meta.url),'utf8'));
const csv = name => parseCsv(fs.readFileSync(new URL(`../../docs/reprise-2026/${name}`,import.meta.url),'utf8'));
const input = () => ({snapshot:structuredClone(fixture),operations:csv('02-operations-proposees.csv'),balances:csv('03-soldes-adherents.csv'),sourceSha:SOURCE_SHA,inputHashes:{fixture:'test'}});
const cmd = (state,action,payload,today='2026-10-01') => applyCommand(state,{id:'test_migration_0001',action,payload},{today,now:`${today}T10:00:00.000Z`,actor:'fixture-admin'});

test('reprise entière : caisse, 21 comptes, identité, provenance, vie privée et octobre',()=>{
  const args=input(), before=structuredClone(args.snapshot), p=prepareMigration(args);
  assert.deepEqual(args.snapshot,before);
  assert.equal(cashBalance(p.state),10000); assert.equal(p.reconciliation.length,21);
  assert.equal(p.state.members.administrator.uid,'fixture-admin');
  assert.equal(p.state.members.administrator.account.credit,144210);
  assert.equal(p.state.members[p.mapping.PARE].account.credit,17830);
  assert.equal(p.state.members[p.mapping['LE CAM']].account.credit,500);
  assert.equal(Object.keys(p.state.operations).length,94);
  assert.equal(p.state.operations[`${BATCH}_excel_1060`].amount,3000);
  assert.equal(p.state.operations[`${BATCH}_excel_1061`],undefined);
  assert.equal(p.state.operations[`${BATCH}_excel_1065`].amount,2000);
  assert.equal(Object.values(p.state.operations).filter(o=>o.type==='reimbursement'&&o.label.includes('intendance')).reduce((s,o)=>s+o.amount,0),393000);
  assert.equal(publicData(p.state).summary.advancesOutstanding,30000);
  for (const f of p.forecast) assert.equal(f.octoberNovember,PAUSED.includes(f.name)?0:15000);
  const projected=JSON.stringify(publicData(p.state));
  assert.ok(!projected.includes('sourceSha')); assert.ok(!projected.includes('admin@example.test')); assert.ok(!projected.includes('DEPERROIS'));
  assert.equal(p.planHash,prepareMigration(input()).planHash);
  assert.equal(Object.keys(p.documents).some(k=>k.startsWith('users/')),false);
});

test('cotisations historiques immuables après refresh, pause, changement de fiche et passage en 2027',()=>{
  const p=prepareMigration(input()), member=p.state.members[p.mapping.ALLARD];
  const charges=structuredClone(member.charges);
  let state=cmd(p.state,'memberPeriods',{memberId:member.id,absences:[{from:'2026-01',to:'2026-12'}],reason:'Pause'});
  for (const [k,v] of Object.entries(charges)) assert.deepEqual(state.members[member.id].charges[k],v);
  state=cmd(state,'memberSave',{id:member.id,name:'ALLARD',email:'',firstDueMonth:'2026-10',openingDebt:0,openingCredit:5000,reason:'Fiche'});
  refresh(state,'2027-02-01');
  for (const [k,v] of Object.entries(charges)) assert.deepEqual(state.members[member.id].charges[k],v);
  const paused=state.members[p.mapping.PESTOU];
  assert.equal(paused.account.due,0);assert.equal(paused.status,'En pause');
  assert.throws(()=>cmd(p.state,'operationCancel',{operationId:`${BATCH}_excel_921`,reason:'Annulation'}),/historique verrouillée/);
  assert.throws(()=>cmd(p.state,'operationSave',{...p.state.operations[`${BATCH}_excel_921`],reason:'Correction'}),/historique verrouillée/);
});

test('remboursement GAP : créance soldée sans fausse dépense ni cotisation',()=>{
  const p=prepareMigration(input()), before=publicData(p.state).summary;
  const state=cmd(p.state,'operationSave',{id:'repayment_gap',type:'advanceReturn',advanceId:`${BATCH}_excel_1066`,date:'2026-09-29',amount:30000,label:'Remboursement GAP'},'2026-09-30');
  const summary=publicData(state).summary;
  assert.equal(summary.balance,40000); assert.equal(summary.advancesOutstanding,0);
  assert.equal(summary.spending,before.spending);assert.equal(summary.contributions,before.contributions);assert.equal(summary.netCost,before.netCost);
  assert.equal(state.members.administrator.account.credit,144210);
  assert.throws(()=>cmd(state,'operationSave',{id:'excess',type:'advanceReturn',advanceId:`${BATCH}_excel_1066`,date:'2026-09-29',amount:1,label:'Excès'},'2026-09-30'),/dépassent/);
});

test('refus des entrées altérées, sources dupliquées, nouveau solde, données réelles et réimport',()=>{
  const mutations=[
    x=>{x.sourceSha='wrong'},
    x=>{x.operations.push(x.operations[0])},
    x=>{x.operations.find(r=>r.id==='excel-1065').delta_compte_fcfa='0'},
    x=>{x.balances.find(r=>r.adherent==='PARE').solde_final_reprise_fcfa='20830'},
    x=>{x.snapshot['members/administrator'].openingCredit=1},
    x=>{x.snapshot['operations/real']={amount:500}},
    x=>{x.snapshot[`migrations/${BATCH}`]={status:'complete'}},
    x=>{x.snapshot['users/fixture-admin'].memberId='other'},
    x=>{x.snapshot['members/administrator'].name='DPS'},
  ];
  for(const mutate of mutations){const x=input();mutate(x);assert.throws(()=>prepareMigration(x));}
  const p=prepareMigration(input());const x=input();x.snapshot['config/revision']={revision:'changed'};assert.notEqual(p.baselineHash,digest(x.snapshot));
});

test('CSV : BOM, séparateurs, lignes et guillemets dans les commentaires',()=>{
  assert.deepEqual(parseCsv('\uFEFFa;b\r\n"un;deux";"ligne\n""citée"""\r\n'),[{a:'un;deux',b:'ligne\n"citée"'}]);
  assert.throws(()=>parseCsv('a;b\n"non fermé'),/guillemets/);
});
