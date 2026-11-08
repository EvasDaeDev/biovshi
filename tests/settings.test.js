import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {initializeDiagnostics,timed} from '../src/render/diagnostics.js';
import {ctx} from '../src/game/state.js';
import {advanceStartup} from '../src/game/session.js';
import {step,frame} from '../src/game/loop.js';
import {togglePause,toggleSpeed,fitField} from '../src/ui/controls.js';
import {ASSETS} from '../src/assets/manifest.js';
import {PORTRAIT_BONES,paintPatientPortrait,tintPortraitPixels,preparePatientPortraits} from '../src/ui/patient-portrait.js';
import {TELEMETRY_COLOURS} from '../src/ui/telemetry-colours.js';
import {segmentDisplayState} from '../src/ui/telemetry.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';

function setup(start=true){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://settings.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  initializeGame({textures:Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]))});
  document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));document.querySelector('#bet-fight').click();
  if(start)advanceStartup(3);initializeDiagnostics();
  return dom;
}
const open=()=>document.querySelector('#arena-settings-button').click();
const close=()=>document.querySelector('#arena-settings-close').click();

test('Settings pauses an active fight, blocks background controls and restores speed and clock without catch-up',()=>{
  const dom=setup();toggleSpeed();const seed=ctx.seed,time=ctx.game.time,round=ctx.round.elapsedSec;
  open();assert.equal(ctx.settingsOpen,true);assert.equal(ctx.paused,true);
  assert.equal(document.querySelector('#arena-settings').hidden,false);
  assert.equal(ctx.button.getAttribute('aria-pressed'),'true');assert.equal(ctx.root.querySelector('.tag7hop-layout').inert,true);
  step(1);togglePause();assert.equal(ctx.game.time,time);assert.equal(ctx.paused,true);
  frame(10000);frame(15000);assert.equal(ctx.game.time,time);assert.equal(ctx.round.elapsedSec,round);assert.equal(ctx.seed,seed);
  close();assert.equal(ctx.settingsOpen,false);assert.equal(ctx.paused,false);assert.equal(ctx.timeScale,2);
  assert.equal(ctx.root.querySelector('.tag7hop-layout').inert,false);assert.equal(ctx.last,null);assert.equal(ctx.debt,0);
  frame(16000);assert.equal(ctx.game.time,time,'first resumed frame cannot replay time spent in Settings');
  assert.equal(document.activeElement.id,'arena-settings-button');ctx.root.__disposeTag();dom.window.close();
});

test('Settings preserves an existing manual pause and closes with Escape or backdrop; startup is also frozen',()=>{
  const dom=setup(false),elapsed=ctx.startup.elapsed;
  open();advanceStartup(20);frame(20000);assert.equal(ctx.startup.elapsed,elapsed);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(ctx.settingsOpen,false);
  advanceStartup(3);togglePause();assert.equal(ctx.paused,true);
  open();document.getElementById('arena-settings').click();assert.equal(ctx.settingsOpen,false);assert.equal(ctx.paused,true);
  open();ctx.root.__disposeTag();assert.equal(ctx.root.querySelector('.tag7hop-layout').inert,false);
  assert.equal(document.getElementById('arena-settings').hidden,true);dom.window.close();
});

test('rules are removed, diagnostics live inside Settings and arena size fills the centre width without the old height cap',()=>{
  const dom=setup();assert.equal(document.getElementById('tag7hop-info'),null);
  assert.equal(document.querySelectorAll('.render-diagnostics').length,1);
  assert.ok(document.querySelector('#arena-settings-content .render-diagnostics'));
  const main=ctx.root.querySelector('.tag7hop-main');main.getBoundingClientRect=()=>({width:1220});
  fitField();assert.equal(ctx.fieldSide,1220);assert.equal(ctx.stage.style.width,'1220px');
  assert.equal(ctx.stage.style.height,'','CSS aspect-ratio keeps it square');
  const output=document.querySelector('.performance-details output');
  ctx.diagnostics.last=0;ctx.diagnostics.samples={simulation:{ms:2,count:2}};ctx.updateDiagnostics(1000);
  const before=output.textContent;open();ctx.updateDiagnostics(3000);assert.equal(output.textContent,before,'Settings retains the last active timing snapshot');close();
  ctx.root.__disposeTag();dom.window.close();
});

test('portraits use thirteen original atlas crops, no healthy tint, and alpha-preserving orange/red/grey palettes',()=>{
  assert.equal(PORTRAIT_BONES.length,13);assert.equal(new Set(PORTRAIT_BONES.map(p=>p.key)).size,13);
  assert.equal(TELEMETRY_COLOURS.good,null);assert.equal(TELEMETRY_COLOURS.warn,'#f2a13b');
  for(const state of ['warn','bad','off']){
    const input=new Uint8ClampedArray([128,128,128,192,210,30,70,0]);
    const result=tintPortraitPixels(input,TELEMETRY_COLOURS[state]);
    assert.equal(result[3],192);assert.deepEqual([...result.slice(4)],[210,30,70,0]);
    const colour=TELEMETRY_COLOURS[state].match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));
    assert.ok(Math.abs(result[0]*colour[1]-result[1]*colour[0])<255,'state hue is preserved');
    const highlight=tintPortraitPixels(new Uint8ClampedArray([255,255,255,255]),TELEMETRY_COLOURS[state]);
    assert.ok(Math.abs(highlight[0]*colour[1]-highlight[1]*colour[0])<255,'orange highlights must not clip into yellow');
  }
  const dom=setup(),card=ctx.cardNodes[0];
  assert.equal(card.card.querySelector('svg'),null);assert.equal(card.card.querySelectorAll('canvas').length,1);
  assert.equal(card.portraitStates.head,'good');assert.equal(card.portraitStates['spine-0'],'good');
  ctx.root.__disposeTag();dom.window.close();
});

test('portrait redraws only on a health-state change and damage changes the card without changing arena textures',()=>{
  const dom=setup(),card=ctx.cardNodes[0],r=ctx.robots[0];let draws=0,clears=0;
  card.portrait.getContext=()=>({setTransform(){},clearRect(){clears++;},save(){},restore(){},transform(){},drawImage(){draws++;}});
  card.portraitAtlas={good:{kind:'original'},warn:{},bad:{},off:{}};ctx.telemetryPortraitsReady=true;
  const states=()=>PORTRAIT_BONES.map(({key})=>({key,...segmentDisplayState(r,key)}));
  paintPatientPortrait(card,0,states());assert.equal(draws,13);assert.equal(clears,1);
  for(let i=0;i<100;i++)paintPatientPortrait(card,0,states());assert.equal(draws,13,'no per-frame bitmap work');
  const atlas=r.actor.querySelector('image').getAttribute('href');
  for(let i=0;i<3;i++){ctx.game.time+=1;r.damage('arm--1-upper',1);}ctx.telemetryDirty=true;paintTelemetry();
  assert.equal(card.portraitStates['arm--1-upper'],'off');assert.equal(card.portraitStates['arm--1-lower'],'off');
  assert.equal(draws,26);assert.equal(r.actor.querySelector('image').getAttribute('href'),atlas);
  ctx.root.__disposeTag();dom.window.close();
});
