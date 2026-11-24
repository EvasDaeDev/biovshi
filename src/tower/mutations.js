import {COIN_SCALE,MAX_ISSUED_COINS} from '../betting/coins.js';
// First playable Tower build-modification set. Bonuses are expressed as
// fractional EFFECTIVE skill points so existing movement, turning, and combat
// curves remain authoritative. Never mutate earned/base stats or prosthetics.
import {CONFIG} from '../config.js';
import {statMultiplier,critChance} from '../garage/model.js';
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
import {towerSurgeryBonus} from './surgery.js';

export const TOWER_MUTATIONS=Object.freeze({
 turbo:Object.freeze({name:'Форсаж',family:'mechanical',description:'Привод повышает скорость',bonus:[.55,0,0]}),
 servo:Object.freeze({name:'Сервопривод',family:'mechanical',description:'Точнее и быстрее разворачивается',bonus:[0,0,.55]}),
 piston:Object.freeze({name:'Поршень',family:'mechanical',description:'Сила повышает вероятность критического удара',bonus:[0,.55,0]}),
 adrenal:Object.freeze({name:'Адреналин',family:'organic',description:'Быстрее движется и чаще наносит критические удары',bonus:[.35,.25,0]}),
 predator:Object.freeze({name:'Хищник',family:'organic',description:'Выше шанс крита и манёвренность',bonus:[0,.35,.25]}),
 instinct:Object.freeze({name:'Инстинкт',family:'organic',description:'Быстрее меняет траекторию движения',bonus:[.25,0,.35]}),
 flywheel:Object.freeze({name:'Маховик',family:'mechanical',description:'Скорость и сила; цикл атак на 4% короче',bonus:[.25,.25,0],combat:{cooldown:.04}}),
 gyro:Object.freeze({name:'Гироскоп',family:'mechanical',description:'Ускоряет коррекцию курса и движение',bonus:[.15,0,.45]}),
 spike:Object.freeze({name:'Шип-привод',family:'mechanical',description:'Силовой привод повышает шанс критического удара',bonus:[0,.4,.15]}),
 sinews:Object.freeze({name:'Сухожилия',family:'organic',description:'Эластичные связки увеличивают подвижность',bonus:[.3,0,.3]}),
 ossify:Object.freeze({name:'Окостенение',family:'organic',description:'Жёсткая опора повышает шанс критического удара',bonus:[0,.45,.1]}),
 twitch:Object.freeze({name:'Нервный тик',family:'organic',description:'Быстрее перестраивает движение и атаки',bonus:[.2,.1,.2]}),
 optic:Object.freeze({name:'Зрительный нерв',family:'neural',description:'Точная наводка: +2,5% шанса крита',bonus:[0,0,.4],combat:{crit:.025}}),
 synapse:Object.freeze({name:'Синапс',family:'neural',description:'Короткая передача сигнала: атаки на 3% чаще',bonus:[.3,0,.15],combat:{cooldown:.03}}),
 focus:Object.freeze({name:'Фокус',family:'neural',description:'Прицельный удар: +2,5% шанса крита',bonus:[0,.2,.25],combat:{crit:.025}}),
 metronome:Object.freeze({name:'Метроном',family:'neural',description:'Ритм движений: цикл атак на 4% короче',bonus:[.35,.1,0],combat:{cooldown:.04}}),
 alarm:Object.freeze({name:'Сигнал тревоги',family:'neural',description:'Быстрое возбуждение: атаки на 3% чаще',bonus:[.2,.25,0],combat:{cooldown:.03}}),
 quiet:Object.freeze({name:'Тихий импульс',family:'neural',description:'Точный контроль: +2,5% шанса крита',bonus:[0,.15,.35],combat:{crit:.025}})
});
// Game UI reads the same numeric bonuses as combat; prose alone is not a stat sheet.
export function towerMutationEffectText(id,rarity=0){
 const mod=TOWER_MUTATIONS[id];if(!mod)return '';
 const names=['скорость','сила','манёвр'];
 const format=n=>Number(n.toFixed(2)).toLocaleString('ru-RU',{maximumFractionDigits:2});
 const effects=mod.bonus.flatMap((amount,i)=>amount?[names[i]+' +'+format(amount)+(i===1?' (шанс крита)':'')]:[]);
 if(mod.combat?.crit)effects.push('крит +'+format(mod.combat.crit*100)+'% (прямой бонус)');
 if(mod.combat?.cooldown)effects.push('откат атак −'+format(mod.combat.cooldown*100)+'%');
 const {kind,step}=rarityEffect(id);
 if(rarity>0){
  const amount=format(step*rarity*(kind===3?1000:100));
  effects.push('Редкость: '+(kind===3?'восстановление −'+amount+' мс':(kind===1?'крит':names[kind])+' +'+amount+' п. п.'));
 }
 return effects.join(' · ');
}
export const TOWER_MUTATION_IDS=Object.freeze(Object.keys(TOWER_MUTATIONS));
export const TOWER_MUTATION_LIMIT=6;
export const TOWER_RARITIES=Object.freeze([
 {name:'ОБЫЧНАЯ',colour:null},{name:'ЗЕЛЁНАЯ',colour:'#60a95b'},
 {name:'СИНЯЯ',colour:'#4b94d2'},{name:'ФИОЛЕТОВАЯ',colour:'#9b6acd'},
 {name:'ОРАНЖЕВАЯ',colour:'#e5a44b'},{name:'КРАСНАЯ',colour:'#d84a3e'}
]);
export const towerMutationRarity=clearedFloor=>Math.min(5,Math.max(0,Math.floor((clearedFloor-1)/30)));
// Single source of truth for the preview and for each awarded detail.
export function towerBossRarityOdds(floor,previousWins=0){
 const rarity=towerMutationRarity(floor),highest=TOWER_RARITIES.length-1;
 if(previousWins>0||rarity===highest)return [{rarity,percent:100}];
 if(rarity===highest-1)return [{rarity,percent:93},{rarity:rarity+1,percent:7}];
 return [{rarity,percent:92},{rarity:rarity+1,percent:7},{rarity:rarity+2,percent:1}];
}
export function rollTowerBossRarity(floor,previousWins,random){
 const odds=towerBossRarityOdds(floor,previousWins);
 if(odds.length===1)return odds[0].rarity;
 const roll=random();
 let cumulative=0;
 for(const {rarity,percent} of odds){
  cumulative+=percent;
  if(roll<cumulative/100)return rarity;
 }
 return odds.at(-1).rarity;
}
const rarityWeights=[1,.4,.2];
const towerCurves=[statMultiplier,critChance,statMultiplier];
const towerOverflowSlopes=[.02,.005,.02];
const towerEquipmentCaps=[.08,.02,.08];
const towerEffectCaps=Object.freeze([2,.75,2]);
const rarityEffect=(type)=>{
 const mod=TOWER_MUTATIONS[type];
 if(mod.combat?.cooldown)return {kind:3,step:.0045};
 if(mod.combat?.crit)return {kind:1,step:.005};
 const kind=mod.bonus.indexOf(Math.max(...mod.bonus));
 return {kind,step:kind===1?.005:.0075};
};
function towerRarityBonuses(items){
 const byEffect=[[],[],[],[]];
 for(const {type,rarity} of items){
  if(!TOWER_MUTATIONS[type]||!(rarity>0))continue;
  const {kind,step}=rarityEffect(type);
  byEffect[kind].push(step*rarity);
 }
 return byEffect.map(bonuses=>bonuses.sort((a,b)=>b-a).slice(0,3)
  .reduce((sum,bonus,i)=>sum+bonus*rarityWeights[i],0));
}
export function towerAttackInterval(combat,{timing=CONFIG.combat,spine=1}={}){
 const cycle=timing.windupSec+timing.thrustSec+timing.recoverSec;
 const cooldown=timing.attackCooldownSec*(1+.64*(1-spine))*combat.cooldownMultiplier;
 return Math.max(cycle,cooldown)-(combat.recoveryReduction??0);
}
// Simulation-only; does not modify active combat bonuses until balancing is approved.
export const towerRarityMultiplier=(rarity,step=.12)=>1+Math.min(5,Math.max(0,rarity))*step;
export const towerMutationInstallPrice=run=>Math.ceil(100*Math.pow(1.55,run?.modInstallations??0))*COIN_SCALE;
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
 // Only the headless physics harness ever attaches rarityPhysics to the
 // transient garage entry. A real run/save never serializes this field.
 // No rarity multiplier is enabled in player-facing game rules.
 const equippedParts=new Set(patient?.equippedSegments??[]);
 const segments=(patient?.segmentInventory??[]).filter(item=>equippedParts.has(item.id));
 const types=[...(patient?.mutations??[]),...segments.map(item=>item.type)];
 const offline=patient?.rarityPhysics;
 const mutationBonus=offline?.effective??towerMutationBonus(types);
 const surgeryBonus=towerSurgeryBonus(patient?.surgeries,robot);
 const effective=snapshot.effective.map((n,i)=>n+mutationBonus[i]+surgeryBonus[i]);
 const combat=offline?{crit:offline.crit,cooldownMultiplier:offline.cooldownMultiplier}:towerMutationCombatBonus(types);
 const rarity=offline?[0,0,0,0]:towerRarityBonuses([...towerInstalledItems(patient??{}),...segments]);
 const slopes=towerOverflowSlopes;
 const baseEffects=snapshot.base.map((points,index)=>towerCurves[index](points)+(offline?0:Math.max(0,points-9)*slopes[index]));
 const effects=effective.map((points,index)=>{
  const baseOverflow=Math.max(0,snapshot.base[index]-9);
  const equipmentOverflow=Math.max(0,points-9)-baseOverflow;
  const growth=offline?0:baseOverflow*slopes[index]+Math.min(towerEquipmentCaps[index],equipmentOverflow*slopes[index]);
  return Math.min(towerEffectCaps[index],towerCurves[index](points)+growth+rarity[index]+(index===1?combat.crit:0));
 });
 combat.recoveryReduction=rarity[3];
 return {...snapshot,mutationBonus,surgeryBonus,effective,effects,baseEffects,effectCaps:towerEffectCaps,combat};
}
export function grantTowerMutationDraft(run,random=Math.random,previousBossWins=0){
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
 run.mutationDraft={floor:run.level,options,rarity:rollTowerBossRarity(run.level-1,previousBossWins,random)};
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
 if(!Number.isSafeInteger(spent)||spent+price>MAX_ISSUED_COINS||!Number.isSafeInteger(price))throw Error('Недопустимая стоимость.');
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
