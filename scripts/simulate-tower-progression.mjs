// Scenario-only H5/H8 analysis. Win and personal-kill rates are assumptions,
// NOT observed physics. Does not touch the live economy or combat stats.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TOWER_MUTATION_IDS,towerMutationInstallPrice} from '../src/tower/mutations.js';
import {COIN_SCALE} from '../src/betting/coins.js';
import {STARTING_CAPITAL} from '../src/betting/ledger.js';
import {INSURANCE_START_PRICE,insuranceCost} from '../src/tower/insurance.js';
import {towerOpponentReward} from '../src/boss/encounter.js';
import {ARTIFACT_COMPLETION_REWARD} from '../src/tower/artifacts.js';
import {towerRarityScenario,TOWER_RARITY_SCENARIO_STEPS} from '../src/tower/rarity-scenarios.js';

export const PROGRESSION_PRICE_MODELS=Object.freeze([
 {name:'1000 × 1.45^N',first:100,growth:1.45},
 {name:'1000 × 1.55^N',first:100,growth:1.55},
 {name:'1000 × 1.70^N',first:100,growth:1.70},
 {name:'1250 × 1.45^N',first:125,growth:1.45}
]);
export const PROGRESSION_POLICIES=Object.freeze([
 {name:'осторожная',win:.94,kill:.17,bossKill:.25,danger:.35,insurance:.80,reroll:.06,surgery:.32,replace:.08,skills:.08},
 {name:'средняя',win:.91,kill:.32,bossKill:.45,danger:.55,insurance:.55,reroll:.13,surgery:.50,replace:.12,skills:.15},
 {name:'агрессивная',win:.88,kill:.52,bossKill:.70,danger:.80,insurance:.32,reroll:.24,surgery:.60,replace:.16,skills:.22}
]);
export const PROGRESSION_MILESTONES=Object.freeze([5,10,15,20,25,30,60,90,120]);
const START=STARTING_CAPITAL,MAX_FLOOR=120;
const rng=seed=>{let x=(seed>>>0)||0x9e3779b9;return ()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
const price=(model,n)=>Math.ceil(model.first*model.growth**n)*COIN_SCALE;
const copy=xs=>xs.map(x=>({...x}));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const pct=(xs,p)=>{if(!xs.length)return null;const a=[...xs].sort((x,y)=>x-y);return a[Math.floor((a.length-1)*p)];};
const metrics=xs=>({p10:pct(xs,.1),median:pct(xs,.5),p90:pct(xs,.9)});
const round=x=>Math.round(x*100)/100;

export function simulateTowerProgression({seed=1,policy=PROGRESSION_POLICIES[1],model=PROGRESSION_PRICE_MODELS[1],rarityStep=.12,maxFights=420}={}){
 if(!TOWER_RARITY_SCENARIO_STEPS.includes(rarityStep)||!Number.isInteger(maxFights)||maxFights<1)throw Error('Invalid scenario');
 const random=rng((seed*2654435761+1013904223)>>>0),milestones={},cycleEntry=[];
 let bank=START,earned=0,spent=0,level=1,maxCleared=0,fights=0,losses=0,returns=0,resets=0;
 let stock=[],equipped=[],paidInstalls=0,nextItem=1,ownedTotal=0,operations=0;
 let policyPrice=INSURANCE_START_PRICE,checkpoint=null,insurancePurchases=0,insuranceRenewals=0;
 let waitingFights=0,rerolls=0,skills=0,operationPurchases=0,critCapped=0,cooldownCapped=0;
 const debit=n=>{if(!Number.isSafeInteger(n)||n<0||bank<n)return false;bank-=n;spent+=n;return true;};
 const credit=n=>{bank+=n;earned+=n;};
 const snap=()=>({level,stock:copy(stock),equipped:copy(equipped),paidInstalls,operations});
 const cap=n=>Math.min(3,Math.max(0,Math.floor((n-6)/5)));
 const missing=()=>stock.some(x=>{
  const old=equipped.find(y=>y.type===x.type);
  return (!old&&equipped.length<6)||(old&&x.rarity>old.rarity);
 });
 const install=()=>{
  const candidates=[...stock].sort((a,b)=>b.rarity-a.rarity||a.id-b.id);
  for(const item of candidates){
   const old=equipped.find(x=>x.type===item.type);
   if((old&&old.rarity>=item.rarity)||(!old&&equipped.length>=6))continue;
   if(!debit(price(model,paidInstalls)))return;
   stock=stock.filter(x=>x.id!==item.id);
   if(old){equipped=equipped.filter(x=>x.id!==old.id);stock.push(old);}
   equipped.push(item);paidInstalls++;break;
  }
 };
 const prepare=()=>{
  if(level>1&&(level-1)%5===0&&random()<policy.insurance&&debit(insuranceCost({price:policyPrice,checkpoint}))){
   const renewal=checkpoint!==null;
   checkpoint=snap();insurancePurchases++;if(renewal)insuranceRenewals++;
   if(renewal)policyPrice+=Math.ceil(policyPrice/10);
  }
  if(level>=11&&operations<cap(level)&&random()<policy.surgery){
   const cost=[60,100,150][operations]*COIN_SCALE;
   if(debit(cost)){operations++;operationPurchases++;}
  }else if(operations&&random()<policy.replace){
   if(debit(Math.max(60,Math.ceil([60,100,150][Math.min(2,operations)]*.85))*COIN_SCALE))operationPurchases++;
  }
  if(random()<policy.reroll){
   const amount=random()<.22?2:1;
   for(let i=0;i<amount;i++)if(debit(100))rerolls++;
  }
  if(level>5&&random()<policy.skills)skills++;
  install();
 };
 while(fights<maxFights&&level<=MAX_FLOOR){
  prepare();
  const effects=towerRarityScenario(equipped,rarityStep);
  if(effects.critAtCap)critCapped++;
  if(effects.cooldownAtCap)cooldownCapped++;
  if(missing()&&bank<price(model,paidInstalls))waitingFights++;
  const local=(level-1)%30+1,cycle=Math.floor((level-1)/30);
  const boss=local%5===0,danger=!boss&&random()<policy.danger;
  const opponents=boss?3:Math.min(9,1+Math.floor(local/2));
  const teamPenalty=[0,.035,.065,.085][Math.min(3,cycle)];
  const statBonus=effects.effective.reduce((a,b)=>a+b,0)*.012+operations*.005;
  const combatBonus=(1-effects.cooldownMultiplier)*.05+effects.crit*.04;
  const chance=clamp(policy.win-.085*local/30-teamPenalty-(danger?.035:0)+statBonus+combatBonus,.40,1);
  const win=random()<chance;fights++;
  for(let id=0;id<opponents;id++){
   const personal=(boss&&id===0?policy.bossKill:policy.kill)*(win?1:.5);
   if(random()<personal)credit(towerOpponentReward(boss&&id===0,danger));
  }
  if(win){
   maxCleared=Math.max(maxCleared,level);
   if(boss){
    const remaining=TOWER_MUTATION_IDS.filter(type=>![...stock,...equipped].some(x=>x.type===type));
    const kinds=remaining.length?remaining:TOWER_MUTATION_IDS;
    stock.push({id:nextItem++,type:kinds[Math.floor(random()*kinds.length)],rarity:Math.min(5,cycle)});
    ownedTotal++;
    // Rare collection completion is only a simple proxy, not the real drop engine.
    if(random()<.03)credit(ARTIFACT_COMPLETION_REWARD);
   }
   if(PROGRESSION_MILESTONES.includes(level)&&!milestones[level])
    milestones[level]={bank,installed:equipped.length,owned:stock.length+equipped.length,fights};
   if(local===30){
    cycleEntry.push({from:level,to:level+1,bank,installed:equipped.length,operations});
    checkpoint=null;policyPrice=INSURANCE_START_PRICE;
   }
   level++;
  }else{
   losses++;
   if(checkpoint){
    level=checkpoint.level;stock=copy(checkpoint.stock);equipped=copy(checkpoint.equipped);
    paidInstalls=checkpoint.paidInstalls;operations=checkpoint.operations;
    checkpoint=null;returns++;
   }else{
    level=1;stock=[];equipped=[];paidInstalls=0;operations=0;checkpoint=null;resets++;
   }
  }
 }
 if(bank<0||bank+spent!==START+earned)throw Error('Virtual currency ledger mismatch');
 return {bank,earned,spent,fights,losses,returns,resets,maxCleared,completed:maxCleared>=MAX_FLOOR,
  installed:equipped.length,ownedTotal,paidInstalls,operations,operationPurchases,rerolls,skills,
  insurancePurchases,insuranceRenewals,waitingFights,cycleEntry,milestones,
  critCapRate:round(critCapped/Math.max(1,fights)),cooldownCapRate:round(cooldownCapped/Math.max(1,fights))};
}

export function progressionMatrix({seeds=160,maxFights=420}={}){
 if(!Number.isInteger(seeds)||seeds<1||seeds>20000)throw Error('Invalid seed count');
 const rows=[];
 for(const model of PROGRESSION_PRICE_MODELS)for(const step of TOWER_RARITY_SCENARIO_STEPS)
  for(const policy of PROGRESSION_POLICIES){
   const samples=Array.from({length:seeds},(_,i)=>simulateTowerProgression({seed:i+1,model,rarityStep:step,policy,maxFights}));
   rows.push({model:model.name,step,policy:policy.name,
    reach30:round(samples.filter(x=>x.maxCleared>=30).length/seeds),
    reach120:round(samples.filter(x=>x.completed).length/seeds),
    bank:metrics(samples.map(x=>x.bank)),installed:metrics(samples.map(x=>x.installed)),
    losses:metrics(samples.map(x=>x.losses)),returns:metrics(samples.map(x=>x.returns)),
    waiting:metrics(samples.map(x=>x.waitingFights)),
    critCapRate:round(samples.reduce((s,x)=>s+x.critCapRate,0)/seeds),
    cooldownCapRate:round(samples.reduce((s,x)=>s+x.cooldownCapRate,0)/seeds),
    milestones:PROGRESSION_MILESTONES.map(floor=>{
     const reached=samples.map(x=>x.milestones[floor]).filter(Boolean);
     return {floor,reached:round(reached.length/seeds),
      bank:metrics(reached.map(x=>x.bank)),owned:metrics(reached.map(x=>x.owned)),
      installed:metrics(reached.map(x=>x.installed)),fights:metrics(reached.map(x=>x.fights))};
    })});
  }
 return {assumptions:{seeds,maxFights,startingBank:START,maxFloor:MAX_FLOOR,
  estimates:'Hypothetical win and personal-kill probabilities; NOT headless physics',
  insured:'explicit manual purchases after bosses; 10% new/3% renewal; no automatic payment',
  rarity:'8/10/12% OFFLINE ONLY; live stats remain unchanged'},rows};
}
export function progressionMarkdown(data){
 const fmt=x=>[x.p10,x.median,x.p90].map(n=>n===null?'—':n).join('/');
 const out=['# Башня II — сценарное сравнение экономики и редкости','',
  'Вероятности побед и личных добиваний **предположены**, а не измерены в физических боях или Telegram.',
  'Симуляция нужна для сравнения гипотез, **не для утверждения игрового баланса**.',
  '', '## Сводка цен и сценариев','',
  '| Цена | Редкость | Политика | Достигнут этаж 30 | Достигнут этаж 120 | Банк P10/мед/P90 | Установлено P10/мед/P90 | Поражения (медиана) | Дефицит (боёв, медиана) |',
  '|---|---:|---|---:|---:|---|---|---:|---:|'];
 for(const r of data.rows)out.push('| '+[r.model,Math.round(r.step*100)+'%',r.policy,Math.round(r.reach30*100)+'%',Math.round(r.reach120*100)+'%',fmt(r.bank),fmt(r.installed),r.losses.median,r.waiting.median].join(' | ')+' |');
 out.push('','## Редкость: арифметическая модель, не боевые результаты','',
 '| Комплект | Ранг | Шаг | Прямые бонусы скорость/сила/манёвр | Синергия | Крит | Откат | Достигнут предел |',
 '|---|---:|---:|---|---|---:|---:|---|');
 const loadouts=[{name:'Смешанный',types:['turbo','piston','adrenal','focus','synapse','gyro']},
  {name:'Крит/откат',types:['optic','focus','quiet','flywheel','metronome','synapse']}];
 for(const set of loadouts)for(let rank=0;rank<=5;rank++)for(const step of TOWER_RARITY_SCENARIO_STEPS){
  const r=towerRarityScenario(set.types.map(type=>({type,rarity:rank})),step);
  const cap=[r.critAtCap?'крит':'',r.cooldownAtCap?'откат':''].filter(Boolean).join(',')||'нет';
  out.push('| '+[set.name,rank,Math.round(step*100)+'%',r.direct.map(round).join('/'),r.synergy.map(round).join('/'),round(r.crit*100)+'%',round(r.cooldownMultiplier*100)+'%',cap].join(' | ')+' |');
 }
 out.push('','## Этажи при текущей гипотетической цене 1000 × 1.55^N и среднем поведении','',
  '| Этаж | Доля достигших | Банк P10/мед/P90 | Получено | Установлено | Число боёв до этажа |',
  '|---:|---:|---|---|---|---|');
 const current=data.rows.find(r=>r.model===PROGRESSION_PRICE_MODELS[1].name&&r.step===.12&&r.policy==='средняя');
 for(const m of current.milestones)
  out.push('| '+[m.floor,Math.round(m.reached*100)+'%',fmt(m.bank),fmt(m.owned),fmt(m.installed),fmt(m.fights)].join(' | ')+' |');
 out.push('','## Ограничения','',
  '- В модели учтены условные победы/поражения, возвраты по ДМС, платное продление, операции, замены, рероллы, монеты за личные добивания и переходы циклов A–C.',
  '- Сложность A–C и опасных этажей представлена предполагаемыми штрафами к вероятности победы. Это не настоящая работа AI.',
  '- Бонус 3330 монет смоделирован редким независимым событием, а не настоящей системой коллекции.',
  '- При поражении без ДМС экипировка сбрасывается; при страховом возврате контрольная точка расходуется без возврата монет.',
  '- Рубли в отчёте не используются: все суммы — игровые монеты. Процентили на рубежах посчитаны среди дошедших, отдельно дана доля дошедших.',
  '- Следующий обязательный шаг — headless-бои с реальной физикой, командными сценариями и замерами выживаемости боссов. До них цены и редкость не утверждать.','');
 return out.join('\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const param=k=>process.argv.find(s=>s.startsWith('--'+k+'='))?.slice(k.length+3);
 const data=progressionMatrix({seeds:Number(param('seeds')??160),maxFights:Number(param('max-fights')??420)});
 const json=param('out')??'artifacts/tower-progression-matrix.json';
 const report=param('report')??'artifacts/tower-progression-balance.md';
 fs.mkdirSync(path.dirname(json),{recursive:true});
 fs.mkdirSync(path.dirname(report),{recursive:true});
 fs.writeFileSync(json,JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync(report,progressionMarkdown(data)+'\n');
 console.log('Offline multi-cycle matrix:',data.rows.length,'configurations, seeds:',data.assumptions.seeds);
}
