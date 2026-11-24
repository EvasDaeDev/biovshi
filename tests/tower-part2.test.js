import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor,completeTower,validTower,buyTowerInsurance,normalizeTower} from '../src/tower/model.js';
import {chooseTowerMutation,equipTowerMutation,removeTowerMutation,towerMutationInstallPrice,
 towerInstalledItems,towerRarityMultiplier,validTowerMutationState,towerMutationEffectText,TOWER_MUTATIONS} from '../src/tower/mutations.js';
import {towerCycleInfo,towerFloorLabel} from '../src/tower/cycles.js';
import {towerRelationPlan,towerAllies,towerTeamMembers,towerTeamFocus,towerRelationLabel,validTowerRelations} from '../src/tower/relations.js';
import {towerUpgradeRarity,towerRarityMatrix} from '../src/tower/upgrade-appearance.js';
import {towerMutationBonus} from '../src/tower/mutations.js';
import {purchaseTowerSurgery,towerSurgeryPrice,towerSurgeryReplacePrice} from '../src/tower/surgery.js';
import {awardTowerDonors} from '../src/tower/donors.js';
import {ensureTowerFloorPlan} from '../src/tower/floors.js';

const session=(capital=5000)=>betNewSession(['Пациент'],capital);
function advance(s,to){
 while(towerFor(s,0).level<to){const t=towerFor(s,0);
  if(t.mutationDraft)chooseTowerMutation(t,t.mutationDraft.options[0]);
  delete t.cycleNotice;completeTower(s,0,true,()=>.37);
 }
 return towerFor(s,0);
}
test('boss reward is saved, claimed exactly once, and not installed for free',()=>{
 const s=session(2000),t=advance(s,6),bank=s.players[0].balance;
 assert.equal(t.mutationDraft.options.length,3);
 assert.deepEqual(t.mutations,[]);
 const draft=structuredClone(t.mutationDraft),id=draft.options[0];
 assert.equal(chooseTowerMutation(t,'unknown'),false);
 assert.deepEqual(t.mutationDraft,draft);
 const item=chooseTowerMutation(t,id);
 assert.equal(item.type,id);assert.equal(chooseTowerMutation(t,id),false);
 assert.equal(s.players[0].balance,bank);
 assert.deepEqual(t.mutations,[]);assert.deepEqual(t.equippedMutations,[]);
 assert.equal(t.mutationInventory.length,1);assert.equal(t.mutationDraft,undefined);
 assert.equal(validTower(t),true);
});
test('paid install/remove/reinstall and low bank checks are atomic',()=>{
 const s=session(3500),t=advance(s,6),item=chooseTowerMutation(t,t.mutationDraft.options[0]);
 assert.equal(towerMutationInstallPrice(t),1000);
 assert.equal(equipTowerMutation(s,0,t,item.id),1000);
 assert.equal(s.players[0].balance,2500);assert.deepEqual(t.mutations,[item.type]);
 assert.equal(removeTowerMutation(t,item.id),true);assert.deepEqual(t.mutations,[]);
 assert.equal(towerMutationInstallPrice(t),1550);
 assert.equal(equipTowerMutation(s,0,t,item.id),1550);
 assert.equal(s.players[0].balance,950);
 assert.equal(towerMutationInstallPrice(t),2410);
 assert.equal(removeTowerMutation(t,item.id),true);
 const before=structuredClone(t);
 assert.throws(()=>equipTowerMutation(s,0,t,item.id),/Недостаточно/);
 assert.deepEqual(t,before);assert.equal(validTower(t),true);
});
test('replacing one same-type instance does not stack bonuses or charge twice',()=>{
 const s=session(),t=advance(s,6),item=chooseTowerMutation(t,t.mutationDraft.options[0]);
 equipTowerMutation(s,0,t,item.id);
 const more={id:'m2',type:item.type,rarity:2,obtainedAt:35};
 t.mutationInventory.push(more);t.nextMutationId=3;
 assert.throws(()=>equipTowerMutation(s,0,t,more.id),/Выбери/);
 const before=s.players[0].balance;
 const price=equipTowerMutation(s,0,t,more.id,item.id);
 assert.equal(before-s.players[0].balance,price);
 assert.deepEqual(t.mutations,[item.type]);assert.deepEqual(t.equippedMutations,[more.id]);
 assert.equal(towerInstalledItems(t)[0].rarity,2);assert.equal(validTower(t),true);
});
test('DMS holds an independent ownership/equipment snapshot without refund',()=>{
 const s=session(),t=advance(s,6),item=chooseTowerMutation(t,t.mutationDraft.options[0]);
 equipTowerMutation(s,0,t,item.id);buyTowerInsurance(s,0);
 assert.deepEqual(t.insurance.checkpoint.equippedMutations,[item.id]);
 removeTowerMutation(t,item.id);
 const restored=completeTower(s,0,false);
 assert.deepEqual(restored.mutations,[item.type]);
 assert.deepEqual(restored.equippedMutations,[item.id]);
 assert.equal(restored.mutationInventory.length,1);
 assert.equal(restored.insurance.checkpoint,null);
 assert.ok(validTower(restored));
});
test('legacy owned/equipped upgrades migrate without imposing charges',()=>{
 const s=session(),t=towerFor(s,0);
 delete t.mutationInventory;delete t.equippedMutations;delete t.nextMutationId;delete t.modInstallations;
 t.mutations=['piston','servo','quiet'];
 normalizeTower(t);
 assert.equal(t.mutationInventory.length,3);
 assert.deepEqual(t.mutations,['piston','servo','quiet']);
 assert.equal(t.modInstallations,0);assert.ok(validTowerMutationState(t));
});
test('30 to A-01 to B-01 and AA-01 use continuous counters and local stats',()=>{
 const s=session(),t=advance(s,30);
 // Ensure the last boss offers one saved reward after the reset.
 const next=completeTower(s,0,true,()=>.43);
 assert.equal(next.level,31);assert.equal(next.wins,30);
 assert.deepEqual(next.stats,[3,3,3]);assert.equal(next.cycleNotice,31);
 assert.equal(towerFloorLabel(next.level),'A-01');
 assert.equal(next.insurance.price,300);assert.equal(next.insurance.checkpoint,null);
 assert.ok(validTower(next));
 const ownedBefore=next.mutationInventory.length;
 const item=chooseTowerMutation(next,next.mutationDraft.options[0]);
 assert.equal(next.mutationInventory.length,ownedBefore+1);
 delete next.cycleNotice;
 assert.equal(towerCycleInfo(61).display,'B-01');
 assert.equal(towerCycleInfo(121).display,'D-01');
 assert.equal(towerCycleInfo(811).display,'AA-01');
 assert.ok(validTower(next));
});
test('post-cycle income is preserved; no reroll of claimed rewards after reload',()=>{
 const s=session(),t=advance(s,31);
 const first=structuredClone(t.mutationDraft),coins=s.players[0].balance;
 const reload=structuredClone(t);normalizeTower(reload);
 assert.deepEqual(reload.mutationDraft,first);
 assert.equal(chooseTowerMutation(reload,first.options[0]).type,first.options[0]);
 assert.equal(reload.mutationDraft,undefined);
 assert.equal(s.players[0].balance,coins);
});
test('replacement surgery is paid once and old donor tissue never returns',()=>{
 const s=session(),t=advance(s,11);
 chooseTowerMutation(t,t.mutationDraft.options[0]);
 awardTowerDonors(t,1,'strong');const donor=t.donorTissues.find(item=>item.kind==='arm');
 const first=purchaseTowerSurgery(s,0,t,'transplant_arm','arm-1-upper',donor.id);
 assert.equal(first,600);assert.equal(t.donorTissues.some(item=>item.id===donor.id),false);
 assert.deepEqual(t.consumedDonorIds,[donor.id]);
 const before=s.players[0].balance;
 const second=purchaseTowerSurgery(s,0,t,'impact','arm-1-upper',null,'arm-1-upper');
 assert.equal(second,towerSurgeryReplacePrice(t));assert.equal(before-s.players[0].balance,second);
 assert.equal(t.surgeries.length,1);assert.equal(t.surgeries[0].procedure,'impact');
 assert.deepEqual(t.surgicalStock,[],'consumed donor tissue is not a reusable ordinary implant');
 assert.ok(t.consumedDonorIds.includes(donor.id));
 assert.ok(validTower(t));
});
test('replacement of ordinary implant goes back to surgical stock',()=>{
 const s=session(),t=advance(s,11);chooseTowerMutation(t,t.mutationDraft.options[0]);
 purchaseTowerSurgery(s,0,t,'impact','arm-1-upper');
 purchaseTowerSurgery(s,0,t,'reflex','arm-1-upper',null,'arm-1-upper');
 assert.equal(t.surgicalStock.length,1);assert.equal(t.surgicalStock[0].procedure,'impact');
 assert.equal(t.surgeries.length,1);assert.ok(validTower(t));
});
test('team relations exclude player, preserve team uniqueness and mix cycles',()=>{
 const a=towerRelationPlan(31,['basic','fast','agile','basic'],()=>.99);
 assert.equal(a.type,'plot');assert.deepEqual(a.teams,[[1,2]]);
 const b=towerRelationPlan(61,['boss','basic','basic'],()=>.99);
 assert.equal(b.type,'hunt');assert.deepEqual(b.hunters,[1]);
 const c=towerRelationPlan(91,['boss','basic','basic'],()=>.99);
 assert.deepEqual(c.teams,[[1,2,3]]);
 assert.ok(validTowerRelations(c,['boss','basic','basic']));
 const run={level:91,floorPlan:{floor:91,selected:0,options:[{relations:c}]}};
 assert.equal(towerAllies(run,1,2),true);assert.equal(towerAllies(run,1,0),false);
});
test('A truce expires at its pre-rolled second; legacy alliances remain valid',()=>{
 const rel=towerRelationPlan(31,['basic','fast','agile','strong'],()=>.5);
 assert.equal(rel.type,'plot');assert.deepEqual(rel.teamUntil,[14]);
 const run={level:31,floorPlan:{floor:31,selected:0,options:[{relations:rel}]}};
 assert.equal(towerAllies(run,1,2,13.99),true);
 assert.equal(towerAllies(run,1,2,14),false);
 assert.deepEqual(towerTeamMembers(run,1,14),[]);
 assert.equal(validTowerRelations(rel,['basic','fast','agile','strong']),true);
 const old={type:'plot',teams:[[1,2]],hunters:[]};
 run.floorPlan.options[0].relations=old;
 assert.equal(towerAllies(run,1,2,200),true,'legacy permanent teams stay intact');
 assert.equal(validTowerRelations({...rel,teamUntil:[NaN]},['basic','fast','agile','strong']),false);
 assert.equal(validTowerRelations({...rel,teamUntil:[7,8]},['basic','fast','agile','strong']),false);
});
test('C teammates share only visible target IDs and respect expiry of tactical focus',()=>{
 const c=towerRelationPlan(91,['boss','basic','basic'],()=>.5);
 const run={level:91,floorPlan:{floor:91,selected:0,options:[{relations:c}]}};
 assert.deepEqual(towerTeamMembers(run,2,10),[1,2,3]);
 assert.deepEqual(towerTeamFocus(run,2,[-1,0,4,0],[0,8,8,8],4),[0]);
 assert.deepEqual(towerTeamFocus(run,2,[-1,0,4,0],[0,8,8,8],9),[]);
 assert.deepEqual(towerTeamFocus(run,2,[-1,0,4,0],[0,8,8,8],4,id=>id!==1),[0]);
 assert.deepEqual(towerTeamFocus(run,0,[-1,0,4,0],[0,8,8,8],4),[]);
});
test('D+ combines saved tactics and keeps boss guards from attacking one another',()=>{
 const d=towerRelationPlan(121,['basic','fast','strong','agile','elite','basic'],()=>.9);
 assert.equal(d.type,'mixed');assert.deepEqual(d.modes,['plot','hunt']);
 assert.ok(d.teamUntil.some(Number.isInteger));assert.ok(d.hunters.length>0);
 assert.match(towerRelationLabel(d),/СГОВОР/);
 const e=towerRelationPlan(151,['boss','basic','basic'],()=>.9);
 assert.deepEqual(e.modes,['hunt','gang']);assert.deepEqual(e.teams,[[1,2,3]]);
 assert.equal(e.teamUntil[0],null);assert.ok(e.hunters.includes(2));
 const f=towerRelationPlan(181,['boss','basic','basic'],()=>.9);
 assert.deepEqual(f.modes,['gang','hunt'],'cannot promise an absent second alliance');
 const run={level:151,floorPlan:{floor:151,selected:0,options:[{relations:e}]}};
 assert.equal(towerAllies(run,1,3,1000),true);
 assert.ok(validTowerRelations(e,['boss','basic','basic']));
 assert.ok(validTowerRelations(f,['boss','basic','basic']));
 assert.equal(validTowerRelations({...e,modes:['plot','plot']},['boss','basic','basic']),false);
});
test('rarity colour is 20% visual and never applies to strength',()=>{
 const color=towerRarityMatrix(2);
 assert.equal(color[0],.8);assert.equal(color[6],.8);assert.equal(color[12],.8);
 const base=towerMutationBonus(['piston']);
 const owned={mutations:['piston'],mutationInventory:[{id:'m1',type:'piston',rarity:2,obtainedAt:36}],equippedMutations:['m1']};
 assert.equal(towerUpgradeRarity(owned,'arm-1-upper'),2);
 assert.deepEqual(towerMutationBonus(owned.mutations),base);
 assert.equal(towerRarityMultiplier(2),1.24,'model only, not combat');
});

