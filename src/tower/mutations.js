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
 instinct:Object.freeze({name:'Инстинкт',family:'organic',description:'Быстрее меняет траекторию движения',bonus:[.25,0,.35]}),
 flywheel:Object.freeze({name:'Маховик',family:'mechanical',description:'Скорость и сила; цикл атак на 4% короче',bonus:[.25,.25,0],combat:{cooldown:.04}}),
 gyro:Object.freeze({name:'Гироскоп',family:'mechanical',description:'Ускоряет коррекцию курса и движение',bonus:[.15,0,.45]}),
 spike:Object.freeze({name:'Шип-привод',family:'mechanical',description:'Жёсткий привод для мощных ударов',bonus:[0,.4,.15]}),
 sinews:Object.freeze({name:'Сухожилия',family:'organic',description:'Эластичные связки увеличивают подвижность',bonus:[.3,0,.3]}),
 ossify:Object.freeze({name:'Окостенение',family:'organic',description:'Более жёсткая опора усиливает атаку',bonus:[0,.45,.1]}),
 twitch:Object.freeze({name:'Нервный тик',family:'organic',description:'Быстрее перестраивает движение и атаки',bonus:[.2,.1,.2]}),
 optic:Object.freeze({name:'Зрительный нерв',family:'neural',description:'Точная наводка: +2,5% шанса крита',bonus:[0,0,.4],combat:{crit:.025}}),
 synapse:Object.freeze({name:'Синапс',family:'neural',description:'Короткая передача сигнала: атаки на 3% чаще',bonus:[.3,0,.15],combat:{cooldown:.03}}),
 focus:Object.freeze({name:'Фокус',family:'neural',description:'Прицельный удар: +2,5% шанса крита',bonus:[0,.2,.25],combat:{crit:.025}}),
 metronome:Object.freeze({name:'Метроном',family:'neural',description:'Ритм движений: цикл атак на 4% короче',bonus:[.35,.1,0],combat:{cooldown:.04}}),
 alarm:Object.freeze({name:'Сигнал тревоги',family:'neural',description:'Быстрое возбуждение: атаки на 3% чаще',bonus:[.2,.25,0],combat:{cooldown:.03}}),
 quiet:Object.freeze({name:'Тихий импульс',family:'neural',description:'Точный контроль: +2,5% шанса крита',bonus:[0,.15,.35],combat:{crit:.025}})
});
export const TOWER_MUTATION_IDS=Object.freeze(Object.keys(TOWER_MUTATIONS));
export const TOWER_MUTATION_SYNERGIES=Object.freeze({
 mechanical:Object.freeze({name:'Механический комплект',description:'2 механических модуля: +0,2 скорости и манёвра',bonus:[.2,0,.2]}),
 organic:Object.freeze({name:'Живой комплект',description:'2 биологических модуля: +0,2 силы и манёвра',bonus:[0,.2,.2]}),
 neural:Object.freeze({name:'Нейронная цепь',description:'2 нервных модуля: +0,2 скорости и силы',bonus:[.2,.2,0]})
});
export const TOWER_MUTATION_FAMILIES=Object.freeze({
 mechanical:'МЕХАНИКА',organic:'БИОЛОГИЯ',neural:'НЕРВНАЯ СИСТЕМА'
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
 // Historical six-module saves may contain a one- or two-option draft.
 // Expanding the catalogue must not invalidate or reroll a saved reward.
 return available>0&&distinct(draft.options)&&draft.options.length>=1
  &&draft.options.length<=Math.min(3,available)
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
// Only used for the controlled Tower patient; never modifies other fighters.
export function towerMutationCombatBonus(mutations=[]){
 let crit=0,cooldown=0;
 for(const id of mutations){
  const combat=TOWER_MUTATIONS[id]?.combat;
  crit+=combat?.crit??0;
  cooldown+=combat?.cooldown??0;
 }
 return {crit:Math.min(.1,Math.round(crit*1000)/1000),
  cooldownMultiplier:Math.max(.75,1-Math.round(cooldown*1000)/1000)};
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
 const pick=pool=>{
  const index=Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)));
  const [id]=pool.splice(index,1);
  candidates.splice(candidates.indexOf(id),1);
  options.push(id);
 };
 // Guarantee at least one synergy-completion choice when a set has exactly
 // one piece, without changing the other two random draft slots.
 const families=Object.keys(TOWER_MUTATION_SYNERGIES).filter(family=>
  run.mutations.filter(id=>TOWER_MUTATIONS[id].family===family).length===1);
 const matching=candidates.filter(id=>families.includes(TOWER_MUTATIONS[id].family));
 if(matching.length)pick(matching);
 while(candidates.length&&options.length<3)pick([...candidates]);
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
