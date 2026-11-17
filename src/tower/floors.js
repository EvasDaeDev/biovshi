// Tower floor plan: an immutable pair of offered fights, persisted until the floor ends.
// All random decisions here happen before the arena is created, not in the combat RNG.
import {ARENAS} from '../game/arenas.js';
import {hasBoss} from '../boss/config.js';
import {validTowerProfile} from './profiles.js';

export const TOWER_ARENA_CAPACITY=Object.freeze({
 ward:8, ring:3, annulus:4, sluice:5, zigzag:7, columns:10, throat:6
});
const cap=id=>Math.min(10,Math.max(2,TOWER_ARENA_CAPACITY[id]??6));
const standardCount=floor=>1+Math.floor(floor/2);
const roll=(random,max)=>Math.floor(random()*max);
const pool=['basic','fast','strong','agile'];
const ELITE_FROM_FLOOR=8;

function opponents(floor,count,danger,random){
 return Array.from({length:count},(_,i)=>{
  const eliteEligible=floor>=ELITE_FROM_FLOOR&&danger;
  if(eliteEligible&&random()<.18)return 'elite';
  const specialRate=danger?.75:Math.min(.55,.12+floor*.045);
  return random()<specialRate?pool[1+roll(random,3)]:'basic';
 });
}
function candidateArena(floor,danger,random,boss){
 const ids=Object.keys(ARENAS).filter(id=>!boss || cap(id)>=6);
 // More enemies and long bosses are safest on the spacious presets.
 if(boss&&floor>=25&&Object.hasOwn(ARENAS,'columns'))return 'columns';
 return ids[roll(random,ids.length)]??'ward';
}
function option(t,danger,random){
 const boss=hasBoss(t),arenaId=candidateArena(t.level,danger,random,boss);
 const max=cap(arenaId)-1;
 const count=boss?3:Math.min(max,Math.max(1,standardCount(t.level)));
 return {arenaId,kind:boss?'boss':danger?'danger':'standard',
  profiles:boss?['boss',...opponents(t.level,2,false,random)]:opponents(t.level,count,danger,random)};
}
// Plans are used only for newly prepared floors. An ongoing legacy battle with
// credited kills keeps its old enemy count until the next floor.
export function ensureTowerFloorPlan(t,random=Math.random){
 if(t.floorPlan?.floor===t.level)return t.floorPlan;
 if(t.rewarded?.length||t.legacyEnemyCount!==undefined||t.legacyBossFloor)return null;
 const boss=hasBoss(t);
 t.floorPlan={floor:t.level,selected:0,options:boss?[option(t,false,random)]:[option(t,false,random),option(t,true,random)]};
 return t.floorPlan;
}
export const selectedTowerFloor=t=>t.floorPlan?.floor===t.level?t.floorPlan.options[t.floorPlan.selected]:null;
export const towerFloorCount=t=>selectedTowerFloor(t)?.profiles.length??null;
export function selectTowerFloor(t,index){
 const plan=t.floorPlan;
 if(!plan||plan.floor!==t.level||t.rewarded?.length||!Number.isInteger(index)||index<0||index>=plan.options.length) return false;
 plan.selected=index;return true;
}
export function validTowerFloorPlan(p,level){
 if(p===undefined)return true;
 if(!p||p.floor!==level||!Number.isInteger(p.selected)||!Array.isArray(p.options)||p.options.length<1||p.options.length>2||p.selected>=p.options.length||p.selected<0)return false;
 return p.options.every(o=>o&&Object.hasOwn(ARENAS,o.arenaId)&&['standard','danger','boss'].includes(o.kind)
  &&Array.isArray(o.profiles)&&o.profiles.length>=1&&o.profiles.length<=cap(o.arenaId)-1
  &&o.profiles.every(id=>id==='boss'||validTowerProfile(id))
  &&(o.kind==='boss'?o.profiles.length===3&&o.profiles[0]==='boss':o.profiles.every(id=>id!=='boss')));
}
