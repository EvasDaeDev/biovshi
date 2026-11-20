import {ctx} from './state.js';
import {BASE_STATS,patientGeneration,statMultiplier} from '../garage/model.js';
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
import {towerMutationSnapshot} from '../tower/mutations.js';
export const patientGarage=()=>ctx.mode==='tower'?ctx.towerGarage:ctx.betting?.garage;
const combatStatsCache=new WeakMap();
const snapshotFor=(patient,robot,id)=>ctx.mode==='tower'&&id===0
 ?towerMutationSnapshot(patient,robot):prostheticStatSnapshot(patient,robot);
export function patientCombatStats(id,robot=ctx.robots?.[id]){
 const patient=patientGarage()?.[id],base=patient?.stats??BASE_STATS;
 if(!robot||!Number.isFinite(robot.segmentCount))return snapshotFor(patient,robot,id);
 const cached=combatStatsCache.get(robot);
 const loadout=JSON.stringify([patient?.equippedSegments,patient?.segmentInventory,patient?.equippedMutations,patient?.mutationInventory]);
 if(cached&&cached.parts===patient?.prosthetics&&cached.segments===robot.segmentCount
   &&cached.hasHead===robot.hasHead&&cached.mutations===(patient?.mutations??[]).join(',')
   &&cached.loadout===loadout
   &&cached.surgeries===JSON.stringify(patient?.surgeries??[])
   &&cached.rarityPhysics===patient?.rarityPhysics
   &&cached.snapshot.base.every((value,index)=>value===base[index]))return cached.snapshot;
 const snapshot=snapshotFor(patient,robot,id);
 combatStatsCache.set(robot,{parts:patient?.prosthetics,segments:robot.segmentCount,hasHead:robot.hasHead,
  mutations:(patient?.mutations??[]).join(','),surgeries:JSON.stringify(patient?.surgeries??[]),
  loadout,
  rarityPhysics:patient?.rarityPhysics,snapshot});
 return snapshot;
}
export function patientMovementMultiplier(id,robot,index){
 const snapshot=patientCombatStats(id,robot);
 return snapshot.effects?.[index]??statMultiplier(snapshot.effective[index]);
}
export const patientSkin=id=>ctx.mode==='tower'&&id===0?ctx.towerRun.patient:id%4;
// Spreadsheet-style letters keep large tower floors readable after Z.
export function patientLetter(id){
 if(!Number.isSafeInteger(id)||id<0)return '—';
 let label='';
 for(let n=id+1;n>0;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;
 return label;
}
export function patientIdentity(id){
 const generation=ctx.mode==='tower'?patientGeneration({generation:ctx.betting?.towerEnemyGenerations?.[id]}):patientGeneration(patientGarage()?.[id]);
 return patientLetter(id)+(generation?`-${generation}`:'');
}
export const fighterLabel=id=>ctx.mode==='tower'&&id===0?ctx.betting.players[ctx.towerPlayer].name
 :ctx.mode==='tower'&&ctx.robots?.[id]?.isBoss?`Босс · ${ctx.robots[id].bossName}`
 :ctx.robots?.[id]?.patientIdentity??patientIdentity(id);
