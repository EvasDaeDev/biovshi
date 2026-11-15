// Fixed-step CPU/DOM experiment. Automatic input is a repeatable policy, not a human playtest.
import fs from 'node:fs';
import {startBossScenario} from './boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {step} from '../src/game/loop.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {BOSS_VARIANTS,BOSS_CONFIG} from '../src/boss/config.js';
import {BOSS_FLOOR_INTERVAL} from '../src/build-channel.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
const options=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,'').split('=')));
const seeds=Number(options.seeds??5),limit=Number(options.limit??120),floors=(options.floors??'5,10').split(',').map(Number),offset=Number(options.offset??4100);
if(!Number.isInteger(seeds)||seeds<1||!Number.isFinite(limit)||limit<=0||floors.some(n=>!Number.isSafeInteger(n)||n<BOSS_FLOOR_INTERVAL||n%BOSS_FLOOR_INTERVAL))throw Error('Invalid experiment options');
const selected=(options.variants??'ordinary,'+BOSS_VARIANTS.map(v=>v.id).join(',')).split(',');
const tactics=(options.tactics??'new').split(',');
const policy=options.policy??'approach';if(!['approach','orbit'].includes(policy))throw Error('Invalid input policy');
if(selected.some(v=>v!=='ordinary'&&!BOSS_VARIANTS.some(b=>b.id===v))||tactics.some(t=>!['prototype','new'].includes(t)))throw Error('Invalid variant/tactics');
const out=options.out??'docs/experiments/boss.json',runs=[],starts=new Map();
function mixSeed(value){let x=(value+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0;}
function summary(){return tactics.flatMap(tactic=>selected.map(profile=>{
 const rows=runs.filter(r=>r.profile===profile&&r.tactic===tactic),done=rows.filter(r=>r.finished),win=rows.filter(r=>r.winner===0),times=done.map(r=>r.seconds).sort((a,b)=>a-b);
 return {profile,tactic,matches:rows.length,finished:done.length,playerWins:win.length,playerWinShare:rows.length?win.length/rows.length:null,meanSeconds:times.length?times.reduce((a,b)=>a+b,0)/times.length:null,medianSeconds:times.length?times[Math.floor(times.length/2)]:null,maxDamage:Math.max(0,...rows.flatMap(r=>r.damage)),bloodLossDeaths:rows.filter(r=>r.bossDeath==='blood-loss').length,traumaKnockouts:rows.filter(r=>r.bossDeath==='trauma').length,bodyPenetrations:rows.reduce((n,r)=>n+r.bodyPenetrations,0),nonFinite:rows.reduce((n,r)=>n+r.nonFinite,0),sweeps:rows.reduce((n,r)=>n+r.sweeps,0),followups:rows.reduce((n,r)=>n+r.followups,0),charges:rows.reduce((n,r)=>n+r.charges,0),phases:rows.reduce((n,r)=>n+r.phases,0),byFloor:Object.fromEntries(floors.map(f=>{const a=rows.filter(r=>r.floor===f);return [f,{matches:a.length,playerWins:a.filter(r=>r.winner===0).length,finished:a.filter(r=>r.finished).length}];}))};
}));}
function save(){fs.mkdirSync(new URL('../docs/experiments/',import.meta.url),{recursive:true});fs.writeFileSync(out,JSON.stringify({command:process.argv.slice(2),bossEvery:BOSS_FLOOR_INTERVAL,fixedStep:1/60,limitSec:limit,seeds,offset,floors,tactics,variants:selected,config:BOSS_CONFIG,headless:true,policy:policy==='orbit'?'Approach the nearest opponent, then circle at approximately 50cm. No human skill claim.':'Approach the nearest opponent and stop within 32cm. No human skill claim.',summary:summary(),runs},null,2)+'\n');}
for(const floor of floors)for(let sample=0;sample<seeds;sample++)for(const arena of ['ward','ring','annulus'])for(const profile of selected)for(const tactic of tactics){
 BOSS_CONFIG.behaviorEnabled=tactic==='new';
 const seed=mixSeed(offset+sample),f=startBossScenario({floor,seed,arena,variant:profile,ordinary:profile==='ordinary'});
 const pairKey=JSON.stringify([profile,floor,seed,arena]);
 const initial=JSON.stringify({seed:ctx.seed,robots:ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,hp:[...r.hp]})),stats:ctx.towerGarage});
 if(starts.has(pairKey)&&starts.get(pairKey)!==initial)throw Error('Unpaired starting conditions');starts.set(pairKey,initial);
 const row={profile,tactic,floor,seed,arena,sweeps:0,followups:0,charges:0,phases:0,finished:false,winner:null,seconds:0,hits:0,coins:0,damage:[],bossDeath:null,bodyPenetrations:0,nonFinite:0};
 const off=onGameEvent(e=>{
  if(e.type==='combat-windup'&&e.from===1){if(e.bossStyle==='sweep')row.sweeps++;if(e.comboIndex===2)row.followups++;}
  if(e.type==='boss-charge')row.charges++;if(e.type==='boss-phase')row.phases++;
  if((e.type==='hit'||e.type==='segment-broken')&&e.by===1)row.damage.push(e.damage);
  if(e.type==='robot-immobilized'&&e.robot===1)row.bossDeath=e.knockoutCause??'head';
 });
 try{
  for(let tick=0;tick<limit*60&&!ctx.combat.finished;tick++){
   if(tick%6===0){
    const r=ctx.robots[0],enemies=ctx.robots.filter(o=>o.id!==0&&o.mobile&&o.visible).sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y));
    const target=enemies[0],dx=target?target.x-r.x:0,dy=target?target.y-r.y:0,d=Math.hypot(dx,dy);if(policy==='orbit'&&d>0&&d<100){const radial=Math.max(-.7,Math.min(.7,(d-50)/18)),vx=dx/d*radial-dy/d*.9,vy=dy/d*radial+dx/d*.9,norm=Math.max(1,Math.hypot(vx,vy));ctx.towerInput={x:vx/norm,y:vy/norm};}else ctx.towerInput=d>32?{x:dx/d,y:dy/d}:{x:0,y:0};
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
