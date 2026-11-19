import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {earnedStats,validStats,BASE_STATS} from '../src/garage/model.js';
import {towerFor,completeTower,resetTower} from '../src/tower/model.js';
import {chooseTowerMutation} from '../src/tower/mutations.js';

function advance(session,target){
 while(towerFor(session,0).level<target){
  const tower=towerFor(session,0);
  if(tower.mutationDraft)chooseTowerMutation(tower,tower.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.37);
 }
 return towerFor(session,0);
}

test('chosen Tower skill allocation survives a cycle reset and later floor victories',()=>{
 const session=betNewSession(['Тестер'],2000);
 const run=advance(session,30);
 if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
 const base=earnedStats(29);
 const offsets=[1,-1,0];
 run.stats=base.map((n,i)=>n+offsets[i]);
 assert.ok(validStats(run.stats,29));
 completeTower(session,0,true,()=>.37);
 const cycle=towerFor(session,0);
 assert.equal(cycle.level,31);
 assert.deepEqual(cycle.stats,BASE_STATS.map((n,i)=>n+offsets[i]));
 assert.ok(validStats(cycle.stats,0));
 if(cycle.mutationDraft)chooseTowerMutation(cycle,cycle.mutationDraft.options[0]);
 completeTower(session,0,true,()=>.37);
 assert.deepEqual(cycle.stats,earnedStats(1).map((n,i)=>n+offsets[i]));
 assert.ok(validStats(cycle.stats,1));
});

test('uninsured death and explicit Tower reset return the allocation to defaults',()=>{
 const session=betNewSession(['Тестер'],2000);
 let run=towerFor(session,0);
 run.stats=[4,2,3];
 completeTower(session,0,false);
 assert.deepEqual(towerFor(session,0).stats,BASE_STATS);
 run=towerFor(session,0);run.stats=[2,4,3];
 resetTower(session,0);
 assert.deepEqual(towerFor(session,0).stats,BASE_STATS);
});

test('preferred mobility stays +1 above earned baseline on every newly earned stat point',()=>{
 const session=betNewSession(['Тестер'],2000);
 const run=towerFor(session,0);
 const favored=[0,-1,1]; // extra mobility is paid for by reducing strength
 run.stats=earnedStats(0).map((n,i)=>n+favored[i]);
 assert.ok(validStats(run.stats,0));
 for(let won=1;won<=12;won++){
  if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.37);
  const current=towerFor(session,0);
  assert.deepEqual(current.stats,earnedStats(won).map((n,i)=>n+favored[i]),
   'mobility offset was lost after victory '+won);
  assert.ok(validStats(current.stats,won));
 }
});
