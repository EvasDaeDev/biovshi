// First playable Tower build-modification set. Bonuses are expressed as
// fractional EFFECTIVE skill points so existing movement, turning, and combat
// curves remain authoritative. Never mutate earned/base stats or prosthetics.
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
import {towerSurgeryBonus} from './surgery.js';

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
export const TOWER_MUTATION_LIMIT=6;
export const TOWER_RARITIES=Object.freeze([
 {name:'ОБЫЧНАЯ',colour:null},{name:'ЗЕЛЁНАЯ',colour:'#60a95b'},
 {name:'СИНЯЯ',colour:'#4b94d2'},{name:'ФИОЛЕТОВАЯ',colour:'#9b6acd'},
 {name:'ОРАНЖЕВАЯ',colour:'#e5a44b'},{name:'КРАСНАЯ',colour:'#d84a3e'}
]);
export const towerMutationRarity=clearedFloor=>Math.min(5,Math.max(0,Math.floor((clearedFloor-1)/30)));
// Simulation-only; does not modify active combat bonuses until balancing is approved.
export const towerRarityMultiplier=(rarity,step=.12)=>1+Math.min(5,Math.max(0,rarity))*step;
export const towerMutationInstallPrice=run=>Math.ceil(100*Math.pow(1.55,run?.modInstallations??0));
// Old saves used `mutations` for both ownership and equipment. These are
// grandfathered as equipped, without retroactive installation fees.
export function normalizeTowerMutationInventory(run){
 if(!Array.isArray(run.mutations))run.mutations=[];
 if(!Array.isArray(run.mutationInventory)){
  run.mutationInventory=run.mutations.map((type,i)=>({id:'m'+(i+1),type,rarity:0,obtainedAt:1}));
  run.equippedMutations=run.mutationInventory.slice(0,TOWER_MUTATION_LIMIT).map(item=>item.id);
  run.nextMutationId=run.mutationInventory.length+1;
  run.modInstallations=run.modInstallations??0;
 }else{
  run.equippedMutations??=[];
  run.nextMutationId??=1+run.mutationInventory.reduce((max,item)=>Math.max(max,Number(item.id?.slice(1))||0),0);
  run.modInstallations??=0;
 }
 run.mutations=run.equippedMutations.map(id=>run.mutationInventory.find(item=>item.id===id)?.type).filter(Boolean);
 return run;
}
export function towerInstalledItems(run){
 return (run?.equippedMutations??[]).map(id=>(run?.mutationInventory??[]).find(item=>item.id===id)).filter(Boolean);
}
export function validTowerInventory(run){
 const inventory=run?.mutationInventory,equipped=run?.equippedMutations;
 if(!Array.isArray(inventory)||!Array.isArray(equipped)||equipped.length>TOWER_MUTATION_LIMIT
  ||!Number.isSafeInteger(run.nextMutationId)||run.nextMutationId<1
  ||!Number.isSafeInteger(run.modInstallations)||run.modInstallations<0)return false;
 const ids=new Set();
 for(const item of inventory){
  if(!item||!/^m[1-9]\d*$/.test(item.id)||ids.has(item.id)||!Object.hasOwn(TOWER_MUTATIONS,item.type)
   ||!Number.isInteger(item.rarity)||item.rarity<0||item.rarity>5
   ||!Number.isSafeInteger(item.obtainedAt)||item.obtainedAt<1||Number(item.id.slice(1))>=run.nextMutationId)return false;
  ids.add(item.id);
 }
 if(new Set(equipped).size!==equipped.length||equipped.some(id=>!ids.has(id)))return false;
 const types=towerInstalledItems(run).map(item=>item.type);
 return new Set(types).size===types.length&&JSON.stringify(types)===JSON.stringify(run.mutations);
}

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
 const owned=run.mutationInventory?.map(item=>item.type)??run.mutations;
 const legacy=!Array.isArray(run.mutationInventory);
 return validTowerMutations(run.mutations)
  &&(legacy||validTowerInventory(run))
  &&(legacy?validTowerMutationDraft(run.mutationDraft,run.mutations,run.level):
    (run.mutationDraft===undefined||validTowerMutationDraft(run.mutationDraft,owned.filter((id,i)=>owned.indexOf(id)===i),run.level)
    ||validStoredMutationDraft(run.mutationDraft,run.level)));
}
function validStoredMutationDraft(draft,level){
 return draft&&draft.floor===level&&level>=6&&(level-1)%5===0
  &&Array.isArray(draft.options)&&draft.options.length>=1&&draft.options.length<=3
  &&distinct(draft.options)&&draft.options.every(id=>Object.hasOwn(TOWER_MUTATIONS,id))
  &&(draft.rarity===undefined||Number.isInteger(draft.rarity)&&draft.rarity>=0&&draft.rarity<=5);
}

