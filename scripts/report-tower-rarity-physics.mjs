// Paired physical combat observations for temporary H8 rarity steps.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {towerRarityScenario} from '../src/tower/rarity-scenarios.js';
import {towerMutationBonus,towerMutationCombatBonus} from '../src/tower/mutations.js';
export const H8_STEPS=Object.freeze([0,.08,.10,.12]);
export const H8_LOADOUTS=Object.freeze({
 mixed:['turbo','piston','adrenal','focus','synapse','gyro'],
 neural:['optic','focus','quiet','flywheel','metronome','synapse']
});
export const H8_FLOORS=Object.freeze([31,91,181]);
const round=x=>Math.round(x*1000)/1000;
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<1e-7;
const key=row=>[row.floor,row.rarityCompare?.preset,row.seed].join(':');
function metrics(rows){
 const n=rows.length,coins=rows.map(r=>r.coins).sort((a,b)=>a-b);
 return {fights:n,finished:rows.filter(r=>r.completed).length,
  timedOut:rows.filter(r=>!r.completed).length,wins:rows.filter(r=>r.completed&&r.winner===0).length,
  finishedWithoutWinner:rows.filter(r=>r.completed&&r.winner===null).length,
  playerAlive:rows.filter(r=>r.playerAlive).length,
  playerHits:rows.reduce((s,r)=>s+r.playerHits,0),
  playerSwings:rows.reduce((s,r)=>s+r.playerSwings,0),
  personalKills:rows.reduce((s,r)=>s+r.personalEliminations,0),
  averageCoins:round(coins.reduce((a,b)=>a+b,0)/n),
  medianCoins:coins[Math.floor((n-1)/2)],
  maxBodyOverlapCm:round(Math.max(...rows.map(r=>r.maxBodyOverlapCm)))};
}
export function compareH8(batches){
 if(!Array.isArray(batches)||batches.length!==4)throw Error('Expected exactly four H8 steps');
 const indexes=new Map(),read=(step,k)=>indexes.get(step).get(k);
 for(const batch of batches){
  if(batch?.rarityCompare!==true||!H8_STEPS.includes(batch.rarityStep)||indexes.has(batch.rarityStep))
   throw Error('Invalid or duplicated H8 step');
  if(!Array.isArray(batch.runs)||batch.runs.length!==12)throw Error('Expected twelve fights per step');
  const set=new Map();
  for(const r of batch.runs){
   const cmp=r.rarityCompare,step=batch.rarityStep,types=H8_LOADOUTS[cmp?.preset];
   if(!types||!H8_FLOORS.includes(r.floor)||cmp.step!==step||cmp.rank!==Math.min(5,Math.floor((r.floor-1)/30)))
    throw Error('Invalid scenario '+key(r));
   if(set.has(key(r)))throw Error('Duplicate physical scenario '+key(r));
   if(r.errors?.length||r.nonFinite||r.friendlyHits||r.initialPenetrations||r.initialOverlaps||
      r.maxBodyOverlapCm>2)throw Error('Physical safety regression '+key(r));
   if(!Number.isFinite(r.coins)||r.coins<0||!Number.isInteger(r.personalEliminations)||
      r.personalEliminations<0||!Number.isInteger(r.playerHits)||r.playerHits<0||
      !Number.isInteger(r.playerSwings)||r.playerSwings<0)throw Error('Incomplete physical data '+key(r));
   if(r.completed&&r.winner!==null&&!Number.isInteger(r.winner))throw Error('Invalid outcome');
   if(!r.completed&&r.winner!==null)throw Error('Unfinished with winner');
   const live={effective:towerMutationBonus(types),...towerMutationCombatBonus(types)};
   const expected=step===0?live:towerRarityScenario(types.map(type=>({type,rarity:cmp.rank})),step);
   const same=(a,b)=>Array.isArray(a)&&Array.isArray(b)?
      a.length===b.length&&a.every((value,i)=>near(value,b[i])):near(a,b);
   for(const prop of ['effective','crit','cooldownMultiplier'])
    if(!same(cmp.live?.[prop],live[prop])||!same(cmp.proposed?.[prop],expected[prop])||
       !same(cmp.actual?.[prop],expected[prop]))
     throw Error('H8 bonus was not physically applied: '+key(r)+' '+prop);
   set.set(key(r),r);
  }
  indexes.set(batch.rarityStep,set);
 }
 const baseline=indexes.get(0),keys=[...baseline.keys()].sort();
 if(keys.length!==12)throw Error('Missing baseline');
 for(const step of H8_STEPS){
  const set=indexes.get(step);
  if(set.size!==12||keys.some(k=>!set.has(k)))throw Error('Unpaired floor, loadout or seed');
 }
 const baselineRows=keys.map(k=>read(0,k)),baseMetrics=metrics(baselineRows);
 const totals=H8_STEPS.map(step=>{
  const x=metrics(keys.map(k=>read(step,k)));
  return {step,...x,deltaHits:x.playerHits-baseMetrics.playerHits,
   deltaKills:x.personalKills-baseMetrics.personalKills,
   deltaAverageCoins:round(x.averageCoins-baseMetrics.averageCoins)};
 });
 const groups=[];
 for(const floor of H8_FLOORS)for(const preset of Object.keys(H8_LOADOUTS)){
  const related=keys.filter(k=>{const r=read(0,k);return r.floor===floor&&r.rarityCompare.preset===preset;});
  if(related.length!==2)throw Error('Expected two seeds for '+floor+' / '+preset);
  for(const step of H8_STEPS){
   const values=related.map(k=>read(step,k)),p=values[0].rarityCompare.proposed;
   groups.push({floor,preset,step,rank:Math.min(5,Math.floor((floor-1)/30)),
    bonus:p.effective,crit:p.crit,cooldownMultiplier:p.cooldownMultiplier,
    ...metrics(values)});
  }
 }
 return {description:'48 physical fights with paired seeds and transient rarity effects',
  totalFights:48,pairedCases:12,steps:[...H8_STEPS],
  policy:batches[0].policy,seconds:batches[0].seconds,totals,groups,
  limitation:'Two seeds per case, one orbit autopilot, time-censored fights. Not enough to approve live rarity.'};
}
export function h8Markdown(data){
 const out=[
  '# Башня H8 — физическое сравнение 0/8/10/12%','',
  '48 парных физических схваток (шаг 1/60 с), а не 48 полных прохождений.',
  '0% — действующий баланс без усиления чисел от редкости. Остальные проценты применены только во временном состоянии тестового пациента.',
  'У всех четырёх режимов одинаковые противники, арена, комплект модулей и случайные сиды.',
  'Управление — orbit-автопилот, не человек. Лимит '+data.seconds+' с: незавершённые бои не считаются поражениями. На каждую пару этажа и комплекта приходится только 2 сида.','',
  '| Шаг | Боёв | Завершено | Лимит | Побед игрока | Жив игрок | Попаданий | Изменение от 0% | Личных добиваний | Монеты в среднем |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|'
 ];
 for(const t of data.totals)out.push('| '+[Math.round(t.step*100)+'%',t.fights,t.finished,t.timedOut,t.wins,t.playerAlive,
  t.playerHits,t.deltaHits,t.personalKills,t.averageCoins].join(' | ')+' |');
 out.push('','## Сценарии по этажам и комплектам','',
 '| Этаж | Комплект | Ранг | Шаг | Скорость/сила/манёвр | Крит + | Откат × | Попаданий | Побед | Средний доход |',
 '|---:|---|---:|---:|---|---:|---:|---:|---:|---:|');
 for(const g of data.groups)out.push('| '+[g.floor,g.preset,g.rank,Math.round(g.step*100)+'%',
  g.bonus.map(round).join('/'),round(g.crit*100)+'%',g.cooldownMultiplier,g.playerHits,g.wins,g.averageCoins].join(' | ')+' |');
 out.push('','Выводы ограничены выборкой, промахи возможны, капы крита и отката сохраняются. Ни цены, ни реальный баланс модификаций автоматически не меняются.','');
 return out.join('\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const batches=H8_STEPS.map(step=>JSON.parse(fs.readFileSync('artifacts/h8-step-'+step+'.json','utf8')));
 const data=compareH8(batches);
 fs.writeFileSync('artifacts/h8-rarity-physical-report.json',JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync('artifacts/h8-rarity-physical-report.md',h8Markdown(data));
 console.log('H8_SUMMARY '+JSON.stringify({fights:data.totalFights,pairedCases:data.pairedCases,totals:data.totals}));
}
