import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
import {towerFor,completeTower,validTower,buyTowerSurgery,buyTowerInsurance} from '../src/tower/model.js';
import {chooseTowerMutation,towerMutationSnapshot} from '../src/tower/mutations.js';
import {towerSurgeryCapacity,towerSurgeryPrice,towerSurgeryAvailableSites,
 towerSurgeryBonus,validTowerSurgeries,towerSurgerySiteLabel} from '../src/tower/surgery.js';
import {ctx} from '../src/game/state.js';

function advance(session,floor){
 while(towerFor(session,0).level<floor){
  const run=towerFor(session,0);
  if(run.mutationDraft)assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
  completeTower(session,0,true,()=>.1);
 }
 return towerFor(session,0);
}
test('tower surgery unlocks after second boss, with three slots by floor 21',()=>{
 assert.equal(towerSurgeryCapacity(1),0);
 assert.equal(towerSurgeryCapacity(5),0);
 assert.equal(towerSurgeryCapacity(6),0);
 assert.equal(towerSurgeryCapacity(10),0);
 assert.equal(towerSurgeryCapacity(11),1);
 assert.equal(towerSurgeryCapacity(16),2);
 assert.equal(towerSurgeryCapacity(21),3);
 assert.equal(towerSurgeryCapacity(36),3);
 const session=betNewSession(['Оператор'],5000),run=towerFor(session,0);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-upper'),/недоступна/);
 advance(session,6);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-upper'),/недоступна/,
  'boss floor five must NOT unlock surgery');
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-upper'),/недоступна/,
  'choosing first reward does not bypass floor-ten boss requirement');
 advance(session,11);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-upper'),/недоступна/,
  'pending second boss reward still blocks paid operations');
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 assert.equal(towerSurgeryPrice(run),600);
 assert.equal(buyTowerSurgery(session,0,'drive','leg-1-upper'),600);
 assert.deepEqual(run.surgeries,[{site:'leg-1-upper',procedure:'drive'}]);
 assert.equal(session.surgerySpent,600);
 assert.equal(session.players[0].balance,4400);
 assert.equal(towerSurgeryPrice(run),1000);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg--1-upper'),/недоступна/,'cannot exceed available floor slot');
 assert.equal(validTower(run),true);
 advance(session,16);
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 assert.equal(buyTowerSurgery(session,0,'impact','arm--1-lower'),1000);
 assert.equal(session.surgerySpent,1600);
 assert.equal(validTower(run),true);
});
test('specific surgery sites are unique and procedure restrictions cannot be bypassed',()=>{
 assert.equal(towerSurgerySiteLabel('leg--1-upper'),'Нога слева · верхний сегмент');
 assert.equal(towerSurgerySiteLabel('arm-1-lower'),'Рука справа · нижний сегмент');
 const run={level:16,preparing:true,rewarded:[],surgeries:[]};
 assert.equal(towerSurgeryAvailableSites(run,'brace').length,3);
 assert.equal(towerSurgeryAvailableSites(run,'impact').length,4);
 assert.equal(towerSurgeryAvailableSites(run,'drive').length,4);
 assert.equal(validTowerSurgeries([{site:'leg-1-lower',procedure:'drive'}],16),true);
 assert.equal(validTowerSurgeries([{site:'leg-1-lower',procedure:'impact'}],16),false);
 assert.equal(validTowerSurgeries([{site:'arm--1-upper',procedure:'impact'},{site:'arm--1-upper',procedure:'reflex'}],16),false);
 assert.equal(validTowerSurgeries([{site:'bad',procedure:'brace'}],16),false);
 assert.equal(validTowerSurgeries([{site:'leg-1-upper',procedure:'drive'}],5),false);
 const session=betNewSession(['Оператор'],300);
 assert.throws(()=>buyTowerSurgery(session,0,'impact','spine-1'),/недоступна/);
});
test('operated limb bonus disappears when severed and returns when repaired',()=>{
 const patient={stats:[3,3,3],prosthetics:[],mutations:[],surgeries:[
  {site:'leg-1-upper',procedure:'drive'},
  {site:'arm--1-lower',procedure:'impact'},
  {site:'spine-1',procedure:'brace'}
 ]};
 assert.deepEqual(towerSurgeryBonus(patient.surgeries),[.4,.8,.2]);
 assert.deepEqual(towerMutationSnapshot(patient).effective,[3.4,3.8,3.2]);
 const robot={hasHead:true,prosthetics:[],missingSegments:['arm--1-lower','leg-1-upper'],segmentCount:5};
 assert.deepEqual(towerSurgeryBonus(patient.surgeries,robot),[0,.35,.1]);
 assert.deepEqual(towerMutationSnapshot(patient,robot).effective,[3,3.35,3.1]);
 robot.missingSegments=[];
 assert.deepEqual(towerMutationSnapshot(patient,robot).effective,[3.4,3.8,3.2]);
 robot.hasHead=false;
 assert.deepEqual(towerSurgeryBonus(patient.surgeries,robot),[0,0,0]);
});
test('paid surgery cannot debit an insufficient bank or forge repeated site charges',()=>{
 const session=betNewSession(['Касса'],25),run=advance(session,11);
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 const before=structuredClone(session);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-lower'),/Недостаточно/);
 assert.deepEqual(session,before);
 session.players[0].balance=1000;session.topUps=975;
 assert.equal(buyTowerSurgery(session,0,'drive','leg-1-lower'),600);
 const paid=structuredClone(session);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-lower'),/недоступна/);
 assert.deepEqual(session,paid);
});
test('surgery is stored as a monetary sink, DMS restores it and old saves still load',()=>{
 const dom=new JSDOM('',{url:'https://tower-surgery.test/'});
 const previous={storage:globalThis.localStorage,key:ctx.BET_STORAGE,betting:ctx.betting};
 globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='tower-surgery-test';
 try{
  const s=betNewSession(['Пациент'],5000),t=advance(s,11);
  assert.ok(chooseTowerMutation(t,t.mutationDraft.options[0]));
  assert.equal(buyTowerSurgery(s,0,'impact','arm-1-upper'),600);
  assert.equal(buyTowerInsurance(s,0),300);
  assert.deepEqual(t.insurance.checkpoint.surgeries,t.surgeries);
  ctx.betting=s;bettingSave();
  const loaded=bettingLoad();assert.ok(loaded);
  assert.equal(loaded.surgerySpent,600);
  assert.equal(loaded.players[0].balance,4100);
  const insured=completeTower(loaded,0,false);
  assert.deepEqual(insured.surgeries,[{site:'arm-1-upper',procedure:'impact'}]);
  assert.equal(insured.insurance.checkpoint,null);
  assert.equal(validTower(insured),true);
  ctx.betting=loaded;bettingSave();assert.ok(bettingLoad());
  const first=completeTower(loaded,0,false);
  assert.deepEqual(first.surgeries,[],'uninsured run loses surgical procedures');
  ctx.betting=loaded;bettingSave();assert.ok(bettingLoad(),'historical spending remains balanced');
  const tampered=structuredClone(loaded);tampered.surgerySpent=0;
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(tampered));
  assert.equal(bettingLoad(),null,'surgery cost cannot be erased to mint coins');
  const legacy=betNewSession(['Старый'],100),run=towerFor(legacy,0);
  delete run.surgeries;delete legacy.surgerySpent;
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(legacy));
  assert.ok(bettingLoad(),'saved runs before surgery remain readable');
  assert.deepEqual(towerFor(bettingLoad(),0).surgeries,[]);
 }finally{
  ctx.BET_STORAGE=previous.key;ctx.betting=previous.betting;
  globalThis.localStorage=previous.storage;dom.window.close();
 }
});
