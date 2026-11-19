// Report 50 actual 1/60-second physics bouts on Tower H7 AI.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const batches=['artifacts/tower-h7-49.json','artifacts/tower-h7-1-boss.json']
 .map(path=>JSON.parse(fs.readFileSync(path,'utf8')));
assert.equal(batches[0].runs.length,49);
assert.equal(batches[1].runs.length,1);
assert.ok(batches.every(batch=>batch.cycleTactics));
const runs=batches.flatMap(batch=>batch.runs);
assert.equal(runs.length,50);
assert.equal(new Set(runs.map(r=>r.floor+':'+r.seed)).size,50,'independent fight seeds');
const p=(numbers,q)=>numbers.length?[...numbers].sort((a,b)=>a-b)[Math.floor((numbers.length-1)*q)]:null;
function summarize(list){
 const stalled=list.filter(r=>!r.completed&&!r.errors.length);
 return {
  count:list.length,finished:list.filter(r=>r.completed).length,timedOut:stalled.length,
  playerWins:list.filter(r=>r.winner===0).length,playerAlive:list.filter(r=>r.playerAlive).length,
  errors:list.reduce((sum,r)=>sum+r.errors.length,0),
  friendlyHits:list.reduce((sum,r)=>sum+r.friendlyHits,0),
  nan:list.reduce((sum,r)=>sum+r.nonFinite,0),
  initialPenetrations:list.reduce((sum,r)=>sum+r.initialPenetrations,0),
  initialOverlaps:list.reduce((sum,r)=>sum+r.initialOverlaps,0),
  bodyPenetrations:list.reduce((sum,r)=>sum+r.bodyPenetrations,0),
  bodyOverlaps:list.reduce((sum,r)=>sum+r.bodyOverlaps,0),
  maximumBodyOverlapCm:Math.max(0,...list.map(r=>r.maxBodyOverlapCm)),
  hits:list.reduce((sum,r)=>sum+r.hits,0),strikes:list.reduce((sum,r)=>sum+r.strikes,0),
  unstucks:list.reduce((sum,r)=>sum+r.unstucks,0),
  bossEscortsHitBoss:list.filter(r=>r.kind==='boss').reduce((sum,r)=>sum+r.patientHitsOnBoss,0),
  bossesKilledByEscorts:list.filter(r=>r.kind==='boss'&&r.bossKilledBy>1).length,
  bossDeaths:list.filter(r=>r.kind==='boss'&&!r.bossAlive).length,
  medianSeconds:p(list.map(r=>r.duration),.5),p90Seconds:p(list.map(r=>r.duration),.9),
  timeoutReasons:Object.fromEntries([...new Set(stalled.map(r=>r.longFight?.reason??'unknown'))]
   .map(reason=>[reason,stalled.filter(r=>(r.longFight?.reason??'unknown')===reason).length]))
 };
}
const total=summarize(runs);
const perFloor=[...new Set(runs.map(r=>r.floor))].sort((a,b)=>a-b).map(floor=>{
 const items=runs.filter(r=>r.floor===floor);
 return {floor,modes:[...new Set(items.flatMap(r=>r.relations?.modes??[r.relations?.type??'none']))],...summarize(items)};
});
const data={title:'50 extra Tower H7 physical bouts',commit:process.env.GITHUB_SHA??'',
 settings:{fps:60,limitSeconds:batches[0].seconds,policy:batches[0].policy},
 total,perFloor};
fs.writeFileSync('artifacts/tower-h7-50-summary.json',JSON.stringify(data,null,2)+'\n');
const lines=[
 '# Башня H7 — 50 дополнительных физических боёв','',
 'Настоящие физические прогоны step(1/60); это 50 отдельных боёв, а не 50 полных забегов или живые игроки.','',
 'Коммит: '+data.commit+'.','',
 '| Этаж | Тактика | Боёв | Завершено | Побед игрока | Жив игрок | Удары по союзникам | Ошибки |',
 '|---:|---|---:|---:|---:|---:|---:|---:|',
 ...perFloor.map(x=>'| '+x.floor+' | '+x.modes.join(' + ')+' | '+x.count+' | '+x.finished+' | '+x.playerWins+' | '+x.playerAlive+' | '+x.friendlyHits+' | '+x.errors+' |'),
 '',
 '## Выводы','',
 '- Завершено боёв: '+total.finished+'/50; продолжались к лимиту: '+total.timedOut,
 '- Удары по действующим союзникам: '+total.friendlyHits,
 '- Удары сопровождающих по боссу: '+total.bossEscortsHitBoss,
 '- Босс погиб от сопровождающих: '+total.bossesKilledByEscorts,
 '- Ошибки симулятора / NaN: '+total.errors+' / '+total.nan,
 '- Начальные коллизии: '+total.initialPenetrations+' проникновений; '+total.initialOverlaps+' перекрытий',
 '- Максимальное перекрытие тел: '+total.maximumBodyOverlapCm.toFixed(2)+' см (порог 2 см)',
 '- Удары: '+total.hits+', атаки: '+total.strikes,
 '- Причины лимита: '+JSON.stringify(total.timeoutReasons),
 '',
 'Ограничения: один алгоритм игрока (движение по орбите), фиксированные составы, ограниченная длительность. Лимит не означает зависание.'
];
fs.writeFileSync('artifacts/tower-h7-50-report.md',lines.join('\n')+'\n');
console.log('H7_50_TOTAL '+JSON.stringify(total));
for(const row of perFloor)console.log('H7_50_FLOOR '+JSON.stringify(row));
console.log(lines.join('\n'));
if(total.errors||total.nan||total.friendlyHits||total.bossEscortsHitBoss||
 total.initialPenetrations||total.initialOverlaps||total.maximumBodyOverlapCm>2)
 throw Error('Faction safety or geometry regression detected; inspect full JSON');
