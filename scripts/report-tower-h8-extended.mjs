// Extended H8: real-physics, same-start-seed comparisons across pilot policies.
// Never enable numerical rarity in live gameplay on the basis of this report.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {H8_STEPS,H8_LOADOUTS,H8_FLOORS} from './report-tower-rarity-physics.mjs';
import {towerRarityScenario} from '../src/tower/rarity-scenarios.js';
import {towerMutationBonus,towerMutationCombatBonus} from '../src/tower/mutations.js';

export const H8_EXT_POLICIES=Object.freeze(['approach','orbit','evade']);
export const H8_EXT_SEEDS=4;
const round=n=>Math.round(n*1000)/1000;
const approx=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
const key=r=>[r.floor,r.rarityCompare?.preset,r.seed].join(':');
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)/2)];
const average=values=>round(values.reduce((a,b)=>a+b,0)/values.length);
const oneOf=(value,allowed)=>allowed.includes(value);
function checkNumericBonuses(r,step){
 const cmp=r.rarityCompare,types=H8_LOADOUTS[cmp?.preset],rank=Math.min(5,Math.floor((r.floor-1)/30));
 if(!types||!H8_FLOORS.includes(r.floor)||cmp.rank!==rank||cmp.step!==step)
  throw Error('Invalid H8 floor/loadout/rank: '+key(r));
 const live={effective:towerMutationBonus(types),...towerMutationCombatBonus(types)};
 const wanted=step===0?live:towerRarityScenario(types.map(type=>({type,rarity:rank})),step);
 const equal=(a,b)=>Array.isArray(a)&&Array.isArray(b)?
  a.length===b.length&&a.every((v,i)=>approx(v,b[i])):approx(a,b);
 for(const prop of ['effective','crit','cooldownMultiplier']){
  if(!equal(cmp.live?.[prop],live[prop])||!equal(cmp.proposed?.[prop],wanted[prop])||
     !equal(cmp.actual?.[prop],wanted[prop]))
   throw Error('H8 actual fighter bonus differs from proposal: '+key(r)+' '+prop);
 }
}
function validateFight(r,step,seconds){
 if(!r||r.kind!=='normal'||!r.rarityCompare)throw Error('Invalid H8 fight');
 checkNumericBonuses(r,step);
 if(!Number.isInteger(r.seed)||!Number.isFinite(r.duration)||r.duration<0||r.duration>seconds+1)
  throw Error('Invalid duration or seed: '+key(r));
 if(!Number.isFinite(r.coins)||r.coins<0||!Number.isInteger(r.playerHits)||r.playerHits<0||
    !Number.isInteger(r.playerSwings)||r.playerSwings<0||r.playerHits>r.playerSwings||
    !Number.isInteger(r.personalEliminations)||r.personalEliminations<0)
  throw Error('Missing or inconsistent H8 hit/economy counters: '+key(r));
 if(r.errors?.length||r.nonFinite||r.friendlyHits||r.initialOverlaps||r.initialPenetrations||
    !Number.isFinite(r.maxBodyOverlapCm)||r.maxBodyOverlapCm>2)
  throw Error('H8 physics safety regression: '+key(r));
 if(typeof r.completed!=='boolean'||typeof r.playerAlive!=='boolean')
  throw Error('Missing H8 status: '+key(r));
 if(r.completed&&r.winner!==null&&(!Number.isInteger(r.winner)||r.winner<0))
  throw Error('Invalid finished winner: '+key(r));
 if(!r.completed&&r.winner!==null)throw Error('Winner in unfinished fight: '+key(r));
}
function metric(rows){
 const coins=rows.map(x=>x.coins),times=rows.filter(x=>x.completed).map(x=>x.duration);
 const hits=rows.reduce((s,r)=>s+r.playerHits,0),swings=rows.reduce((s,r)=>s+r.playerSwings,0);
 return {bouts:rows.length,finished:times.length,censored:rows.length-times.length,
  playerWins:rows.filter(r=>r.completed&&r.winner===0).length,
  noWinnerFinished:rows.filter(r=>r.completed&&r.winner===null).length,
  playerAliveAtCutoff:rows.filter(r=>r.playerAlive).length,
  swings,hits,hitFraction:swings?round(hits/swings):null,
  kills:rows.reduce((s,r)=>s+r.personalEliminations,0),
  coinsAverage:average(coins),coinsMedian:median(coins),
  completedDurationMedian:times.length?median(times):null,
  maximalOverlapCm:round(Math.max(...rows.map(r=>r.maxBodyOverlapCm)))};
}
export function summarizeExtendedH8(batches,{seeds=H8_EXT_SEEDS}={}){
 const policies=H8_EXT_POLICIES,steps=H8_STEPS,expected=policies.length*steps.length;
 if(!Number.isInteger(seeds)||seeds<2||!Array.isArray(batches)||batches.length!==expected)
  throw Error('H8 extended requires all twelve policy/step batches');
 const maps=new Map(),scenarios=H8_FLOORS.length*Object.keys(H8_LOADOUTS).length;
 let duration=null;
 for(const b of batches){
  const policy=b.policyKey,step=b.rarityStep,label=policy+':'+step;
  if(!oneOf(policy,policies)||!oneOf(step,steps)||b.rarityCompare!==true||maps.has(label))
   throw Error('Invalid or duplicate extended policy/rarity batch: '+label);
  if(!Number.isInteger(b.seconds)||b.seconds<5||duration!==null&&b.seconds!==duration)
   throw Error('Mismatched H8 duration limit');
  duration=b.seconds;
  if(!Array.isArray(b.runs)||b.runs.length!==scenarios*seeds)
   throw Error('H8 extended batch must contain exactly '+scenarios*seeds+' physical fights');
  const indexed=new Map();
  for(const row of b.runs){
   validateFight(row,step,b.seconds);
   const id=key(row);
   if(indexed.has(id))throw Error('Duplicate H8 fight '+label+':'+id);
   indexed.set(id,row);
  }
  for(const floor of H8_FLOORS)for(const preset of Object.keys(H8_LOADOUTS)){
   const cohort=b.runs.filter(r=>r.floor===floor&&r.rarityCompare.preset===preset);
   if(cohort.length!==seeds||new Set(cohort.map(r=>r.seed)).size!==seeds)
    throw Error('Missing seeds for '+label+':'+floor+'/'+preset);
  }
  maps.set(label,indexed);
 }
 const baseline=maps.get(policies[0]+':0'),keys=[...baseline.keys()].sort();
 if(keys.length!==scenarios*seeds)throw Error('Incomplete H8 baseline');
 for(const policy of policies)for(const step of steps){
  const m=maps.get(policy+':'+step);
  if(m.size!==keys.length||keys.some(k=>!m.has(k)))
   throw Error('H8 seed/floor/loadout pairing differs for '+policy+':'+step);
 }
 const perPolicy=[],perRank=[],perLoadout=[];
 for(const policy of policies){
  const base=maps.get(policy+':0'),baseAll=keys.map(k=>base.get(k));
  for(const step of steps){
   const current=maps.get(policy+':'+step),all=keys.map(k=>current.get(k));
   const paired=keys.map(k=>({base:base.get(k),now:current.get(k)}));
   const deltas=paired.map(p=>p.now.playerHits-p.base.playerHits);
   const monies=paired.map(p=>p.now.coins-p.base.coins);
   perPolicy.push({policy,step,...metric(all),pairedHitDifferenceAverage:average(deltas),
    pairedCoinDifferenceAverage:average(monies),
    moreHits:deltas.filter(n=>n>0).length,fewerHits:deltas.filter(n=>n<0).length,
    equalHits:deltas.filter(n=>n===0).length,
    winsDifference:metric(all).playerWins-metric(baseAll).playerWins});
   for(const floor of H8_FLOORS){
    const batch=all.filter(r=>r.floor===floor);
    perRank.push({policy,step,floor,rank:Math.min(5,Math.floor((floor-1)/30)),...metric(batch)});
   }
   for(const preset of Object.keys(H8_LOADOUTS)){
    const batch=all.filter(r=>r.rarityCompare.preset===preset);
    perLoadout.push({policy,step,preset,...metric(batch)});
   }
  }
 }
 return {source:'headless real 1/60-second physics; not human outcomes',
  numberOfPhysicalFights:batches.reduce((s,b)=>s+b.runs.length,0),
  pairedContexts:keys.length,policies:[...policies],steps:[...steps],
  seedsPerFloorAndLoadout:seeds,secondsLimit:duration,perPolicy,perRank,perLoadout,
  limitations:['Only 4 seeds per floor/loadout/policy; not a human test',
   'Same initial PRNG seeds do not guarantee identical subsequent random streams after gameplay diverges',
   'Censored fights are not player defeats; do not infer unrestricted win probabilities',
   '6 installed modifications are supplied by test fixture, without proving their affordability',
   'Do not enable live rarity or change prices solely from this sample']};
}
export function extendedH8Markdown(data){
 const out=[
  '# Башня H8 — расширенная физическая проверка редкости','',
  'Всего '+data.numberOfPhysicalFights+' отдельных боёв при '+data.pairedContexts+
   ' общих наборах этажа, комплекта и случайного сида.',
  'Сценарии: A-01, C-01, F-01; два комплекта из шести модулей, '+data.seedsPerFloorAndLoadout+
   ' сида на каждую пару. Стратегии: приближение, орбита, уклонение.',
  'Каждый бой использует настоящую физику с шагом 1/60 с. 0% означает текущий боевой баланс; 8/10/12% применяются только к временному тестовому бойцу.','',
  '| Управление | Редкость | Бои | Завершено | Лимит | Побед | Жив к лимиту | Замахов | Попаданий | Попаданий/замах | Личных добиваний | Средний доход | Разница попаданий к 0% | Улучшений/ухудшений/равных |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'
 ];
 for(const t of data.perPolicy)out.push('| '+[
  t.policy,Math.round(t.step*100)+'%',t.bouts,t.finished,t.censored,t.playerWins,
  t.playerAliveAtCutoff,t.swings,t.hits,
  t.hitFraction===null?'—':round(t.hitFraction*100)+'%',
  t.kills,t.coinsAverage,t.pairedHitDifferenceAverage,
  [t.moreHits,t.fewerHits,t.equalHits].join('/')
 ].join(' | ')+' |');
 out.push('','## Разбивка по рангам (этажи 31 / 91 / 181)','',
  '| Управление | Редкость | Этаж | Ранг | Бои | Завершено | Жив к лимиту | Попадания | Доход |',
  '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
 for(const t of data.perRank)out.push('| '+[
  t.policy,Math.round(t.step*100)+'%',t.floor,t.rank,t.bouts,t.finished,
  t.playerAliveAtCutoff,t.hits,t.coinsAverage
 ].join(' | ')+' |');
 out.push('','## Ограничения эксперимента','');
 for(const limitation of data.limitations)out.push('- '+limitation);
 out.push('','Предварительный баланс 8/10/12% остаётся неутверждённым.','');
 return out.join('\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const batches=H8_EXT_POLICIES.flatMap(policy=>H8_STEPS.map(step=>({
  ...JSON.parse(fs.readFileSync('artifacts/h8x-'+policy+'-'+step+'.json','utf8')),policyKey:policy
 })));
 const summary=summarizeExtendedH8(batches);
 fs.writeFileSync('artifacts/h8-extended-summary.json',JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync('artifacts/h8-extended-report.md',extendedH8Markdown(summary));
 console.log('H8_EXTENDED_TOTAL '+JSON.stringify({fights:summary.numberOfPhysicalFights,
  contexts:summary.pairedContexts,policies:summary.policies,seeds:summary.seedsPerFloorAndLoadout}));
 for(const row of summary.perPolicy)console.log('H8_EXTENDED_POLICY '+JSON.stringify(row));
}
