// Reproducible CPU/DOM experiment: no rendering or human input is simulated.
import fs from 'node:fs';
import path from 'node:path';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {CONFIG} from '../src/config.js';
import {ASSETS} from '../src/assets/manifest.js';
import {betNewSession,betCommit} from '../src/betting/ledger.js';
import {earnedStats} from '../src/garage/model.js';
import {newTower} from '../src/tower/model.js';
import {installTowerUI} from '../src/tower/ui.js';
import {startSpawnSequence,advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {onGameEvent} from '../src/game/event-bus.js';

if(process.argv.includes('--help')){console.log('npm run experiment:trauma -- --profiles=off,moderate24 --scenario=base|veteran|tower|campaign --seeds=30 --offset=1000 --seedMode=mixed|linear --out=path.json');process.exit(0);}
const options=Object.fromEntries(process.argv.slice(2).map(arg=>arg.replace(/^--/,'').split('=')));
const seeds=Number(options.seeds??30),offset=Number(options.offset??1000),scenario=options.scenario??'base';
const profiles={off:{enabled:false,threshold:18,headMultiplier:1.5},original16:{enabled:true,threshold:16,headMultiplier:2},moderate18:{enabled:true,threshold:18,headMultiplier:1.5},moderate20:{enabled:true,threshold:20,headMultiplier:1.5},moderate16:{enabled:true,threshold:16,headMultiplier:1.5},moderate14:{enabled:true,threshold:14,headMultiplier:1.5},moderate22:{enabled:true,threshold:22,headMultiplier:1.5},moderate24:{enabled:true,threshold:24,headMultiplier:1.5},moderate26:{enabled:true,threshold:26,headMultiplier:1.5}};
const selected=(options.profiles??'off,moderate24').split(',');
if(!Number.isInteger(seeds)||seeds<1||!Number.isInteger(offset)||!['base','veteran','tower','campaign'].includes(scenario)||selected.some(p=>!profiles[p]))throw Error('Invalid experiment options');
const destination=options.out??`docs/experiments/trauma-${scenario}.json`;
fs.mkdirSync(path.dirname(destination),{recursive:true});
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const textures=Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]));
const seedMode=options.seedMode??'mixed';
if(!['linear','mixed'].includes(seedMode))throw Error('Invalid seed mode');
function mixSeed(value){let x=(value+0x9e3779b9)>>>0;x=Math.imul(x^(x>>>16),0x21f0aaad);x=Math.imul(x^(x>>>15),0x735a2d97);return (x^(x>>>15))>>>0;}
const runs=[];
const sessions=new Map();
function seeded(seed){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
function summarize(){return selected.map(profile=>{
 const rows=runs.filter(r=>r.profile===profile),out=rows.flatMap(r=>r.eliminations),finished=rows.filter(r=>r.finished),times=finished.map(r=>r.seconds).sort((a,b)=>a-b),kos=out.filter(e=>e.reason!=='погиб');
 const mean=(items)=>items.length?items.reduce((a,b)=>a+b,0)/items.length:null;
 return {profile,config:profiles[profile],matches:rows.length,finished:finished.length,deaths:out.length-kos.length,knockouts:kos.length,traumaKnockouts:kos.filter(e=>e.cause==='trauma').length,knockoutShare:out.length?kos.length/out.length:null,winnerCounts:Object.fromEntries([...new Set(rows.map(r=>r.winner))].map(id=>[String(id),rows.filter(r=>r.winner===id).length])),meanSeconds:mean(times),medianSeconds:times.length?times[Math.floor(times.length/2)]:null,p90Seconds:times.length?times[Math.min(times.length-1,Math.ceil(times.length*.9)-1)]:null,firstEliminationSeconds:mean(rows.map(r=>r.eliminations[0]?.time).filter(n=>n!==undefined)),knockoutMovementLimbs:mean(kos.map(e=>e.movementLimbs)),severedPartsPerMatch:mean(rows.map(r=>r.severedParts)),meanPatientWins:scenario==='campaign'?mean(rows.flatMap(r=>r.patientWins)):undefined,maxPatientWins:scenario==='campaign'?Math.max(0,...rows.flatMap(r=>r.patientWins)):undefined,towerWins:scenario==='tower'?rows.filter(r=>r.winner===0).length:undefined,towerCoins:scenario==='tower'?mean(rows.map(r=>r.coins)):undefined,arenaMeanSeconds:Object.fromEntries(['ward','ring','annulus'].map(a=>[a,mean(rows.filter(r=>r.arena===a&&r.finished).map(r=>r.seconds))]))};
 });}
function save(){fs.writeFileSync(destination,JSON.stringify({baseCommit:'d0af6b1',command:process.argv.slice(2),seedMode,scenario,seeds,offset,timeLimitSec:180,fixedStep:1/60,headless:true,towerPolicy:scenario==='tower'?'Walk toward nearest opponent, stop within 32cm; floor cycles 1/5/10. No human skill claim.':undefined,summary:summarize(),runs},null,2)+'\n');}
for(let sample=0;sample<seeds;sample++)for(const arena of ['ward','ring','annulus']){
 let initial=null;
 for(const profile of selected){
  Object.assign(CONFIG.combat.trauma,profiles[profile]);
  const seed=seedMode==='mixed'?mixSeed(offset+sample):offset+sample,oldRandom=Math.random;Math.random=seeded(seed);
  let dom,off;
  try{
   dom=new JSDOM(html,{url:'https://trauma-experiment.test/',pretendToBeVisual:true});
   for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
   globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
   const sessionKey=profile+':'+arena;
   const s=scenario==='campaign'?(sessions.get(sessionKey)??betNewSession(['Test'],1000)):betNewSession(['Test'],1000);
   if(scenario==='campaign')sessions.set(sessionKey,s);ctx.arenaRenderer=null;
   if(scenario==='veteran')for(const [id,g]of s.garage.entries()){g.wins=id*3;g.stats=earnedStats(g.wins);}
   const floor=[1,5,10][sample%3];const tower=scenario==='tower'?newTower(sample%4,floor-1):null;
   if(tower){tower.level=floor;tower.wins=floor-1;tower.record=floor-1;tower.stats=earnedStats(tower.wins);s.towers[0]=structuredClone(tower);ctx.towerPlayer=0;}
   initializeGame({session:s,entry:'betting',arenaId:arena,textures,...(tower?{tower:structuredClone(tower)}:{})});
   if(tower){installTowerUI();document.querySelector('#tower-fight').click();}
   else {betCommit(s,[{player:0,robot:0,amount:0}]);startSpawnSequence();}
   advanceStartup(20);ctx.paused=false;ctx.orientationBlocked=false;ctx.settingsOpen=false;
   const starting=JSON.stringify({seed:ctx.seed,positions:ctx.robots.map(r=>[r.x,r.y,r.angle]),stats:scenario==='campaign'?null:tower?ctx.towerGarage:s.garage});
   if(initial!==null&&initial!==starting)throw Error('Unpaired initial conditions');initial=starting;
   const row={scenario,profile,seed,arena,...(tower?{floor}:{}),finished:false,seconds:0,winner:null,hits:0,severedParts:0,coins:0,eliminations:[]};
   off=onGameEvent(e=>{
    if(e.type==='segment-broken')row.severedParts+=1+(e.detached?.length??0);
    if(e.type==='robot-immobilized'){const r=ctx.robots[e.robot];row.eliminations.push({id:e.robot,reason:e.reason,cause:e.knockoutCause??null,time:ctx.round.elapsedSec,trauma:r.trauma,movementLimbs:r.movementLimbs,remainingParts:r.segmentCount});}
   });
   for(let tick=0;tick<180*60&&!ctx.combat.finished;tick++){
    if(tower&&tick%6===0){const r=ctx.robots[0],enemies=ctx.robots.filter(o=>o.id!==0&&o.mobile&&o.visible);enemies.sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y));const foe=enemies[0],dx=foe?foe.x-r.x:0,dy=foe?foe.y-r.y:0,d=Math.hypot(dx,dy);ctx.towerInput=d>32?{x:dx/d,y:dy/d}:{x:0,y:0};}
    step(1/60);
   }
   Object.assign(row,{finished:ctx.combat.finished,seconds:ctx.round.elapsedSec,winner:ctx.combat.winner,hits:ctx.combat.hits,coins:s.players[0].balance-1000,...(scenario==='campaign'?{patientWins:s.garage.map(g=>g.wins)}:{})});runs.push(row);
  }finally{off?.();ctx.root?.__disposeTag?.();dom?.window.close();Math.random=oldRandom;}
 }
 save();
 if(runs.length%30===0)console.log(JSON.stringify({completed:runs.length,scenario,summary:summarize()}));
}
save();console.log(JSON.stringify({done:true,destination,summary:summarize()}));
