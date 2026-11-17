// First playable Tower build-modification set. Bonuses are expressed as
// fractional EFFECTIVE skill points so existing movement, turning, and combat
// curves remain authoritative. Never mutate earned/base stats or prosthetics.
import {prostheticStatSnapshot} from '../garage/prosthetics.js';

export const TOWER_MUTATIONS=Object.freeze({
 turbo:Object.freeze({name:'Форсаж',family:'mechanical',description:'Привод повышает скорость',bonus:[.55,0,0]}),
 servo:Object.freeze({name:'Сервопривод',family:'mechanical',description:'Точнее и быстрее разворачивается',bonus:[0,0,.55]}),
 piston:Object.freeze({name:'Поршень',family:'mechanical',description:'Усиленный ударный механизм',bonus:[0,.55,0]}),
 adrenal:Object.freeze({name:'Адреналин',family:'organic',description:'Быстрее двигается и сильнее атакует',bonus:[.35,.25,0]}),
 predator:Object.freeze({name:'Хищник',family:'organic',description:'Сильнее атакует и маневрирует',bonus:[0,.35,.25]}),
 instinct:Object.freeze({name:'Инстинкт',family:'organic',description:'Быстрее меняет траекторию движения',bonus:[.25,0,.35]})
});
export const TOWER_MUTATION_IDS=Object.freeze(Object.keys(TOWER_MUTATIONS));
export const TOWER_MUTATION_SYNERGIES=Object.freeze({
 mechanical:Object.freeze({name:'Механический комплект',description:'2 механических модуля: +0,2 скорости и манёвра',bonus:[.2,0,.2]}),
 organic:Object.freeze({name:'Живой комплект',description:'2 биологических модуля: +0,2 силы и манёвра',bonus:[0,.2,.2]})
});
const distinct=ids=>Array.isArray(ids)&&new Set(ids).size===ids.length;
export function validTowerMutations(ids){
 return distinct(ids)&&ids.length<=TOWER_MUTATION_IDS.length
  &&ids.every(id=>typeof id==='string'&&Object.hasOwn(TOWER_MUTATIONS,id));
}
export function validTowerMutationDraft(draft,mutations,level){
 if(draft===undefined)return true;
 if(!draft||typeof draft!=='object'||Array.isArray(draft)||!Number.isSafeInteger(draft.floor)
   ||draft.floor!==level||level<6||(level-1)%5!==0)return false;
 const available=TOWER_MUTATION_IDS.length-mutations.length;
 return distinct(draft.options)&&draft.options.length===Math.min(3,available)
  &&draft.options.every(id=>Object.hasOwn(TOWER_MUTATIONS,id)&&!mutations.includes(id));
}
export function validTowerMutationState(run){
 return validTowerMutations(run.mutations)
  &&validTowerMutationDraft(run.mutationDraft,run.mutations,run.level);
}
export function towerMutationBonus(mutations=[]){
 const result=[0,0,0],groups={mechanical:0,organic:0};
 for(const id of mutations){
  const mutation=TOWER_MUTATIONS[id];
  if(!mutation)continue;
  mutation.bonus.forEach((value,i)=>result[i]+=value);
  groups[mutation.family]++;
 }
 for(const [family,count] of Object.entries(groups)){
  if(count<2)continue;
  TOWER_MUTATION_SYNERGIES[family].bonus.forEach((value,i)=>result[i]+=value);
 }
 return result.map(n=>Math.round(n*100)/100);
}
export function towerMutationSynergies(mutations=[]){
 return Object.entries(TOWER_MUTATION_SYNERGIES)
  .filter(([family])=>mutations.filter(id=>TOWER_MUTATIONS[id]?.family===family).length>=2)
  .map(([family])=>family);
}
export function towerMutationSnapshot(patient,robot=null){
 const snapshot=prostheticStatSnapshot(patient,robot);
 const mutationBonus=towerMutationBonus(patient?.mutations);
 return {...snapshot,mutationBonus,effective:snapshot.effective.map((n,i)=>n+mutationBonus[i])};
}
export function grantTowerMutationDraft(run,random=Math.random){
 if(!validTowerMutations(run.mutations)||run.mutationDraft)return false;
 if(run.level<6||(run.level-1)%5!==0)return false;
 const candidates=TOWER_MUTATION_IDS.filter(id=>!run.mutations.includes(id));
 if(!candidates.length)return false;
 const options=[];
 while(candidates.length&&options.length<3){
  const index=Math.min(candidates.length-1,Math.max(0,Math.floor(random()*candidates.length)));
  options.push(candidates.splice(index,1)[0]);
 }
 run.mutationDraft={floor:run.level,options};
 return true;
}
export function chooseTowerMutation(run,id){
 if(!validTowerMutationState(run)||!run.mutationDraft?.options.includes(id)
   ||!run.preparing||run.rewarded?.length)return false;
 run.mutations.push(id);
 delete run.mutationDraft;
 return true;
}
