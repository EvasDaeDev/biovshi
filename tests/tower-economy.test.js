import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor,completeTower,validTower,normalizeTower} from '../src/tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor} from '../src/tower/floors.js';
import {applyTowerStatChange,purchaseTowerArenaReroll,towerRerollPrice,towerRerollCandidates} from '../src/tower/economy.js';
import {purchaseInsurance,validInsurance} from '../src/tower/insurance.js';

const setup=(capital=1000)=>{
 const session=betNewSession(['Экономика'],capital),run=towerFor(session,0);
 ensureTowerFloorPlan(run,()=>.1);
 return {session,run};
};
const total=s=>s.players[0].balance+s.shopSpent+s.insuranceSpent+s.surgerySpent+s.towerEconomySpent;

test('every confirmed skill transfer is free and preserves the historical ledger',()=>{
 const {session,run}=setup();
 assert.deepEqual(run.stats,[3,3,3]);assert.equal(session.towerEconomySpent,0);
 const draft=[4,2,3];assert.deepEqual(run.stats,[3,3,3]);
 applyTowerStatChange(run,draft);
 assert.deepEqual(run.stats,draft);assert.equal(session.players[0].balance,1000);
 assert.equal(session.towerEconomySpent,0);
 assert.throws(()=>applyTowerStatChange(run,draft),/Выбери/);
 assert.throws(()=>applyTowerStatChange(run,[3,4,2]),/Выбери/);
 session.towerEconomySpent=50;session.players[0].balance-=50; // Prior charge in a compatible save.
 applyTowerStatChange(run,[3,3,3]);
 assert.equal(session.towerEconomySpent,50);assert.equal(total(session),1000);
 assert.ok(validTower(run));
});

test('a zero bank allows later skill transfers, but blocks paid rerolls',()=>{
 const {session,run}=setup(0);
 applyTowerStatChange(run,[4,2,3]);
 applyTowerStatChange(run,[3,3,3]);
 assert.equal(session.players[0].balance,0);
 const before=structuredClone(run);
 assert.equal(session.towerEconomySpent,0);assert.deepEqual(run,before);
 assert.throws(()=>purchaseTowerArenaReroll(session,0,run,()=>.5),/Недостаточно/);
 assert.deepEqual(run,before);
 session.players[0].balance=1000;run.arenaRerollLocked=true;
 assert.throws(()=>applyTowerStatChange(run,[4,2,3]),/Выбери/);
 assert.throws(()=>purchaseTowerArenaReroll(session,0,run,()=>.5),/Нет другой/);
 assert.equal(session.towerEconomySpent,0);
});

test('G: reroll prices use base formula, with next-floor reset',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>towerRerollPrice(i)),[100,100,100,100,100,100]);
 assert.equal(towerRerollPrice(60),Infinity);
 const {session,run}=setup(1000);
 const old=run.floorPlan.options.map(o=>structuredClone(o));
 const prices=[];
 for(let i=0;i<5;i++){
  const previous=run.floorPlan.options[0].arenaId;
  const result=purchaseTowerArenaReroll(session,0,run,()=>.6);
  prices.push(result.price);
  assert.notEqual(result.arenaId,previous);
  assert.ok(run.floorPlan.options.every(o=>o.arenaId===result.arenaId));
  for(let j=0;j<old.length;j++){
   assert.deepEqual(run.floorPlan.options[j].profiles,old[j].profiles);
   assert.equal(run.floorPlan.options[j].kind,old[j].kind);
   assert.equal(run.floorPlan.options[j].style,old[j].style);
  }
  assert.ok(validTower(run));
 }
 assert.deepEqual(prices,[100,100,100,100,100]);
 assert.equal(session.towerEconomySpent,500);
 assert.equal(total(session),1000);
 completeTower(session,0,true);
 assert.equal(run.arenaRerolls,0);assert.equal(towerRerollPrice(run.arenaRerolls),100);
 assert.ok(validTower(run));
});

test('G: standard and danger use one arena; boss restrictions and zero-alternative handling',()=>{
 const {session,run}=setup(1000);
 const first=run.floorPlan.options[0].arenaId;
 assert.ok(towerRerollCandidates(run).every(id=>id!==first));
 const selected=run.floorPlan.selected=1;
 purchaseTowerArenaReroll(session,0,run,()=>0);
 assert.equal(run.floorPlan.selected,selected);
 assert.equal(selectedTowerFloor(run).arenaId,run.floorPlan.options[0].arenaId);
 for(let i=0;i<4;i++)completeTower(session,0,true,()=>.5);
 ensureTowerFloorPlan(run,()=>.6);
 assert.equal(run.level,5);
 assert.ok(towerRerollCandidates(run).every(id=>['ward','columns'].includes(id)));
 for(let i=0;i<20;i++)completeTower(session,0,true,()=>.5);
 ensureTowerFloorPlan(run,()=>.4);
 assert.equal(run.level,25);
 assert.equal(run.floorPlan.options[0].arenaId,'columns');
 assert.deepEqual(towerRerollCandidates(run),[]);
 const bank=session.players[0].balance;
 assert.throws(()=>purchaseTowerArenaReroll(session,0,run,()=>.1),/Нет другой/);
 assert.equal(session.players[0].balance,bank);
});

test('G: insurance checkpoint retains reroll count, chosen arena and confirmed skill allocation',()=>{
 const {session,run}=setup();
 applyTowerStatChange(run,[4,2,3]);
 purchaseTowerArenaReroll(session,0,run,()=>.3);
 assert.equal(purchaseInsurance(session,0,run),300);
 assert.equal(run.insurance.checkpoint.arenaRerolls,1);
 assert.deepEqual(run.insurance.checkpoint.floorPlan,run.floorPlan);
 assert.deepEqual(run.insurance.checkpoint.stats,[4,2,3]);
 assert.equal(validInsurance(run.insurance,run.record),true);
 completeTower(session,0,false);
 const restored=towerFor(session,0);
 assert.equal(restored.arenaRerolls,1);
 assert.deepEqual(restored.stats,[4,2,3]);
 assert.deepEqual(restored.floorPlan,run.floorPlan);
 assert.equal(session.players[0].balance,600);
 assert.equal(total(session),1000);
 assert.ok(validTower(restored));
});

test('G: legacy save without new counters is normalized and fake counters rejected',()=>{
 const {run}=setup();
 delete run.arenaRerolls;delete run.arenaRerollLocked;
 assert.ok(validTower(normalizeTower(run)));
 run.arenaRerolls=1;delete run.floorPlan;
 assert.equal(validTower(run),false);
 run.arenaRerolls=-1;assert.equal(validTower(run),false);
 run.arenaRerolls=0;run.arenaRerollLocked='false';assert.equal(validTower(run),false);
});
