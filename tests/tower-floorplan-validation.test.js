import test from 'node:test';
import assert from 'node:assert/strict';
import {ensureTowerFloorPlan,validTowerFloorPlan} from '../src/tower/floors.js';
import {newTower} from '../src/tower/model.js';
test('saved standard and danger choices must share a single arena and reward kinds',()=>{
 const t=newTower(0);t.level=4;t.wins=3;
 const plan=ensureTowerFloorPlan(t,()=>.21);
 assert.equal(validTowerFloorPlan(plan,t.level),true);
 const altered=structuredClone(plan);
 altered.options[1].arenaId=altered.options[0].arenaId==='ward'?'ring':'ward';
 assert.equal(validTowerFloorPlan(altered,t.level),false);
 altered.options[1].arenaId=altered.options[0].arenaId;
 altered.options[0].kind='danger';
 assert.equal(validTowerFloorPlan(altered,t.level),false);
 altered.options[0].kind='standard';altered.options[1].kind='standard';
 assert.equal(validTowerFloorPlan(altered,t.level),false);
});
test('boss floor plans have one boss encounter only',()=>{
 const t=newTower(0);t.level=5;t.wins=4;
 const plan=ensureTowerFloorPlan(t,()=>.2);
 assert.equal(validTowerFloorPlan(plan,t.level),true);
 assert.equal(validTowerFloorPlan({...plan,options:[...plan.options,...plan.options]},5),false);
 assert.equal(validTowerFloorPlan(plan,4),false);
});
