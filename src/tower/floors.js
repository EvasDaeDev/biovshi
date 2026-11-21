// Tower floor plan: an immutable pair of offered fights, persisted until the floor ends.
// All random decisions here happen before the arena is created, not in the combat RNG.
import {ARENAS,TOWER_ARENA_CAPACITY,arenaCapacity,emergencyArena,hasArena} from '../game/arenas.js';
import {validLocationId} from '../game/location-geometry.js';
import {hasBoss} from '../boss/config.js';
import {validTowerProfile} from './profiles.js';
import {towerRelationPlan,validTowerRelations} from './relations.js';

export {TOWER_ARENA_CAPACITY};
const cap=arenaCapacity;
const standardCount=floor=>1+Math.floor(floor/2);
const roll=(random,max)=>Math.floor(random()*max);
const pool=['basic','fast','strong','agile'];
const ELITE_FROM_FLOOR=8;
// Ordinary difficulty has a deliberately wider gap from danger.
// Total specialist incidence is 70% of its previous chance. Strong
// opponents are HALF as likely overall as before (old: rate / 3).
// To satisfy both constraints simultaneously, redistribute the remaining
// specialist probability to fast/agile at weights 8 : 5 : 8.
export const towerStandardSpecialistRate=floor=>Math.min(.55,.12+floor*.045)*.7;
export function towerStandardSpecialist(random=Math.random){
 const choice=random();
 return choice<8/21?'fast':choice<13/21?'strong':'agile';
}

// Risk variants are generated once, then stored with the floor plan.
export const TOWER_DANGER_STYLES=Object.freeze({
 trial:Object.freeze({name:'Отбор',description:'Столько же врагов, но все специализированные'}),
 crowd:Object.freeze({name:'Переполнение',description:'Больше соперников, преимущественно обычных'}),
 mixed:Object.freeze({name:'Смешанный',description:'Разные типы бойцов одновременно: быстрые сближаются напрямую, силовые навязывают ближний бой, маневренные заходят с фланга'})
});
const DANGER_STYLE_IDS=Object.keys(TOWER_DANGER_STYLES);

