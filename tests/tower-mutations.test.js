import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {newTower,towerFor,completeTower,resetTower,validTower,buyTowerInsurance} from '../src/tower/model.js';
import {towerMutationBonus,towerMutationSnapshot,towerMutationSynergies,grantTowerMutationDraft,
 chooseTowerMutation,validTowerMutationState,TOWER_MUTATION_IDS} from '../src/tower/mutations.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {ctx} from '../src/game/state.js';
import {JSDOM} from 'jsdom';

function beatFirstBoss(session){
 for(let i=0;i<5;i++)completeTower(session,0,true,()=>.24);
 return towerFor(session,0);
}
test('winning the first boss offers three saved and distinct mutations',()=>{
 const session=betNewSession(['Сборка'],1000);
 const run=beatFirstBoss(session);
 assert.equal(run.level,6);
 assert.equal(run.wins,5);
 assert.equal(run.preparing,true);
 assert.equal(run.mutations.length,0);
 assert.equal(run.mutationDraft.floor,6);
 assert.equal(run.mutationDraft.options.length,3);
 assert.equal(new Set(run.mutationDraft.options).size,3);
 assert.ok(run.mutationDraft.options.every(id=>TOWER_MUTATION_IDS.includes(id)));
 assert.ok(validTowerMutationState(run));
 assert.ok(validTower(run));
 const saved=structuredClone(run.mutationDraft);
 assert.equal(grantTowerMutationDraft(run,()=>.99),false,'cannot reroll an existing draft');
 assert.deepEqual(run.mutationDraft,saved);
 assert.equal(chooseTowerMutation(run,'nonexistent'),false);
 assert.equal(chooseTowerMutation(run,run.mutationDraft.options[0]),true);
 assert.equal(run.mutations.length,1);
 assert.equal(run.mutationDraft,undefined);
 assert.equal(validTower(run),true);
 assert.equal(chooseTowerMutation(run,run.mutations[0]),false,'cannot acquire twice');
});
test('mechanical and biological sets grant actual fractional skill points',()=>{
 assert.deepEqual(towerMutationBonus([]),[0,0,0]);
 assert.deepEqual(towerMutationBonus(['turbo']),[.55,0,0]);
 assert.deepEqual(towerMutationBonus(['turbo','servo']),[.75,0,.75]);
 assert.deepEqual(towerMutationBonus(['adrenal','predator']),[.35,.8,.45]);
 assert.deepEqual(towerMutationSynergies(['turbo','piston']),['mechanical']);
 assert.deepEqual(towerMutationSynergies(['adrenal','predator']),['organic']);
 assert.deepEqual(towerMutationSynergies(['turbo','predator']),[]);
 const patient={stats:[3,3,3],prosthetics:[],mutations:['turbo','servo']};
 const snapshot=towerMutationSnapshot(patient);
 assert.deepEqual(snapshot.base,[3,3,3],'earned stats unchanged');
 assert.deepEqual(snapshot.effective,[3.75,3,3.75]);
 const normal=towerMutationSnapshot({...patient,mutations:[]});
 assert.deepEqual(normal.effective,[3,3,3]);
});
test('mutations survive insured defeat and do not survive an uninsured reset',()=>{
 const s=betNewSession(['ДМС'],1000);
 const t=beatFirstBoss(s),chosen=t.mutationDraft.options[0];
 assert.equal(chooseTowerMutation(t,chosen),true);
 assert.equal(buyTowerInsurance(s,0),50);
 assert.deepEqual(t.insurance.checkpoint.mutations,[chosen]);
 const restored=completeTower(s,0,false);
 assert.equal(restored.level,6);
 assert.deepEqual(restored.mutations,[chosen]);
 assert.equal(restored.mutationDraft,undefined);
 assert.equal(restored.insurance.checkpoint,null);
 assert.ok(validTower(restored));
 const fresh=completeTower(s,0,false);
 assert.deepEqual(fresh.mutations,[]);
 assert.equal(fresh.level,1);
 assert.deepEqual(resetTower(s,0).mutations,[]);
});
test('pending mutation draft survives DMS checkpoint and must still be chosen',()=>{
 const session=betNewSession(['Черновик'],1000);
 const run=beatFirstBoss(session),draft=structuredClone(run.mutationDraft);
 buyTowerInsurance(session,0);
 assert.deepEqual(run.insurance.checkpoint.mutationDraft,draft);
 assert.equal(chooseTowerMutation(run,draft.options[0]),true);
 assert.deepEqual(run.insurance.checkpoint.mutationDraft,draft,'checkpoint is independent of subsequent choices');
 const restored=completeTower(session,0,false);
 assert.equal(restored.level,6);
 assert.deepEqual(restored.mutations,[]);
 assert.deepEqual(restored.mutationDraft,draft);
 assert.equal(chooseTowerMutation(restored,draft.options[1]),true);
 assert.deepEqual(restored.mutations,[draft.options[1]]);
 assert.ok(validTower(restored));
});
test('old stored runs and policies without mutation fields still load correctly',()=>{
 const dom=new JSDOM('',{url:'https://tower-mutation-legacy.test/'});
 const previous={localStorage:globalThis.localStorage,store:ctx.BET_STORAGE};
 globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='tower-mutation-legacy';
 try{
  const session=betNewSession(['Старый'],1000),run=towerFor(session,0);
  run.level=3;run.wins=2;run.record=2;
  // Restore valid earned points for a v2 historical run.
  run.stats=[4,4,3];
  delete run.mutations;
  const legacy=JSON.parse(JSON.stringify(session));
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(legacy));
  const loaded=bettingLoad();
  assert.ok(loaded,'older save must not be discarded');
  assert.deepEqual(towerFor(loaded,0).mutations,[]);
  ctx.betting=loaded;bettingSave();
  assert.ok(bettingLoad());
 }finally{
  ctx.BET_STORAGE=previous.store;globalThis.localStorage=previous.localStorage;
  dom.window.close();
 }
});
