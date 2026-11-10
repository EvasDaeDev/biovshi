import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {betNewSession,betCommit} from '../src/betting/ledger.js';
import {startSpawnSequence,advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {onGameEvent} from '../src/game/event-bus.js';

const seed=Number(process.env.ANALYSIS_SEED||1);
const rounds=Number(process.env.ANALYSIS_ROUNDS||25);
const maxSeconds=Number(process.env.ANALYSIS_MAX_SECONDS||150);
let rng=(seed*0x9e3779b1)>>>0;
Math.random=()=>{rng=(rng+0x6D2B79F5)>>>0;let t=rng;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://biovshi-analytics.test/',pretendToBeVisual:true});
for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
globalThis.matchMedia=()=>({matches:false});
globalThis.ResizeObserver=class{observe(){}disconnect(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
globalThis.confirm=()=>true;
const strikeSources={head:0,arm:0,leg:0};const hitSources={head:0,arm:0,leg:0};
const session=betNewSession(['Analysis'],1000);
let current=null;
const all=[];
const eventSub=onGameEvent(e=>{
  if(!current)return;
  if(e.type==='combat-windup') { const kind=String(e.source).split('-')[0];if(kind in strikeSources)strikeSources[kind]++; }
  if(e.type==='combat-strike') { const kind=String(e.source).split('-')[0];if(kind in hitSources)hitSources[kind]++; }
  if(e.type==='robot-immobilized') {
    if(e.reason==='погиб')current.deaths.push(e.robot);
    else if(e.reason==='потерял сознание')current.unconscious.push(e.robot);
    else current.otherExits.push({id:e.robot,reason:e.reason});
  }
  if(e.type==='segment-broken' && e.segment==='head')current.headDestroyed.push(e.robot);
  if(e.type==='unarmed-failure-start')current.headOnlyStarts++;
});
const tally={victories:[0,0,0,0],deaths:[0,0,0,0],unconscious:[0,0,0,0],deathWithWins:[0,0,0,0,0,0,0,0,0,0],reached:{3:0,6:0,9:0},timeouts:0,draws:0,finished:0,completedSeconds:0,maxWins:0,headOnlyStarts:0,failures:[]};
try {
 for(let round=0;round<rounds;round++){
  initializeGame({entry:'setup',session});
  betCommit(session,[{player:0,robot:0,amount:0}]);
  current={index:round,deaths:[],unconscious:[],otherExits:[],headDestroyed:[],headOnlyStarts:0,startingWins:session.garage.map(g=>g.wins)};
  startSpawnSequence();advanceStartup(3);
  if(ctx.startup.phase!=='running')throw Error('Fight did not start');
  let ticks=0;
  const maxTicks=Math.ceil(maxSeconds*60);
  for(;ticks<maxTicks&&!ctx.combat.finished;ticks++)step(1/60);
  current.seconds=Number((ticks/60).toFixed(2));
  current.finished=ctx.combat.finished;
  current.winner=ctx.combat.finished?ctx.combat.winner:null;
  current.hits=ctx.combat.hits;
  current.strikes=ctx.combat.strikes;
  current.endingWins=session.garage.map(g=>g.wins);
  current.maxWins=Math.max(...current.endingWins);
  tally.headOnlyStarts+=current.headOnlyStarts;
  tally.maxWins=Math.max(tally.maxWins,current.maxWins);
  for(const id of current.deaths){tally.deaths[id]++;tally.deathWithWins[Math.min(9,current.startingWins[id])]++;}
  for(const id of current.unconscious)tally.unconscious[id]++;
  if(current.finished){
    tally.finished++;tally.completedSeconds+=current.seconds;
    if(current.winner===null)tally.draws++;
    else tally.victories[current.winner]++;
    if(current.winner!==null)for(const k of [3,6,9])
      if(current.startingWins[current.winner]<k&&session.garage[current.winner].wins>=k)tally.reached[k]++;
  }else{
    tally.timeouts++;
    session.phase='betting';session.bets=[];session.lockedJackpot=0;
  }
  all.push(current);
  console.log('ROUND '+JSON.stringify(current));
  current=null;
 }
} catch(error){tally.failures.push({message:String(error),stack:error?.stack});console.error('ANALYSIS_ERROR',error);process.exitCode=1;}
finally{
 eventSub();ctx.root?.__disposeTag?.();dom.window.close();
 console.log('DEATH_ANALYTICS_JSON '+JSON.stringify({seed,rounds,maxSeconds,tally,strikeSources,hitSources,roundsData:all}));
}
