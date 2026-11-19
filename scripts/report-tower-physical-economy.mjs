// H5 observation: real 1/60s physics, not human playtesting.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const H5_POLICIES=Object.freeze(['approach','orbit','evade']);
const round=x=>Math.round(x*100)/100;
const median=xs=>xs.length?[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)/2)]:null;
const quantile=(xs,q)=>[...xs].sort((a,b)=>a-b)[Math.floor((xs.length-1)*q)];
export function wilson(yes,n){
 if(!Number.isInteger(n)||n<1||!Number.isInteger(yes)||yes<0||yes>n)throw Error('Bad Wilson count');
 const z=1.96,p=yes/n,d=1+z*z/n,c=(p+z*z/(2*n))/d;
 const h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
 return [round(Math.max(0,c-h)),round(Math.min(1,c+h))];
}
const scenarioKey=r=>r.floor+':'+r.seed;
export function physicalEconomyReport(batches){
 if(!Array.isArray(batches)||batches.length!==6)throw Error('Expect 6 policy-scope batches');
 const map=new Map();
 for(const b of batches){
  const policy=b.policyKey,scope=b.cycleTactics?'later':'first',k=policy+':'+scope;
  if(!H5_POLICIES.includes(policy)||map.has(k)||!Array.isArray(b.runs)||!b.runs.length)
   throw Error('Duplicate, missing or invalid batch '+k);
  const seen=new Set();
  for(const r of b.runs){
   const id=scenarioKey(r);
   if(seen.has(id))throw Error('Duplicated physical fight '+id);
   seen.add(id);
   if(r.errors?.length||r.nonFinite||r.friendlyHits)throw Error('Physics failed '+id);
   if(!Number.isFinite(r.coins)||r.coins<0||
      !Number.isInteger(r.personalEliminations)||r.personalEliminations<0)throw Error('Invalid rewards '+id);
   // Tower can complete with winner=null when the patient is immobilized.
   // This is a valid defeat/draw outcome, never a corrupt physical record.
   if(r.completed&&r.winner!==null&&(!Number.isInteger(r.winner)||r.winner<0))throw Error('Invalid winner');
   if(!r.completed&&r.winner!==null)throw Error('Unfinished with winner');
  }
  map.set(k,b.runs);
 }
 for(const scope of ['first','later']){
  const base=new Set(map.get('approach:'+scope).map(scenarioKey));
  for(const policy of H5_POLICIES){
   const s=new Set(map.get(policy+':'+scope).map(scenarioKey));
   if(s.size!==base.size||[...s].some(k=>!base.has(k)))throw Error('Mismatch of floor/seed pairs');
  }
 }
 const groups=[];
 for(const policy of H5_POLICIES)for(const scope of ['first','later']){
  const cohort=map.get(policy+':'+scope);
  for(const kind of ['all','normal','boss']){
   const rows=kind==='all'?cohort:cohort.filter(r=>r.kind===kind);
   if(!rows.length)continue;
   const n=rows.length,finished=rows.filter(r=>r.completed).length,
    won=rows.filter(r=>r.completed&&r.winner===0).length,
    withoutWinner=rows.filter(r=>r.completed&&r.winner===null).length,
    coins=rows.map(r=>r.coins),kills=rows.map(r=>r.personalEliminations);
   groups.push({policy,scope,kind,n,finished,timedOut:n-finished,won,withoutWinner,
    wonBeforeCutoff:round(won/n),win95:wilson(won,n),
    killsPerFight:round(kills.reduce((a,b)=>a+b,0)/n),
    noPersonalKills:rows.filter(r=>r.personalEliminations===0).length,
    coinsMedian:median(coins),coinsMean:round(coins.reduce((a,b)=>a+b,0)/n),
    coinsP10:quantile(coins,.1),coinsP90:quantile(coins,.9),
    escortHitsOnBoss:rows.reduce((a,b)=>a+(b.patientHitsOnBoss??0),0)});
  }
 }
 return {kind:'physical observations, no human win-rate inference',fightCount:batches.reduce((a,b)=>a+b.runs.length,0),groups};
}
export function physicalEconomyMarkdown(data){
 const rows=[
 '# H5: реальные бои, личные добивания и доход','',
 'Это реальные физические симуляции с шагом 1/60 с, но управление игроком выполняют три простых автопилота. Это НЕ статистика людей.',
 'Схватки, достигшие лимита времени, не являются проигрышами. Завершённый бой может иметь winner=null — например, если пациент обездвижен. Это не обязательно ничья. Доля побед ниже означает победы только к заданному лимиту. Интервал Уилсона широкий из-за малой выборки.',
 '',
 'Всего отдельных боёв: '+data.fightCount+'.','',
 '| Стратегия | Цикл | Вид | Боёв | Завершено | Лимит | Победы | Без победителя | Победы к лимиту (95% ДИ) | Личные добивания/бой | Монеты: медиана/среднее (P10–P90) |',
 '|---|---|---|---:|---:|---:|---:|---:|---|---:|---|'
 ];
 for(const g of data.groups)rows.push('| '+[g.policy,g.scope,g.kind,g.n,g.finished,g.timedOut,g.won,g.withoutWinner,
   Math.round(g.wonBeforeCutoff*100)+'% ('+Math.round(g.win95[0]*100)+'–'+Math.round(g.win95[1]*100)+'%)',
   g.killsPerFight,g.coinsMedian+'/'+g.coinsMean+' ('+g.coinsP10+'–'+g.coinsP90+')'].join(' | ')+' |');
 rows.push('','## Ограничения','',
  '- Одинаковые этажи и случайные сиды у всех трёх стратегий, без платных покупок во время отдельного боя.',
  '- Доход взят из реального банка игровой сессии, число личных убийств — из фактических событий обездвиживания.',
  '- Эта выборка не воспроизводит полноценные 30-этажные прохождения с ДМС, модификациями и хирургией.',
  '- Нельзя автоматически заменить ею искусственные вероятности в H5 или принять цену установки.',
  '- Уровни редкости 8/10/12% остаются математической гипотезой до физических боёв с одинаковыми оснащёнными пациентами.','');
 return rows.join('\n');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const input=H5_POLICIES.flatMap(p=>['first','later'].map(scope=>'artifacts/h5-'+p+'-'+scope+'.json'));
 const batches=input.map((file,i)=>({...JSON.parse(fs.readFileSync(file,'utf8')),policyKey:H5_POLICIES[Math.floor(i/2)]}));
 const data=physicalEconomyReport(batches);
 fs.mkdirSync('artifacts',{recursive:true});
 fs.writeFileSync('artifacts/h5-economy-physics.json',JSON.stringify(data,null,2)+'\n');
 fs.writeFileSync('artifacts/h5-economy-physics.md',physicalEconomyMarkdown(data)+'\n');
 console.log('H5_PHYSICAL_ECONOMY '+JSON.stringify({fights:data.fightCount,groups:data.groups.length}));
 for(const x of data.groups)console.log('H5_COHORT '+JSON.stringify(x));
}
