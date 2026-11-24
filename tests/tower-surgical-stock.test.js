import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor,completeTower,buyTowerSurgery,buyTowerInsurance,normalizeTower,validTower} from '../src/tower/model.js';
import {chooseTowerMutation} from '../src/tower/mutations.js';
import {validTowerSurgicalStock,towerSurgeryReplacePrice} from '../src/tower/surgery.js';

function ready(capital=12000){
 const session=betNewSession(['Пациент'],capital),run=towerFor(session,0);
 while(run.level<11){
  if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.19);
 }
 chooseTowerMutation(run,run.mutationDraft.options[0]);
 return {session,run};
}
function stockDrive(session,run){
 buyTowerSurgery(session,0,'drive','leg-1-upper');
 const replacePrice=towerSurgeryReplacePrice(run);
 buyTowerSurgery(session,0,'impact','arm-1-upper',null,'leg-1-upper');
 return replacePrice;
}

test('removed implant returns to stock and paid reuse consumes the exact instance',()=>{
 const {session,run}=ready();
 const price=stockDrive(session,run);
 assert.equal(run.surgicalStock.length,1);
 assert.deepEqual(run.surgicalStock[0],{id:'s1',procedure:'drive',fromSite:'leg-1-upper'});
 assert.equal(run.nextSurgicalStockId,2);
 const before=session.players[0].balance;
 const charged=buyTowerSurgery(session,0,'drive','leg--1-upper',null,'arm-1-upper','s1');
 assert.equal(charged,price,'stock reuse costs the same as a paid replacement');
 assert.equal(session.players[0].balance,before-price);
 assert.equal(run.surgeries.length,1);
 assert.deepEqual(run.surgeries[0],{site:'leg--1-upper',procedure:'drive',stockId:'s1'});
 assert.deepEqual(run.surgicalStock,[{id:'s2',procedure:'impact',fromSite:'arm-1-upper'}]);
 assert.equal(validTower(run),true);
 assert.throws(()=>buyTowerSurgery(session,0,'drive','leg-1-upper',null,'leg--1-upper','s1'),/склада/,
  'already installed stock item cannot be spent a second time');
 const alreadyPaid=structuredClone(session);
 assert.throws(()=>buyTowerSurgery(session,0,'brace','spine-1',null,'leg--1-upper','s2'),/склада/,
  'different operation cannot consume a stored implant');
 assert.deepEqual(session,alreadyPaid,'invalid stock selection cannot affect cash, inventory or anatomy');
});

test('a reused implant retains its ID across removal and later paid installation',()=>{
 const {session,run}=ready();stockDrive(session,run);
 buyTowerSurgery(session,0,'drive','leg--1-upper',null,'arm-1-upper','s1');
 const balance=session.players[0].balance;
 buyTowerSurgery(session,0,'brace','spine-1',null,'leg--1-upper');
 assert.equal(session.players[0].balance,balance-towerSurgeryReplacePrice(run));
 assert.ok(run.surgicalStock.some(item=>item.id==='s1'&&item.procedure==='drive'));
 assert.equal(run.nextSurgicalStockId,3,'reusing s1 does not mint a third implant identity');
 assert.equal(validTowerSurgicalStock(run),true);
});

test('DMS checkpoint preserves stock identity and old checkpoint is consumed once',()=>{
 const {session,run}=ready();stockDrive(session,run);
 const bank=session.players[0].balance;
 assert.equal(buyTowerInsurance(session,0),300);
 assert.deepEqual(run.insurance.checkpoint.surgicalStock,run.surgicalStock);
 assert.equal(run.insurance.checkpoint.nextSurgicalStockId,run.nextSurgicalStockId);
 buyTowerSurgery(session,0,'drive','leg--1-upper',null,'arm-1-upper','s1');
 assert.equal(run.surgicalStock[0].id,'s2');
 const recovered=completeTower(session,0,false);
 assert.deepEqual(recovered.surgicalStock,[{id:'s1',procedure:'drive',fromSite:'leg-1-upper'}]);
 assert.equal(recovered.nextSurgicalStockId,2);
 assert.equal(recovered.insurance.checkpoint,null);
 assert.equal(validTower(recovered),true);
 assert.equal(session.players[0].balance,bank-300-towerSurgeryReplacePrice(run),
  'restoring insured equipment does not refund paid work after the checkpoint');
});

test('legacy saves and old insured checkpoints migrate idempotently without losing implants',()=>{
 const {run}=ready();
 run.surgicalStock=[{procedure:'impact',fromSite:'arm-1-upper'},{procedure:'drive',fromSite:'leg-1-upper'}];
 delete run.nextSurgicalStockId;
 run.insurance.checkpoint={level:11,surgeries:[{site:'arm--1-upper',procedure:'reflex'}],
  surgicalStock:[{procedure:'brace',fromSite:'spine-1'}]};
 normalizeTower(run);
 assert.deepEqual(run.surgicalStock.map(item=>item.id),['s1','s2']);
 assert.equal(run.nextSurgicalStockId,3);
 assert.equal(run.insurance.checkpoint.surgicalStock[0].id,'s1');
 assert.equal(run.insurance.checkpoint.nextSurgicalStockId,2);
 const snapshot=JSON.stringify(run);
 normalizeTower(run);
 assert.equal(JSON.stringify(run),snapshot,'normalizing twice must not create new stock instances');
 assert.equal(validTowerSurgicalStock(run),true);
});

test('forged stock IDs, duplicate usage, and donor implants in stock are rejected',()=>{
 const {session,run}=ready();stockDrive(session,run);
 run.surgicalStock.push({id:'s1',procedure:'drive',fromSite:'leg--1-upper'});
 assert.equal(validTowerSurgicalStock(run),false);
 run.surgicalStock.pop();
 run.surgeries[0].stockId='s1';
 assert.equal(validTowerSurgicalStock(run),false);
 delete run.surgeries[0].stockId;
 run.surgicalStock[0].procedure='transplant_arm';
 assert.equal(validTowerSurgicalStock(run),false,'grafted tissue cannot become reusable property');
});
