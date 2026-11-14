// Fixed-step CPU/DOM experiment. Automatic input is a repeatable policy, not a human playtest.
import fs from 'node:fs';
import {startBossScenario} from './boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {step} from '../src/game/loop.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {BOSS_VARIANTS,BOSS_CONFIG} from '../src/boss/config.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
const options=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const seeds=Number(options.seeds??5),limit=Number(options.limit??120),floors=(options.floors??'5,10').split(',').map(Number),offset=Number(options.offset??4100);
if(!Number.isInteger(seeds)||seeds<1||!Number.isFinite(limit)||limit<=0||floors.some(n=>!Number.isSafeInteger(n)||n<5||n%5))throw Error('Invalid experiment options');
const out=options.out??'docs/experiments/boss.json',runs=[];
function mixSeed(value){let x=(value+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0;}
function summary(){return ['ordinary',...BOSS_VARIANTS.map(v=>v.id)].map(profile=>{
 const rows=runs.filter(r=>r.profile===profile),done=rows.filter(r=>r.finished),win=rows.filter(r=>r.winner===0),times=done.map(r=>r.seconds).sort((a,b)=>a-b);
 return {profile,matches:rows.length,finished:done.length,playerWins:win.length,playerWinShare:rows.length?win.length/rows.length:null,meanSeconds:times.length?times.reduce((a,b)=>a+b,0)/times.length:null,medianSeconds:times.length?times[Math.floor(times.length/2)]:null,maxDamage:Math.max(0,...rows.flatMap(r=>r.damage)),bloodLossDeaths:rows.filter(r=>r.bossDeath==='blood-loss').length,traumaKnockouts:rows.filter(r=>r.bossDeath==='trauma').length,bodyPenetrations:rows.reduce((n,r)=>n+r.bodyPenetrations,0),nonFinite:rows.reduce((n,r)=>n+r.nonFinite,0),byFloor:Object.fromEntries(floors.map(f=>{const a=rows.filter(r=>r.floor===f);return [f,{matches:a.length,playerWins:a.filter(r=>r.winner===0).length,finished:a.filter(r=>r.finished).length}];}))};
});}
function save(){fs.mkdirSync(new URL('../docs/experiments/',import.meta.url),{recursive:true});fs.writeFileSync(out,JSON.stringify({command:process.argv.slice(2),fixedStep:1/60,limitSec:limit,seeds,offset,floors,config:BOSS_CONFIG,headless:true,policy:'Every 0.1s walk toward the nearest live opponent; stop within 32cm. Baseline is the old ordinary floor at the same player progression. No human skill claim.',summary:summary(),runs},null,2)+'\n');}
for(const floor of floors)for(let sample=0;sample<seeds;sample++)for(const arena of ['ward','ring','annulus'])for(const profile of ['ordinary',...BOSS_VARIANTS.map(v=>v.id)]){
 const seed=mixSeed(offset+sample),f=startBossScenario({floor,seed,arena,variant:profile,ordinary:profile==='ordinary'});
 const row={profile,floor,seed,arena,finished:false,winner:null,seconds:0,hits:0,coins:0,damage:[],bossDeath:null,bodyPenetrations:0,nonFinite:0};
 const off=onGameEvent(e=>{
  if((e.type==='hit'||e.type==='segment-broken')&&e.by===1)row.damage.push(e.damage);
  if(e.type==='robot-immobilized'&&e.robot===1)row.bossDeath=e.knockoutCause??'head';
 });
 try{
  for(let tick=0;tick<limit*60&&!ctx.combat.finished;tick++){
   if(tick%6===0){
    const r=ctx.robots[0],enemies=ctx.robots.filter(o=>o.id!==0&&o.mobile&&o.visible).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y));
    const target=enemies[0],dx=target?target.x-r.x:0,dy=target?target.y-r.y:0,d=Math.hypot(dx,dy);ctx.towerInput=d>32?{x:dx/d,y:dy/d}:{x:0,y:0};
   }
   step(1/60);
   if(tick%60===59)for(const r of ctx.robots){
    if(![r.x,r.y,r.angle,...r.capsules.flatMap(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r])].every(Number.isFinite))row.nonFinite++;
    if(r.mobile&&r.visible&&r.capsules.filter(c=>!isLimb(c)).some(c=>staticContacts(c).some(h=>h.depth>.5)))row.bodyPenetrations++;
   }
  }
  Object.assign(row,{finished:ctx.combat.finished,winner:ctx.combat.winner,seconds:ctx.round.elapsedSec,hits:ctx.combat.hits,coins:f.session.players[0].balance-1000});runs.push(row);
 }finally{off();f.close();}
 save();if(runs.length%15===0)console.log(JSON.stringify({completed:runs.length,summary:summary()}));
}
save();console.log(JSON.stringify({out,summary:summary()}));