test('paid module survives real balance-audited save and reload',async()=>{
 const {bettingLoad,bettingSave}=await import('../src/betting/storage.js');
 const {ctx}=await import('../src/game/state.js');
 const cache=new Map(),previous={storage:globalThis.localStorage,session:ctx.betting,key:ctx.BET_STORAGE,root:ctx.root};
 globalThis.localStorage={getItem:key=>cache.get(key)??null,setItem:(key,value)=>cache.set(key,value)};
 ctx.BET_STORAGE='tower-part2-memory';ctx.root=null;
 try{
  const s=session(5000),t=advance(s,6),item=chooseTowerMutation(t,t.mutationDraft.options[0]);
  equipTowerMutation(s,0,t,item.id);ctx.betting=s;bettingSave({animateBalances:false});
  const restored=bettingLoad();assert.ok(restored,'paid installation passes conservation ledger');
  assert.equal(restored.mutationSpent,1000);
  assert.deepEqual(towerFor(restored,0).mutations,[item.type]);
  assert.equal(restored.players[0].balance,4000);
  const forged=structuredClone(restored);forged.mutationSpent=0;
  cache.set(ctx.BET_STORAGE,JSON.stringify(forged));
  assert.equal(bettingLoad(),null,'erasing a paid installation must not mint money');
 }finally{globalThis.localStorage=previous.storage;ctx.betting=previous.session;ctx.BET_STORAGE=previous.key;ctx.root=previous.root;}
});

