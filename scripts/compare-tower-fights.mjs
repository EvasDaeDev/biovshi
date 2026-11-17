// Collate identical-seed Tower trials. This is a test report, never game logic.
import fs from 'node:fs';
const [approachFile,orbitFile,outFile='artifacts/tower-fight-comparison.md']=process.argv.slice(2);
if(!approachFile||!orbitFile)throw Error('Usage: node scripts/compare-tower-fights.mjs approach.json orbit.json [output.md]');
const approach=JSON.parse(fs.readFileSync(approachFile,'utf8'));
const orbit=JSON.parse(fs.readFileSync(orbitFile,'utf8'));
const key=r=>[r.arena,r.floor,r.seed,r.participants].join(':');
const index=new Map(orbit.runs.map(r=>[key(r),r]));
if(index.size!==orbit.runs.length||approach.runs.length!==orbit.runs.length)
 throw Error('Paired samples have mismatched counts or duplicate keys');
function stats(rows){
 const finished=rows.filter(r=>r.completed);
 return {
  total:rows.length,finished:finished.length,
  wins:finished.filter(r=>r.winner===0).length,
  defeats:finished.filter(r=>r.winner!==0).length,
  timedOut:rows.filter(r=>!r.completed&&!r.errors?.length).length,
  errors:rows.filter(r=>r.errors?.length).length,
  maxBodyOverlapCm:Math.max(0,...rows.map(r=>r.maxBodyOverlapCm??0))
 };
}
const lines=[
 '# Headless Tower: comparison of player control policies','',
 'Same arenas, initial seeds, patient profiles and build; only the scripted player movement differs.',
 'A shared seed does not imply identical later random sequences after combat decisions diverge.',
 'The policies are intentionally simplistic and **do not estimate human win rates**.','',
 '| Policy | Battles | Finished | Player wins | Player defeats | Time limit |',
 '|---|---:|---:|---:|---:|---:|'
];
for(const [name,data] of [['Direct approach',approach],['Orbit (55 cm)',orbit]]){
 const x=stats(data.runs);
 lines.push(`| ${name} | ${x.total} | ${x.finished} | ${x.wins} | ${x.defeats} | ${x.timedOut} |`);
}
lines.push('','## Matched scenarios','',
 '| Floor | Arena | Seed | Approach (s) | Orbit (s) | Orbit outcome | Late-fight reason |',
 '|---:|---|---:|---:|---:|---|---|');
for(const a of approach.runs){
 const b=index.get(key(a));
 if(!b)throw Error('Missing paired seed: '+key(a));
 const outcome=r=>r.errors?.length?'error':!r.completed?'time limit':r.winner===0?'player win':'player defeat';
 const fmt=r=>r.duration.toFixed(1)+(r.completed?'':' +');
 lines.push(`| ${a.floor} | ${a.arena} | ${a.seed} | ${fmt(a)} | ${fmt(b)} | ${outcome(b)} | ${b.longFight?.reason??'n/a'} |`);
}
const b=stats(orbit.runs),a=stats(approach.runs);
lines.push('','The `+` suffix denotes a censored observation at the test time limit, not a completed fight.',
 '',
 '## Interpretation rules','',
 '- A fight can exceed the limit while continuing to produce attack windups; this is not a physics hang.',
 '- `attacks-without-hits` describes only the final ten seconds, not the entire encounter.',
 '- `winner: null` in completed Tower combat means player defeat, not a draw.',
 '- Confirm apparent balance differences using real player control before tuning difficulty.',
 '- Body-overlap values are sampled once per second and cannot exclude shorter contact events.',
 '',
 `Paired games: ${a.total}; direct approach finished: ${a.finished}; orbit finished: ${b.finished}.`,'');
fs.mkdirSync(outFile.split('/').slice(0,-1).join('/')||'.',{recursive:true});
fs.writeFileSync(outFile,lines.join('\n'));
console.log('COMPARISON '+JSON.stringify({approach:a,orbit:b,paired:approach.runs.length}));
console.log('REPORT '+outFile);