export function towerMutationBonus(mutations=[]){
 const result=[0,0,0],groups={mechanical:0,organic:0,neural:0};
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
 const surgeryBonus=towerSurgeryBonus(patient?.surgeries,robot);
 return {...snapshot,mutationBonus,surgeryBonus,
  effective:snapshot.effective.map((n,i)=>n+mutationBonus[i]+surgeryBonus[i])};
}
export function grantTowerMutationDraft(run,random=Math.random){
 if(!validTowerMutations(run.mutations)||run.mutationDraft)return false;
 if(run.level<6||(run.level-1)%5!==0)return false;
 // Prefer unseen kinds, but after collecting all eighteen allow copies with
 // new rarity so cycles D+ never stop producing boss rewards.
 const owned=run.mutationInventory?.map(item=>item.type)??run.mutations;
 const candidates=TOWER_MUTATION_IDS.filter(id=>!owned.includes(id));
 if(!candidates.length)candidates.push(...TOWER_MUTATION_IDS);
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
 run.mutationDraft={floor:run.level,options,rarity:towerMutationRarity(run.level-1)};
 return true;
}
export function chooseTowerMutation(run,id){
 // Confirmation transfers property only; no balance or combat bonus changes.
 if(!validTowerMutationState(run)||!run.mutationDraft?.options.includes(id)
   ||!run.preparing||run.rewarded?.length)return false;
 normalizeTowerMutationInventory(run);
 const item={id:'m'+run.nextMutationId++,type:id,
  rarity:run.mutationDraft.rarity??towerMutationRarity(run.level-1),obtainedAt:run.level-1};
 run.mutationInventory.push(item);
 run.lastClaimedMutation=item.id;
 delete run.mutationDraft;
 return item;
}
export function equipTowerMutation(session,player,run,id,replaceId=null){
 normalizeTowerMutationInventory(run);
 const item=run.mutationInventory.find(item=>item.id===id);
 const active=towerInstalledItems(run);
 if(!item||!run.preparing||run.mutationDraft||run.rewarded?.length||run.equippedMutations.includes(id))
  throw Error('Модификация недоступна для установки.');
 const conflict=active.find(installed=>installed.type===item.type);
 if(conflict&&replaceId!==conflict.id)throw Error('Выбери установленную версию для замены.');
 if(replaceId!==null&&!run.equippedMutations.includes(replaceId))throw Error('Неверная заменяемая модификация.');
 if(active.length>=TOWER_MUTATION_LIMIT&&replaceId===null)
  throw Error('Все шесть слотов заняты. Сначала выбери замену или сними модуль.');
 const buyer=session.players?.[player],price=towerMutationInstallPrice(run),spent=session.mutationSpent??0;
 if(!buyer||buyer.balance<price)throw Error('Недостаточно монет для установки. Награда остаётся на складе.');
 if(!Number.isSafeInteger(spent)||spent+price>16000000||!Number.isSafeInteger(price))throw Error('Недопустимая стоимость.');
 // One transaction: validate everything before changing ownership, cash or bonuses.
 if(replaceId!==null)run.equippedMutations=run.equippedMutations.filter(existing=>existing!==replaceId);
 run.equippedMutations.push(id);run.modInstallations++;
 run.mutations=towerInstalledItems(run).map(item=>item.type);
 buyer.balance-=price;session.mutationSpent=spent+price;
 return price;
}
export function removeTowerMutation(run,id){
 normalizeTowerMutationInventory(run);
 if(!run.preparing||run.mutationDraft||!run.equippedMutations.includes(id))return false;
 run.equippedMutations=run.equippedMutations.filter(existing=>existing!==id);
 run.mutations=towerInstalledItems(run).map(item=>item.type);
 return true;
}
