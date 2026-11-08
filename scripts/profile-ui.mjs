// CPU/DOM diagnostic, not a Safari/GPU FPS benchmark. Simulates 60 seconds at
// 60 physics steps/s and 30 paints/s, with identical RNG and injected UI clock.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
import {step} from '../src/game/loop.js';
import {paint} from '../src/render/frame.js';
import {ASSETS} from '../src/assets/manifest.js';
const results=[];
for(const telemetry of [true,false]){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://profile.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  const oldRandom=Math.random;Math.random=()=>.2468;
  try{initializeGame({textures:Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]))});}finally{Math.random=oldRandom;}
  document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  document.querySelector('#bet-fight').click();advanceStartup(3);
  let wallTime=0;ctx.telemetryNow=()=>wallTime;ctx.telemetryEnabled=telemetry;
  ctx.diagnostics={enabled:true,samples:{}};
  const observer=new dom.window.MutationObserver(()=>{});observer.observe(ctx.roles,{attributes:true,childList:true,subtree:true,characterData:true});
  const buckets=[];let simulation=0,preparation=0;
  for(let i=0;i<3600;i++){
    let start=performance.now();step(1/60);simulation+=performance.now()-start;
    if(i%2===0){wallTime+=1/30;start=performance.now();paint();preparation+=performance.now()-start;}
    if((i+1)%600===0){
      const ui=ctx.diagnostics.samples.telemetry;
      buckets.push({second:(i+1)/60,simulationMsPerStep:+(simulation/600).toFixed(3),paintMs:+(preparation/300).toFixed(3),
        telemetryMsPerPaint:+((ui?.ms??0)/300).toFixed(3),cardMutations:observer.takeRecords().length,
        cardNodes:ctx.roles.querySelectorAll('*').length,drops:ctx.combat.oilDrops.length});
      simulation=preparation=0;ctx.diagnostics.samples={};
    }
  }
  const state={seed:ctx.seed,time:ctx.round.elapsedSec,hits:ctx.combat.hits,strikes:ctx.combat.strikes,hp:ctx.robots.map(r=>[...r.hp]),positions:ctx.robots.map(r=>[r.x,r.y,r.angle])};
  results.push({telemetry,buckets,state});observer.disconnect();ctx.root.__disposeTag();dom.window.close();
  delete ctx.telemetryNow;ctx.diagnostics=null;ctx.telemetryEnabled=true;
}
assert.deepEqual(results[0].state,results[1].state,'UI must not alter the fight');
console.log(JSON.stringify({note:'Node/JSDOM CPU only; browser layout, Safari compositing and GPU are not measured',simulationUnchanged:true,runs:results.map(({state,...run})=>run)},null,2));
