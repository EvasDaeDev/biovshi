// Persistent faction rules are rolled in the floor plan, never per AI frame.
// Expiration times are measured in combat-local seconds and survive DMS saves.
import {towerCycleInfo} from './cycles.js';
export const TOWER_RELATION_NAMES=Object.freeze({
 plot:'СГОВОР',hunt:'ТРАВЛЯ',gang:'СМЕШАННЫЕ КОМАНДЫ',mixed:'КОМБИНАЦИЯ ТАКТИК'
});
const mixes=[['plot','hunt'],['hunt','gang'],['plot','gang'],['plot','hunt','gang']];
export function towerRelationPlan(level,profiles,random=Math.random){
 const cycle=towerCycleInfo(level).index;
 if(!cycle)return null;
 const ids=profiles.map((_,index)=>index+1),boss=profiles[0]==='boss';
 const type=cycle===1?'plot':cycle===2?'hunt':cycle===3?'gang':'mixed';
 const wanted=type==='mixed'?mixes[(cycle-4)%mixes.length]:[type];
 const teams=[],teamUntil=[],members=new Set();
 const add=(ids,until=null)=>{
  if(ids.length<2)return false;
  teams.push(ids);teamUntil.push(until);ids.forEach(id=>members.add(id));return true;
 };
 let gang=false,plot=false;
 if(wanted.includes('gang')){
  // Escorts join the boss rather than attacking him before he sees the player.
  gang=add(boss?ids.slice(0,3):ids.slice(0,Math.min(3,ids.length)));
  if(!boss&&!wanted.includes('plot')&&ids.length>=6)add(ids.slice(3,5));
 }
 if(wanted.includes('plot')){
  const free=ids.filter(id=>!members.has(id));
  if(free.length>=2){
   plot=add(free.slice(0,2),8+Math.floor(random()*13));
   if(free.length>=6&&random()<.4)add(free.slice(2,4),8+Math.floor(random()*13));
  }
 }
 const chooseHunters=()=>ids.filter((id,index)=>index%3===0||
  boss&&wanted.includes('gang')&&index===1);
 let hunters=wanted.includes('hunt')?chooseHunters():[];
 let modes=wanted.filter(mode=>mode==='plot'?plot:mode==='gang'?gang:hunters.length>0);
 // Three boss opponents cannot host a gang AND a disjoint pair. A hunting
 // escort supplies a genuine second rule instead of announcing a fake plot.
 if(type==='mixed'&&modes.length<2&&!modes.includes('hunt')){
  hunters=chooseHunters();modes=[...modes,'hunt'];
 }
 return {type,teams,hunters,...(teams.length?{teamUntil}:{}),
  ...(type==='mixed'?{modes}:{})};
}
export function towerRelationsFor(run){
 const p=run?.floorPlan;
 return p?.floor===run.level?p.options[p.selected]?.relations??null:null;
}
export function towerTeamMembers(run,id,now=0){
 if(!Number.isInteger(id)||id<1)return [];
 const rel=towerRelationsFor(run);
 if(!rel)return [];
 const index=rel.teams.findIndex((team,i)=>team.includes(id)&&
  (rel.teamUntil?.[i]==null||now<rel.teamUntil[i]));
 return index<0?[]:rel.teams[index];
}
export function towerAllies(run,a,b,now=0){
 return a!==b&&b>0&&towerTeamMembers(run,a,now).includes(b);
}
export const towerHuntsPlayer=(run,attackerId)=>towerRelationsFor(run)?.hunters?.includes(attackerId)??false;
// Teammates share target IDs, never locations: the receiving fighter still
// needs its own visual contact to change course or strike.
export function towerTeamFocus(run,id,focus,until,now,allyActive=()=>true){
 const team=towerTeamMembers(run,id,now);
 return [...new Set(team.filter(member=>member!==id&&allyActive(member)
  &&now<(until?.[member]??0)).map(member=>focus?.[member])
  .filter(target=>Number.isInteger(target)&&target>=0&&target!==id))];
}
export function towerRelationLabel(rel){
 if(!rel)return '';
 if(rel.type!=='mixed')return TOWER_RELATION_NAMES[rel.type]??'';
 return TOWER_RELATION_NAMES.mixed+' · '+(rel.modes??[]).map(mode=>TOWER_RELATION_NAMES[mode]).join(' + ');
}
export function validTowerRelations(rel,profiles){
 if(rel===undefined)return true;
 if(!rel||!Object.hasOwn(TOWER_RELATION_NAMES,rel.type)||!Array.isArray(rel.teams)||!Array.isArray(rel.hunters))return false;
 const limit=profiles.length,known=id=>Number.isInteger(id)&&id>=1&&id<=limit;
 if(rel.type==='mixed'){
  if(!Array.isArray(rel.modes)||rel.modes.length<2||rel.modes.length>3
   ||new Set(rel.modes).size!==rel.modes.length
   ||rel.modes.some(mode=>!['plot','hunt','gang'].includes(mode)))return false;
 }else if(rel.modes!==undefined)return false;
 if(rel.teamUntil!==undefined&&(!Array.isArray(rel.teamUntil)||rel.teamUntil.length!==rel.teams.length
  ||rel.teamUntil.some(until=>until!==null&&(!Number.isInteger(until)||until<6||until>30))))return false;
 const seen=new Set();
 for(const team of rel.teams){
  if(!Array.isArray(team)||team.length<2||team.length>3||new Set(team).size!==team.length||!team.every(known))return false;
  for(const id of team){if(seen.has(id))return false;seen.add(id);}
 }
 return new Set(rel.hunters).size===rel.hunters.length&&rel.hunters.every(known);
}