test('every module description lists bonuses from the live gameplay model',()=>{
 for(const id of Object.keys(TOWER_MUTATIONS)){
  const text=towerMutationEffectText(id);
  assert.ok(text,'module '+id+' needs a readable numeric summary');
  for(const [index,value] of TOWER_MUTATIONS[id].bonus.entries()){
   if(value<=0)continue;
   const name=['скорость','сила','манёвр'][index];
   assert.ok(text.includes(name+' +'+Number(value.toFixed(2)).toLocaleString('ru-RU')),
    id+' must show its '+name+' stat increase');
  }
 }
 assert.match(towerMutationEffectText('optic'),/манёвр \+0,4/);
 assert.match(towerMutationEffectText('optic'),/крит \+2,5%/);
 assert.match(towerMutationEffectText('optic'),/крит \+2,5% \(прямой бонус\)/);
 assert.match(towerMutationEffectText('piston'),/сила \+0,55 \(шанс крита\)/);
 assert.match(towerMutationEffectText('synapse'),/откат атак −3%/);
});

test('old early-surgery runs remain valid but cannot buy more before second boss',()=>{
 const s=session(5000),t=advance(s,6);
 chooseTowerMutation(t,t.mutationDraft.options[0]);
 t.surgeries=[{site:'arm-1-upper',procedure:'impact'}];
 assert.equal(validTower(t),true,'legacy paid implant remains on the patient');
 const balance=s.players[0].balance;
 assert.throws(()=>purchaseTowerSurgery(s,0,t,'brace','spine-1'),/недоступна/);
 assert.equal(s.players[0].balance,balance);
 assert.deepEqual(t.surgeries,[{site:'arm-1-upper',procedure:'impact'}]);
});
