import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession,betCommit,betResolve} from '../src/betting/ledger.js';
import {newGarage,validStats,statMultiplier,critChance,nextPrice,buyHat} from '../src/garage/model.js';
import {mergeFloorPixels} from '../src/render/floor-history.js';

test('one transfer permits exactly the baseline and six specializations',()=>{
 let count=0;for(let a=1;a<=5;a++)for(let b=1;b<=5;b++)for(let c=1;c<=5;c++)if(validStats([a,b,c]))count++;
 assert.equal(count,7);assert.deepEqual(newGarage().map(g=>g.stats),Array.from({length:4},()=>[3,3,3]));
 assert.deepEqual([2,3,4].map(statMultiplier),[.8,1,1.2]);assert.deepEqual([2,3,4].map(critChance),[0,.15,.3]);
});
test('slot bidding spends full price, preserves ledger conservation and rejects invalid purchases atomically',()=>{
 assert.equal(nextPrice({price:100}),110);
 const s=betNewSession(['A','B'],1000);
 buyHat(s,0,0,1,100);assert.equal(nextPrice(s.garage[0].head),110);assert.equal(s.players[0].balance,900);
 buyHat(s,0,1,4,110);assert.equal(nextPrice(s.garage[0].head),130);assert.equal(s.shopSpent,210);
 assert.equal(s.players.reduce((n,p)=>n+p.balance,0)+s.shopSpent,2000);
 const before=JSON.stringify(s);for(const price of [120,1001,NaN,130.5])assert.throws(()=>buyHat(s,0,1,2,price));assert.equal(JSON.stringify(s),before);
 betCommit(s,[{player:0,robot:0,amount:10},{player:1,robot:1,amount:10}]);assert.throws(()=>buyHat(s,1,0,1,10));betResolve(s,0);
 assert.equal(s.players.reduce((n,p)=>n+p.balance,0)+s.shopSpent+s.jackpot,2000);
 s.garage[0].head=null;assert.equal(nextPrice(s.garage[0].head),100);
});
test('baking mutes only new pixels against their local floor and always preserves opaque alpha',()=>{
 const floor=new Uint8ClampedArray([10,20,30,255,40,50,60,255]);const fresh=new Uint8ClampedArray([200,20,10,255,255,255,255,0]);
 const result=mergeFloorPixels(floor,fresh);assert.deepEqual([...result.slice(4)],[40,50,60,255]);
 assert.equal(result[3],255);assert.ok(result[0]>10&&result[0]<200);assert.ok(result[0]-result[1]<180);
 const old=[...result];mergeFloorPixels(result,new Uint8ClampedArray(8));assert.deepEqual([...result],old);
});

test('shop expenses and permanent builds survive save/load, including legacy saves',async()=>{
 const {ctx}=await import('../src/game/state.js');const {bettingLoad,bettingSave}=await import('../src/betting/storage.js');
 const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
 ctx.BET_STORAGE='garage-test';ctx.betStorageAvailable=true;ctx.betting=betNewSession(['Player'],1000);
 buyHat(ctx.betting,2,0,3,100);ctx.betting.garage[2].stats=[3,4,2];ctx.betting.garage[2].generation=3;bettingSave();
 const saved=bettingLoad();assert.equal(saved.garage[2].generation,3);assert.equal(saved.players[0].balance,900);assert.equal(saved.garage[2].head.hat,3);assert.deepEqual(saved.garage[2].stats,[3,4,2]);
 const legacy=betNewSession(['Legacy'],100);delete legacy.garage;delete legacy.shopSpent;delete legacy.floorId;
 memory.set(ctx.BET_STORAGE,JSON.stringify(legacy));const migrated=bettingLoad();assert.deepEqual(migrated.garage,newGarage());assert.equal(migrated.shopSpent,0);
});

test('prostheses accumulate only on lost parts and cancellation restores the previous body',async()=>{
 const {patientRecovery,patientDeath,normalizePatient}=await import('../src/garage/model.js');
 const {betRefund}=await import('../src/betting/ledger.js');
 const s=betNewSession(['Player'],100),g=s.garage[0];
 patientRecovery(g,{hasHead:true,missingSegments:['leg-1-lower']});
 patientRecovery(g,{hasHead:true,missingSegments:[]});
 assert.deepEqual(g.prosthetics,['leg-1-lower'],'concussion alone adds no prostheses');
 patientRecovery(g,{hasHead:true,missingSegments:['arm-1-upper','arm-1-lower','tail-0']});
 assert.deepEqual(g.prosthetics,['arm-1-upper','arm-1-lower','leg-1-lower']);
 const saved=structuredClone(g);
 betCommit(s,[{player:0,robot:0,amount:10}]);patientDeath(g);betRefund(s);
 assert.deepEqual(s.garage[0],saved);
 const legacy={stats:[3,3,3],wins:0};normalizePatient(legacy);assert.deepEqual(legacy.prosthetics,[]);
 normalizePatient({...legacy,prosthetics:['head','invalid','leg-1-lower','leg-1-lower']});
 patientRecovery(s.garage[0],{hasHead:false,missingSegments:['leg--1-upper']});
 assert.deepEqual(s.garage[0],saved,'a dead patient cannot acquire new prostheses');
});

test('patient generations advance only on death and stay stable for a battle identity',async()=>{
 const {patientDeath,patientRecovery,normalizePatient,patientVictory}=await import('../src/garage/model.js');
 const {patientIdentity,fighterLabel,patientLetter}=await import('../src/game/patients.js');
 const {ctx}=await import('../src/game/state.js');
 const previous={mode:ctx.mode,betting:ctx.betting,robots:ctx.robots};
 try{
  ctx.mode='spectator';ctx.betting=betNewSession(['Player'],100);ctx.robots=[];
  const patient=ctx.betting.garage[0];delete patient.generation;normalizePatient(patient);
  assert.equal(patientIdentity(0),'A');
  patientRecovery(patient,{hasHead:true,missingSegments:[]});patientVictory(patient);
  assert.equal(patientIdentity(0),'A');
  ctx.robots=[{patientIdentity:patientIdentity(0)}];patientDeath(patient);
  assert.equal(fighterLabel(0),'A');assert.equal(patientIdentity(0),'A-1');
  ctx.robots=[];assert.equal(fighterLabel(0),'A-1');
  patientDeath(patient);assert.equal(fighterLabel(0),'A-2');
  assert.equal(patientLetter(25),'Z');assert.equal(patientLetter(26),'AA');
 }finally{Object.assign(ctx,previous);}
});
