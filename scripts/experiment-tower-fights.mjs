// Reproducible headless tower fights, not a substitute for human playtesting.
// Uses the actual arena, AI, locomotion, collision and combat step(1/60).
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {installTowerUI} from '../src/tower/ui.js';
import {advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {ctx} from '../src/game/state.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor} from '../src/tower/model.js';
import {earnedStats} from '../src/garage/model.js';
import {BOSS_CONFIG,bossVariantForFloor} from '../src/boss/config.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import {segmentDistance} from '../src/utils/math.js';

const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const samples=Number(args.seeds??1),seconds=Number(args.limit??35),offset=Number(args.offset??19274);
const out=args.out??'artifacts/tower-fights.json';
const policy=args.policy??'approach';
if(!['approach','orbit'].includes(policy))throw Error('Invalid policy');
if(!Number.isInteger(samples)||samples<1||samples>20||!Number.isInteger(seconds)||seconds<5||seconds>180)throw Error('Invalid seeds/limit');
const scenarios=[
 {kind:'normal',arena:'ring',floor:3,profiles:['basic','fast']},
 {kind:'normal',arena:'annulus',floor:7,profiles:['agile','fast','strong']},
 {kind:'normal',arena:'sluice',floor:9,profiles:['basic','fast','strong','agile']},
 {kind:'normal',arena:'throat',floor:12,profiles:['basic','strong','agile','fast','elite']},
 {kind:'normal',arena:'zigzag',floor:14,profiles:['fast','agile','strong','elite','basic','fast']},
 {kind:'normal',arena:'ward',floor:17,profiles:['basic','fast','strong','agile','elite','basic','strong']},
 {kind:'normal',arena:'columns',floor:19,profiles:['basic','fast','strong','agile','elite','basic','fast','strong','agile']},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','basic']},
 {kind:'boss',arena:'ward',floor:10,profiles:['boss','fast','agile']},
 {kind:'boss',arena:'columns',floor:15,profiles:['boss','strong','basic']},
 {kind:'boss',arena:'columns',floor:20,profiles:['boss','agile','strong']},
 {kind:'boss',arena:'columns',floor:25,profiles:['boss','fast','elite']},
 {kind:'boss',arena:'columns',floor:30,profiles:['boss','strong','agile']}
];
function randomGenerator(seed){
 let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
}
function runScenario(scenario,seed){
 const previousRandom=Math.random;
 Math.random=randomGenerator(seed);
 let dom,off=()=>{};
 const row={kind:scenario.kind,arena:scenario.arena,floor:scenario.floor,
  variant:scenario.kind==='boss'?bossVariantForFloor(scenario.floor):null,
  profiles:scenario.profiles,seed,participants:scenario.profiles.length+1,
  completed:false,winner:null,duration:0,hits:0,strikes:0,
  charges:0,sweeps:0,unstucks:0,nonFinite:0,bodyPenetrations:0,bodyOverlaps:0,
  initialPenetrations:0,initialOverlaps:0,errors:[],elapsedCpuMs:0};
 const began=Date.now();
 try{
  dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),
   {url:'https://tower-sim.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  globalThis.confirm=()=>true;
  ctx.arenaRenderer=null;ctx.towerPlayer=0;
  const session=betNewSession(['Автопилот'],1000),tower=towerFor(session,0);
  tower.level=scenario.floor;tower.wins=scenario.floor-1;
  tower.record=scenario.floor-1;tower.stats=earnedStats(scenario.floor-1);
  const option={arenaId:scenario.arena,kind:scenario.kind==='boss'?'boss':'danger',
   ...(scenario.kind==='normal'?{style:'mixed'}:{}),profiles:scenario.profiles};
  tower.floorPlan={floor:scenario.floor,selected:0,options:[option]};
  if(scenario.kind==='boss')tower.bossEncounter={
   floor:scenario.floor,variant:row.variant,
   texture:'assets/textures/robots/boss/b_01.png'
  };
  initializeGame({session,entry:'tower',tower:structuredClone(tower),arenaId:scenario.arena});
  installTowerUI();document.querySelector('#tower-fight').click();
  advanceStartup(20);
  ctx.paused=false;ctx.appInactive=false;ctx.orientationBlocked=false;
  ctx.settingsOpen=false;ctx.towerControlMode='joystick';
  if(ctx.startup.phase!=='running')throw Error('Fight failed to reach running phase');
  const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
  const inspect=(initial=false)=>{
   const bodies=ctx.robots;
   for(const r of bodies){
    if(![r.x,r.y,r.angle,...r.capsules.flatMap(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r])].every(Number.isFinite))
     row.nonFinite++;
    for(const c of r.capsules)if(staticContacts(c).some(h=>h.depth>(isLimb(c)?5:.5)+1e-6)){
     if(initial)row.initialPenetrations++;else row.bodyPenetrations++;
    }
   }
   for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    if(bodies[i].capsules.filter(solid).some(a=>bodies[j].capsules.filter(solid)
     .some(b=>segmentDistance(a.a,a.b,b.a,b.b)<a.r+b.r+.15-1e-6))){
     if(initial)row.initialOverlaps++;else row.bodyOverlaps++;
    }
   }
  };
  inspect(true);
  off=onGameEvent(e=>{
   if(e.type==='combat-unstuck')row.unstucks++;
   if(e.type==='boss-charge')row.charges++;
   if(e.type==='combat-windup'&&e.bossStyle==='sweep')row.sweeps++;
  });
  for(let tick=0;tick<seconds*60&&!ctx.combat.finished;tick++){
   if(tick%6===0){
    const me=ctx.robots[0];
    const others=ctx.robots.filter(r=>r.id!==0&&r.mobile&&r.visible);
    others.sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y));
    const foe=others[0],dx=foe?foe.x-me.x:0,dy=foe?foe.y-me.y:0;
    const length=Math.hypot(dx,dy);
    if(policy==='orbit'&&length>0&&length<110){
      const radial=Math.max(-.7,Math.min(.7,(length-55)/20));
      const vx=dx/length*radial-dy/length*.9;
      const vy=dy/length*radial+dx/length*.9;
      const norm=Math.max(1,Math.hypot(vx,vy));
      ctx.towerInput={x:vx/norm,y:vy/norm};
    }else ctx.towerInput=length>36?{x:dx/length,y:dy/length}:{x:0,y:0};
   }
   step(1/60);
   if(tick%60===59)inspect();
  }
  row.completed=ctx.combat.finished;
  row.winner=ctx.combat.winner;
  row.duration=Math.round(ctx.round.elapsedSec*10)/10;
  row.hits=ctx.combat.hits;row.strikes=ctx.combat.strikes;
  row.aliveAtEnd=ctx.robots.filter(r=>r.mobile).length;
  row.coins=session.players[0].balance-1000;
  row.playerAlive=ctx.robots[0].mobile;
 }catch(error){
  row.errors.push(String(error?.stack??error).slice(0,2000));
 }finally{
  off();
  try{ctx.root?.__disposeTag?.();dom?.window.close();}catch{}
  Math.random=previousRandom;ctx.mode='spectator';
  row.elapsedCpuMs=Date.now()-began;
 }
 return row;
}
const runs=[];
for(const scenario of scenarios){
 for(let sample=0;sample<samples;sample++){
  const row=runScenario(scenario,offset+sample*15485863+scenario.floor*7919);
  runs.push(row);
  console.log('FIGHT '+JSON.stringify({
   arena:row.arena,floor:row.floor,variant:row.variant,participants:row.participants,
   seed:row.seed,completed:row.completed,winner:row.winner,seconds:row.duration,
   hits:row.hits,strikes:row.strikes,unstucks:row.unstucks,charges:row.charges,sweeps:row.sweeps,
   nonFinite:row.nonFinite,bodyPenetrations:row.bodyPenetrations,bodyOverlaps:row.bodyOverlaps,
   initialPenetrations:row.initialPenetrations,initialOverlaps:row.initialOverlaps,
   playerAlive:row.playerAlive,error:row.errors[0]?.slice(0,230)??null
  }));
 }
}
const summary={
 total:runs.length,completed:runs.filter(r=>r.completed).length,
 timedOut:runs.filter(r=>!r.completed&&!r.errors.length).length,
 errors:runs.filter(r=>r.errors.length).length,
 nonFinite:runs.reduce((n,r)=>n+r.nonFinite,0),
 initialPenetrations:runs.reduce((n,r)=>n+r.initialPenetrations,0),
 initialOverlaps:runs.reduce((n,r)=>n+r.initialOverlaps,0),
 bodyPenetrations:runs.reduce((n,r)=>n+r.bodyPenetrations,0),
 bodyOverlaps:runs.reduce((n,r)=>n+r.bodyOverlaps,0),
 unstucks:runs.reduce((n,r)=>n+r.unstucks,0),
 hits:runs.reduce((n,r)=>n+r.hits,0),
 charges:runs.reduce((n,r)=>n+r.charges,0),
 playerWins:runs.filter(r=>r.winner===0).length,
 cpuSeconds:Math.round(runs.reduce((n,r)=>n+r.elapsedCpuMs,0)/100)/10
};
const result={simulation:'headless real 1/60s game loop',policy:policy==='orbit'?'Player approaches and circles a nearby enemy at about 55 cm; not human performance':'Player automatically approaches nearest moving enemy and stops at 36 cm; not human performance',seconds,seeds:samples,summary,runs};
fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY '+JSON.stringify(summary));
console.log('REPORT '+out);
if(summary.errors||summary.nonFinite||summary.initialPenetrations||summary.initialOverlaps)process.exitCode=1;
