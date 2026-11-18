// Deterministic, persisted agreements between AI-controlled fighters.
// No per-frame faction rolls. Player 0 is never allied with an opponent.
import {towerCycleInfo} from './cycles.js';
export const TOWER_RELATION_NAMES=Object.freeze({plot:'СГОВОР',hunt:'ТРАВЛЯ',gang:'СМЕШАННЫЕ КОМАНДЫ'});
export function towerRelationPlan(level,profiles,random=Math.random){
 const cycle=towerCycleInfo(level).index;
 if(!cycle)return null;
 const ids=profiles.map((_,index)=>index+1),boss=profiles[0]==='boss';
 const type=cycle===1?'plot':cycle===2?'hunt':cycle===3?'gang':['plot','hunt','gang'][(cycle-4)%3];
 const teams=[];
 if(type==='plot'&&ids.length>=2){
  teams.push(ids.slice(0,2));if(ids.length>=6&&random()<.4)teams.push(ids.slice(2,4));
 }
 if(type==='gang'&&ids.length>=2){
  teams.push(boss?[1,2,3].filter(id=>ids.includes(id)):ids.slice(0,Math.min(3,ids.length)));
  if(!boss&&ids.length>=6)teams.push(ids.slice(3,5));
 }
 // Some hunters focus on the player, but other patients remain independent.
 const hunters=type==='hunt'?ids.filter((id,index)=>index%3===0):[];
 return {type,teams,hunters};
}
export function towerRelationsFor(run){
 const p=run?.floorPlan;
 return p?.floor===run.level?p.options[p.selected]?.relations??null:null;
}
export function towerAllies(run,a,b){
 if(a===0||b===0||a===b)return false;
 return (towerRelationsFor(run)?.teams??[]).some(team=>team.includes(a)&&team.includes(b));
}
export const towerHuntsPlayer=(run,attackerId)=>towerRelationsFor(run)?.hunters?.includes(attackerId)??false;
export function validTowerRelations(rel,profiles){
 if(rel===undefined)return true;
 if(!rel||!Object.hasOwn(TOWER_RELATION_NAMES,rel.type)||!Array.isArray(rel.teams)||!Array.isArray(rel.hunters))return false;
 const limit=profiles.length,known=id=>Number.isInteger(id)&&id>=1&&id<=limit;
 const seen=new Set();
 for(const team of rel.teams){
  if(!Array.isArray(team)||team.length<2||team.length>3||new Set(team).size!==team.length||!team.every(known))return false;
  for(const id of team){if(seen.has(id))return false;seen.add(id);}
 }
 return new Set(rel.hunters).size===rel.hunters.length&&rel.hunters.every(known);
}
