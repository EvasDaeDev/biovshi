import {ctx} from './state.js';
import {BASE_STATS,patientGeneration} from '../garage/model.js';
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
export const patientGarage=()=>ctx.mode==='tower'?ctx.towerGarage:ctx.betting?.garage;
const combatStatsCache=new WeakMap();
export function patientCombatStats(id,robot=ctx.robots?.[id]){
 const patient=patientGarage()?.[id],base=patient?.stats??BASE_STATS;
 if(!robot||!Number.isFinite(robot.segmentCount))return prostheticStatSnapshot(patient,robot);
 const cached=combatStatsCache.get(robot);
 if(cached&&cached.parts===patient?.prosthetics&&cached.segments===robot.segmentCount
   &&cached.hasHead===robot.hasHead&&cached.snapshot.base.every((value,index)=>value===base[index]))return cached.snapshot;
 const snapshot=prostheticStatSnapshot(patient,robot);
 combatStatsCache.set(robot,{parts:patient?.prosthetics,segments:robot.segmentCount,hasHead:robot.hasHead,snapshot});
 return snapshot;
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
