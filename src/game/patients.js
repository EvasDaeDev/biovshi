import {ctx} from './state.js';
import {BASE_STATS} from '../garage/model.js';
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
export const fighterLabel=id=>ctx.mode==='tower'?(id===0?ctx.betting.players[ctx.towerPlayer].name:ctx.robots?.[id]?.isBoss?`Босс · ${ctx.robots[id].bossName}`:`ИИ ${id}`):String.fromCharCode(65+id);
