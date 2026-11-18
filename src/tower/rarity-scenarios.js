// Offline-only rarity scenarios. Never apply to live combat before approval.
import {TOWER_MUTATIONS,TOWER_MUTATION_SYNERGIES,towerRarityMultiplier} from './mutations.js';

export const TOWER_RARITY_SCENARIO_STEPS=Object.freeze([.08,.10,.12]);
const round=n=>Math.round(n*1e9)/1e9;
export function towerRarityScenario(installed,step){
 if(!TOWER_RARITY_SCENARIO_STEPS.includes(step)||!Array.isArray(installed))
  throw Error('Unknown rarity scenario');
 const unique=new Map();
 for(const item of installed){
  if(!Object.hasOwn(TOWER_MUTATIONS,item?.type)||!Number.isInteger(item.rarity)||item.rarity<0||item.rarity>5)
   throw Error('Invalid rarity item');
  if(!unique.has(item.type)||unique.get(item.type).rarity<item.rarity)unique.set(item.type,item);
 }
 if(unique.size>6)throw Error('More than six module types');
 const direct=[0,0,0],synergy=[0,0,0],families={};
 let crit=0,cooldown=0;
 for(const item of unique.values()){
  const def=TOWER_MUTATIONS[item.type],mul=towerRarityMultiplier(item.rarity,step);
  def.bonus.forEach((n,i)=>direct[i]+=n*mul);
  crit+=(def.combat?.crit??0)*mul;
  cooldown+=(def.combat?.cooldown??0)*mul;
  families[def.family]=(families[def.family]??0)+1;
 }
 for(const [family,count] of Object.entries(families))
  if(count>=2)TOWER_MUTATION_SYNERGIES[family].bonus.forEach((n,i)=>synergy[i]+=n);
 return {direct:direct.map(round),synergy:synergy.map(round),
  effective:direct.map((n,i)=>round(n+synergy[i])),
  crit:round(Math.min(.10,crit)),cooldownMultiplier:round(Math.max(.75,1-cooldown)),
  critAtCap:crit>=.10-1e-9,cooldownAtCap:cooldown>=.25-1e-9,activeTypes:unique.size};
}
