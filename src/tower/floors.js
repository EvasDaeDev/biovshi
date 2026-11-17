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
// Risk variants are generated once, then stored with the floor plan.
export const TOWER_DANGER_STYLES=Object.freeze({
 trial:Object.freeze({name:'Отбор',description:'Меньше врагов, но все специализированные'}),
 crowd:Object.freeze({name:'Переполнение',description:'Больше соперников, преимущественно обычных'}),
 mixed:Object.freeze({name:'Смешанный',description:'Разные специализации одновременно'})
});
const DANGER_STYLE_IDS=Object.keys(TOWER_DANGER_STYLES);

function opponents(floor,count,danger,random,style=null){
 const profiles=Array.from({length:count},(_,i)=>{
  const eliteEligible=floor>=ELITE_FROM_FLOOR&&danger;
  if(eliteEligible&&random()<(style==='trial' ? .28 : .18))return 'elite';
  // At least one specialist makes the higher risk perceptible.
  if(danger&&i===0)return pool[1+roll(random,3)];
  const specialRate=style==='trial' ? 1 : style==='crowd' ? .30 : danger ? .80 : Math.min(.55,.12+floor*.045);
  return random()<specialRate?pool[1+roll(random,3)]:'basic';
 });
 if(style==='mixed'&&count>=2){
  // Guarantee two visibly different approaches to the fight.
  profiles[0]='fast';
  profiles[1]=random()<.5?'strong':'agile';
 }
 return profiles;
}
function candidateArena(floor,random,boss,requiredCapacity=0){
 const baseline=boss?6:floor>=20?7:floor>=10?6:floor>=5?4:2;
 const minimum=Math.max(baseline,requiredCapacity);
 const ids=Object.keys(ARENAS).filter(id=>boss?(id==='ward'||id==='columns'):cap(id)>=minimum);
 // More enemies and long bosses are safest on the spacious presets.
 if(boss&&floor>=25&&Object.hasOwn(ARENAS,'columns'))return 'columns';
 return ids[roll(random,ids.length)]??'ward';
}
function option(t,danger,random,arenaId,style=null){
 const boss=hasBoss(t);
 const max=cap(arenaId)-1,base=standardCount(t.level);
 const requested=base+(style==='trial'?-1:style==='crowd'?1:0);
 const count=boss?3:Math.min(max,Math.max(1,requested,style==='mixed'?2:1));
 return {arenaId,kind:boss?'boss':danger?'danger':'standard',
  ...(style?{style}:{}),
  profiles:boss?['boss',...opponents(t.level,2,false,random)]:opponents(t.level,count,danger,random,style)};
}
// Plans are used only for newly prepared floors. An ongoing legacy battle with
// credited kills keeps its old enemy count until the next floor.
export function ensureTowerFloorPlan(t,random=Math.random){
 if(t.floorPlan?.floor===t.level)return t.floorPlan;
 if(t.rewarded?.length||t.legacyEnemyCount!==undefined||t.legacyBossFloor)return null;
 const boss=hasBoss(t),base=standardCount(t.level);
 const style=boss?null:DANGER_STYLE_IDS[roll(random,DANGER_STYLE_IDS.length)];
 // No arena can fit one more enemy once the ordinary floor already has 9.
 const actualStyle=style==='crowd'&&base>=9?'mixed':style;
 // Crowded challenges must offer a real extra opponent, not merely a label.
 const arenaId=candidateArena(t.level,random,boss,actualStyle==='crowd'?base+2:0);
 const standard=option(t,false,random,arenaId);
 t.floorPlan={floor:t.level,selected:0,options:boss?[standard]:[standard,option(t,true,random,arenaId,actualStyle)]};
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
 if(hasBoss({level})?p.options.length!==1||p.options[0]?.kind!=='boss'
  :p.options.length!==2||p.options[0]?.kind!=='standard'
   ||p.options[1]?.kind!=='danger'||p.options[0]?.arenaId!==p.options[1]?.arenaId)
  return false;
 return p.options.every(o=>o&&Object.hasOwn(ARENAS,o.arenaId)&&['standard','danger','boss'].includes(o.kind)
  &&(o.style===undefined||(o.kind==='danger'&&Object.hasOwn(TOWER_DANGER_STYLES,o.style)))
  &&Array.isArray(o.profiles)&&o.profiles.length>=1&&o.profiles.length<=cap(o.arenaId)-1
  &&o.profiles.every(id=>id==='boss'||validTowerProfile(id))
  &&(o.kind==='boss'?o.profiles.length===3&&o.profiles[0]==='boss'&&o.profiles.slice(1).every(validTowerProfile):o.profiles.every(id=>id!=='boss')));
}
