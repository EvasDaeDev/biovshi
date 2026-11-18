// Standalone Monte Carlo model for Tower II pricing. No betting income.
// Reproducible seed/scenario assumptions are part of the report, not gameplay.
import fs from 'node:fs';
const runs=2000,seeds=[...Array(runs).keys()];
const models=[{name:'100 / +45%',first:100,growth:1.45},{name:'100 / +55%',first:100,growth:1.55},{name:'100 / +70%',first:100,growth:1.70},{name:'125 / +45%',first:125,growth:1.45}];
const policies=[
 {name:'осторожная',kill:.17,boss:.25,danger:.35,insurance:.75,surgery:.25,reroll:.22,skills:.30},
 {name:'обычная',kill:.32,boss:.45,danger:.55,insurance:.55,surgery:.45,reroll:.15,skills:.15},
 {name:'агрессивная',kill:.52,boss:.70,danger:.80,insurance:.30,surgery:.65,reroll:.10,skills:.08}
];
function rng(seed){let x=seed>>>0;return ()=>((x^=x<<13,x^=x>>>17,x^=x<<5)>>>0)/2**32;}
function percentile(values,p){const v=[...values].sort((a,b)=>a-b);return v[Math.floor((v.length-1)*p)];}
function sample(seed,policy,model){
 const random=rng(seed*193+37),checkpoints=[5,10,15,20,25,30];
 let bank=100,insurance=50,installed=0,owned=0,surgery=0,spend=0,earned=0;
 const observations=[];
 for(let level=1;level<=30;level++){
  const boss=level%5===0;const danger=!boss&&random()<policy.danger;
  const opponents=boss?3:Math.min(9,1+Math.floor(level/2));
  for(let i=0;i<opponents;i++){
   if(random()<(boss&&i===0?policy.boss:policy.kill)){
    const coins=boss&&i===0?100:danger?15:10;bank+=coins;earned+=coins;
   }
  }
  if(boss){owned++;
    // Completion of an entire collection is deliberately rare in the first cycle.
    if(level===30&&random()<.12){bank+=333;earned+=333;}
  }
  if([6,11,16].includes(level)&&random()<policy.surgery&&bank>=[60,100,150][surgery]){
   const price=[60,100,150][surgery++];bank-=price;spend+=price;
  }
  if(level%10===6&&random()<policy.insurance&&bank>=insurance){bank-=insurance;spend+=insurance;insurance+=Math.ceil(insurance*.10);}
  if(!boss&&random()<policy.reroll&&bank>=50){bank-=50;spend+=50;}
  if(level>6&&random()<policy.skills&&bank>=50){bank-=50;spend+=50;}
  while(installed<owned&&installed<6){
   const price=Math.ceil(model.first*model.growth**installed);
   if(bank<price)break;
   bank-=price;spend+=price;installed++;
  }
  if(checkpoints.includes(level))observations.push({floor:level,bank,installed,owned});
 }
 return {bank,installed,owned,spend,earned,observations};
}
const out={assumptions:{runs,startingBank:100,bossEvery:5,bossPersonalKillOnly:true,otherBankIncome:false},models:[]};
for(const model of models){
 const result={model,policies:[]};
 for(const policy of policies){
  const samples=seeds.map(seed=>sample(seed,policy,model));
  const stats=group=>({p10:percentile(group,.1),median:percentile(group,.5),p90:percentile(group,.9)});
  result.policies.push({name:policy.name,bank:stats(samples.map(s=>s.bank)),installed:stats(samples.map(s=>s.installed)),
   fullSixRate:samples.filter(s=>s.installed===6).length/runs,
   milestones:[5,10,15,20,25,30].map((floor,index)=>({floor,bank:stats(samples.map(s=>s.observations[index].bank)),
    installed:stats(samples.map(s=>s.observations[index].installed))}))});
 }
 out.models.push(result);
}
const rows=['# Башня II — симуляция цены установки','',
 'Игрок стартует со 100 монетами. '+runs+' воспроизводимых прогонов на политику, 30 этажей, без дохода от тотализатора. Это **сценарная модель**, а не результаты ботов или реальных игроков.',
 '', '| Модель | Политика | Монеты на 30-м (P10/медиана/P90) | Модулей установлено (P10/медиана/P90) | Все шесть |',
 '|---|---|---|---|---|'];
for(const m of out.models)for(const p of m.policies)rows.push(`| ${m.model.name} | ${p.name} | ${p.bank.p10}/${p.bank.median}/${p.bank.p90} | ${p.installed.p10}/${p.installed.median}/${p.installed.p90} | ${(100*p.fullSixRate).toFixed(1)}% |`);
rows.push('','**Рабочая настройка для прототипа:** 100 монет за первую установку, далее `ceil(100 × 1.55^N)` по числу уже оплаченных установок. Это проверяемая гипотеза, не окончательно утверждённый баланс. При её изменении требуется повторный прогон.',
 '','**Ограничения:** не симулируются фактические тайминги и поражения/повторные заходы с ДМС; художественная редкость не увеличивает бонусы. Для финального утверждения нужны записи headless-боёв и игровые прогоны.');
fs.mkdirSync('artifacts',{recursive:true});
fs.writeFileSync('artifacts/tower-part2-economy.json',JSON.stringify(out,null,2));
fs.writeFileSync('docs/experiments/tower-part2-economy.md',rows.join('\n')+'\n');
console.log(rows.slice(0,18).join('\n'));