function opponents(floor,count,danger,random,style=null){
 const profiles=Array.from({length:count},(_,i)=>{
  const eliteEligible=floor>=ELITE_FROM_FLOOR&&danger;
  if(eliteEligible&&random()<(style==='trial' ? .28 : .18))return 'elite';
  // At least one specialist makes the higher risk perceptible.
  if(danger&&i===0)return pool[1+roll(random,3)];
  const specialRate=style==='trial' ? 1 : style==='crowd' ? .30 : danger ? .80 : towerStandardSpecialistRate(floor);
  if(random()>=specialRate)return 'basic';
  return danger?pool[1+roll(random,3)]:towerStandardSpecialist(random);
 });
 if(style==='mixed'&&count>=2){
  // Guarantee two visibly different approaches to the fight.
  profiles[0]='fast';
  profiles[1]=random()<.5?'strong':'agile';
 }
 return profiles;
}
export function bossArenaIds(floor){
 if(floor>=25&&cap('columns')>=4)return ['columns'];
 const ids=Object.keys(ARENAS).filter(id=>cap(id)>=4&&
  (id==='ward'||id==='columns'||!Object.hasOwn(TOWER_ARENA_CAPACITY,id)));
 return ids.length?ids:Object.keys(ARENAS).filter(id=>cap(id)>=4);
}
export const towerArenaMinimum=floor=>floor>=20?7:floor>=10?6:floor>=5?4:2;
function candidateArena(floor,random,boss,requiredCapacity=0){
 const minimum=Math.max(towerArenaMinimum(floor),requiredCapacity);
 const ids=boss?bossArenaIds(floor):Object.keys(ARENAS).filter(id=>cap(id)>=minimum);
 if(boss&&floor>=25&&ids[0]==='columns')return 'columns';
 if(ids.length)return ids[roll(random,ids.length)];
 if(boss)return emergencyArena.id;
 return Object.values(ARENAS).reduce((best,a)=>a.capacity>best.capacity?a:best).id;
}
export function repairTowerArena(plan,level){
 const choices=plan?.options;
 const id=choices?.[0]?.arenaId;
 if(!Array.isArray(choices)||!(id===emergencyArena.id||validLocationId(id))||!choices.every(o=>o?.arenaId===id&&Array.isArray(o.profiles)))return;
 const needed=Math.max(...choices.map(o=>o.profiles.length+1));
 if(id!==emergencyArena.id&&cap(id)>=needed)return;
 const replacement=Object.values(ARENAS).find(a=>a.capacity>=needed)??emergencyArena;
 if(replacement.id===id)return;
 const repaired={...plan,options:choices.map(o=>({...o,arenaId:replacement.id}))};
 if(validTowerFloorPlan(repaired,level))plan.options=repaired.options;
}
function option(t,danger,random,arenaId,style=null){
 const boss=hasBoss(t);
 const max=cap(arenaId)-1,base=standardCount(t.level);
 const requested=base+(style==='crowd'?1:0);
 const count=boss?3:Math.min(max,Math.max(1,requested,style==='mixed'?2:1));
 return {arenaId,kind:boss?'boss':danger?'danger':'standard',
  ...(style?{style}:{}),
  profiles:boss?['boss','basic','basic']:opponents(t.level,count,danger,random,style)};
}
// Plans are used only for newly prepared floors. An ongoing legacy battle with
// credited kills keeps its old enemy count until the next floor.
export function ensureTowerFloorPlan(t,random=Math.random){
 if(t.floorPlan?.floor===t.level){
  // Repair older unstarted trial offers without rerolling the selected arena
  // or changing an encounter that has already begun.
  const [standard,danger]=t.floorPlan.options??[];
  if(t.preparing&&!t.arenaRerollLocked&&!t.rewarded?.length&&
    standard?.kind==='standard'&&danger?.kind==='danger'&&
    danger.profiles?.length<standard.profiles?.length){
   const specialist=danger.profiles.find(id=>id!=='basic')??'fast';
   while(danger.profiles.length<standard.profiles.length)danger.profiles.push(specialist);
   if(danger.relations!==undefined){
    const relations=towerRelationPlan(t.level,danger.profiles,random);
    if(relations)danger.relations=relations;else delete danger.relations;
   }
  }
  return t.floorPlan;
 }
 if(t.rewarded?.length||t.legacyEnemyCount!==undefined||t.legacyBossFloor)return null;
 const boss=hasBoss(t),base=standardCount(t.level);
 const style=boss?null:DANGER_STYLE_IDS[roll(random,DANGER_STYLE_IDS.length)];
 // No arena can fit one more enemy once the ordinary floor already has 9.
 const actualStyle=style==='crowd'&&base>=9?'mixed':style;
 // Crowded challenges must offer a real extra opponent, not merely a label.
 const arenaId=candidateArena(t.level,random,boss,actualStyle==='crowd'?base+2:0);
 const standard=option(t,false,random,arenaId);
 const dangerStyle=actualStyle==='crowd'&&cap(arenaId)<=standard.profiles.length+1?'trial':actualStyle;
 const options=boss?[standard]:[standard,option(t,true,random,arenaId,dangerStyle)];
 for(const choice of options){
  const relations=towerRelationPlan(t.level,choice.profiles,random);
  if(relations)choice.relations=relations;
 }
 t.floorPlan={floor:t.level,selected:0,options};
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
 return p.options.every(o=>o&&hasArena(o.arenaId)&&['standard','danger','boss'].includes(o.kind)
  &&(o.style===undefined||(o.kind==='danger'&&Object.hasOwn(TOWER_DANGER_STYLES,o.style)))
  &&Array.isArray(o.profiles)&&o.profiles.length>=1&&o.profiles.length<=cap(o.arenaId)-1
  &&o.profiles.every(id=>id==='boss'||validTowerProfile(id))&&validTowerRelations(o.relations,o.profiles)
  &&(o.kind==='boss'?o.profiles.length===3&&o.profiles[0]==='boss'&&o.profiles.slice(1).every(validTowerProfile):o.profiles.every(id=>id!=='boss')));
}
