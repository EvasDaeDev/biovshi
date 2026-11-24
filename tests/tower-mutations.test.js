import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {newTower,towerFor,completeTower,resetTower,validTower,buyTowerInsurance} from '../src/tower/model.js';
import {towerMutationBonus,towerMutationSnapshot,towerMutationSynergies,grantTowerMutationDraft,
 chooseTowerMutation,validTowerMutationState,TOWER_MUTATION_IDS,TOWER_MUTATIONS,TOWER_MUTATION_FAMILIES,
 towerMutationCombatBonus} from '../src/tower/mutations.js';
import {towerFighterCombatBonus} from '../src/systems/combat.js';
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
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 assert.equal(run.mutationInventory.length,1);
 assert.equal(run.mutations.length,0,'claim is not installation');
 assert.equal(run.mutationDraft,undefined);
 assert.equal(validTower(run),true);
 assert.equal(chooseTowerMutation(run,run.mutationInventory[0].type),false,'cannot claim without a pending reward');
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
test('expanded module catalogue has eighteen distinct choices across three compatible families',()=>{
 assert.equal(TOWER_MUTATION_IDS.length,18);
 for(const family of ['mechanical','organic','neural']){
  assert.equal(TOWER_MUTATION_IDS.filter(id=>TOWER_MUTATIONS[id].family===family).length,6);
  assert.ok(TOWER_MUTATION_FAMILIES[family]);
 }
 assert.ok(TOWER_MUTATION_IDS.every(id=>TOWER_MUTATIONS[id].bonus.length===3));
 assert.deepEqual(towerMutationSynergies(['optic','synapse']),['neural']);
 assert.deepEqual(towerMutationBonus(['optic','synapse']),[.5,.2,.55]);
 assert.deepEqual(towerMutationBonus(['turbo','servo','optic','synapse']),[1.25,.2,1.3]);
});
test('neural combat perks affect only the controlled Tower patient',()=>{
 const ids=['optic','focus','quiet','synapse','metronome','alarm','flywheel'];
 assert.deepEqual(towerMutationCombatBonus([]),{crit:0,cooldownMultiplier:1});
 assert.deepEqual(towerMutationCombatBonus(ids),{crit:.075,cooldownMultiplier:.86});
 const previous={mode:ctx.mode,garage:ctx.towerGarage};
 try{
  ctx.mode='tower';ctx.towerGarage=[{mutations:ids},{mutations:ids}];
  assert.deepEqual(towerFighterCombatBonus(0),{crit:.075,cooldownMultiplier:.86});
  assert.deepEqual(towerFighterCombatBonus(1),{crit:0,cooldownMultiplier:1});
  ctx.mode='spectator';
  assert.deepEqual(towerFighterCombatBonus(0),{crit:0,cooldownMultiplier:1});
 }finally{ctx.mode=previous.mode;ctx.towerGarage=previous.garage;}
});
test('new boss drafts include a chance to complete an existing one-piece synergy',()=>{
 const s=betNewSession(['Улучшения'],1000);
 const t=towerFor(s,0);
 t.level=11;t.wins=10;t.mutations=['turbo'];t.mutationInventory=[{id:'m1',type:'turbo',rarity:0,obtainedAt:5}];t.equippedMutations=['m1'];t.nextMutationId=2;
 const rolled=grantTowerMutationDraft(t,()=>0);
 assert.equal(rolled,true);
 assert.equal(t.mutationDraft.options.length,3);
 assert.ok(t.mutationDraft.options.some(id=>TOWER_MUTATIONS[id].family==='mechanical'));
 assert.ok(!t.mutationDraft.options.includes('turbo'));
 assert.equal(grantTowerMutationDraft(t,()=>1),false,'pending choice must not be rerolled');
});
test('legacy one- or two-option boss offers survive catalogue expansion intact',()=>{
 const owned=TOWER_MUTATION_IDS.slice(0,5);
 const one={level:31,mutations:owned,mutationDraft:{floor:31,options:[TOWER_MUTATION_IDS[5]]}};
 assert.equal(validTowerMutationState(one),true);
 const two={...one,mutationDraft:{floor:31,options:[TOWER_MUTATION_IDS[5],TOWER_MUTATION_IDS[6]]}};
 assert.equal(validTowerMutationState(two),true);
 assert.equal(validTowerMutationState({...one,mutationDraft:{floor:31,options:[]}}),false);
});
test('mutations survive insured defeat and do not survive an uninsured reset',()=>{
 const s=betNewSession(['ДМС'],1000);
 const t=beatFirstBoss(s),chosen=t.mutationDraft.options[0];
 assert.ok(chooseTowerMutation(t,chosen));
 assert.equal(buyTowerInsurance(s,0),300);
 assert.deepEqual(t.insurance.checkpoint.mutations,[]);
 assert.equal(t.insurance.checkpoint.mutationInventory[0].type,chosen);
 const restored=completeTower(s,0,false);
 assert.equal(restored.level,6);
 assert.deepEqual(restored.mutations,[]);
 assert.equal(restored.mutationInventory[0].type,chosen);
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
 assert.ok(chooseTowerMutation(run,draft.options[0]));
 assert.deepEqual(run.insurance.checkpoint.mutationDraft,draft,'checkpoint is independent of subsequent choices');
 const restored=completeTower(session,0,false);
 assert.equal(restored.level,6);
 assert.deepEqual(restored.mutations,[]);
 assert.deepEqual(restored.mutationDraft,draft);
 assert.ok(chooseTowerMutation(restored,draft.options[1]));
 assert.deepEqual(restored.mutations,[]);
 assert.equal(restored.mutationInventory[0].type,draft.options[1]);
 assert.ok(validTower(restored));
});
test('a pending milestone offer is durable through storage, cannot be rerolled and rejects invalid drafts',()=>{
 const dom=new JSDOM('',{url:'https://tower-mutation-pending.test/'});
 const prior={storage:globalThis.localStorage,key:ctx.BET_STORAGE,session:ctx.betting};
 globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='tower-mutation-pending';
 try{
  const s=betNewSession(['Сохранение'],1000),t=beatFirstBoss(s);
  const draft=structuredClone(t.mutationDraft);
  ctx.betting=s;bettingSave();
  const restored=bettingLoad();
  assert.ok(restored);
  const run=towerFor(restored,0);
  assert.deepEqual(run.mutationDraft,draft);
  assert.equal(grantTowerMutationDraft(run,()=>.99),false);
  assert.deepEqual(run.mutationDraft,draft);
  assert.equal(validTowerMutationState({...run,mutations:['turbo','turbo']}),false);
  assert.equal(validTowerMutationState({...run,mutationDraft:{...draft,floor:7}}),false);
  assert.equal(validTowerMutationState({...run,mutationDraft:{...draft,options:[draft.options[0],draft.options[0]]}}),false);
  assert.ok(chooseTowerMutation(run,draft.options[0]));
  assert.equal(validTower(run),true);
  ctx.betting=restored;bettingSave();
  assert.equal(towerFor(bettingLoad(),0).mutationInventory[0].type,draft.options[0]);
 }finally{
  ctx.BET_STORAGE=prior.key;ctx.betting=prior.session;
  globalThis.localStorage=prior.storage;dom.window.close();
 }
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
