import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {initializeDiagnostics,timed} from '../src/render/diagnostics.js';
import {ctx} from '../src/game/state.js';
import {advanceStartup} from '../src/game/session.js';
import {fittedCamera} from '../src/render/camera.js';
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
  document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));document.querySelector('#garage-next').click();document.querySelector('#bet-fight').click();
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

test('rules are removed, graphics and diagnostics live in Settings and the rectangular viewport contains a square arena',()=>{
  const dom=setup();assert.equal(document.getElementById('tag7hop-info'),null);
  assert.equal(document.querySelectorAll('.render-diagnostics').length,1);
  assert.ok(document.querySelector('#arena-settings-content .render-diagnostics'));
  const main=ctx.root.querySelector('.tag7hop-main');main.getBoundingClientRect=()=>({width:1220});
  const boundary=JSON.stringify(ctx.arenaBoundary.points);
  fitField();assert.equal(ctx.fieldWidth,1220);assert.equal(ctx.stage.style.width,'1220px');
  assert.ok(ctx.fieldHeight<ctx.fieldWidth);assert.equal(ctx.fieldSide,ctx.fieldHeight);
  assert.equal(ctx.stage.style.height,ctx.fieldHeight+'px');
  assert.equal(ctx.svg.getAttribute('preserveAspectRatio'),'xMidYMid meet');
  assert.equal(JSON.stringify(ctx.arenaBoundary.points),boundary);
  assert.equal(ctx.root.querySelector('.atmosphere-controls #graphics-quality'),null);
  assert.ok(ctx.root.querySelector('#arena-settings #graphics-quality'));
  assert.equal(ctx.root.querySelectorAll('#graphics-quality').length,1);
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


test('rectangular projection fits the whole square arena with equal axis scale and centred side margins',()=>{
  for(const [width,height] of [[1220,900],[800,400],[400,800]]){
    const camera=fittedCamera(width,height,-38,-38,776),side=Math.min(width,height);
    const project=(x,y)=>({x:x*camera.scale+camera.x,y:y*camera.scale+camera.y});
    const first=project(-38,-38),last=project(738,738);
    assert.ok(Math.abs(last.x-first.x-side)<1e-8);assert.ok(Math.abs(last.y-first.y-side)<1e-8);
    assert.ok(Math.abs(first.x-(width-side)/2)<1e-8);assert.ok(Math.abs(first.y-(height-side)/2)<1e-8);
  }
});

test('grey portrait segments are 50 percent darker in RGB while alpha stays unchanged',()=>{
  const sample=()=>new Uint8ClampedArray([145,120,80,180,255,255,255,255,32,18,10,0]);
  const original=tintPortraitPixels(sample(),TELEMETRY_COLOURS.off);
  const shaded=tintPortraitPixels(sample(),TELEMETRY_COLOURS.off,.5);
  for(let i=0;i<8;i++)if(i%4===3)assert.equal(shaded[i],original[i]);else assert.ok(Math.abs(shaded[i]-original[i]/2)<=1);
  assert.deepEqual([...shaded.slice(8)],[32,18,10,0]);
});

test('expand fills the available viewport without pausing, changing time scale or touching the simulation',()=>{
  const dom=setup(),button=document.getElementById('arena-expand-button');
  const main=ctx.root.querySelector('.tag7hop-main');main.getBoundingClientRect=()=>({width:ctx.arenaExpanded?1200:700});
  ctx.root.querySelector('.atmosphere-controls').getBoundingClientRect=()=>({height:60});
  fitField();toggleSpeed();const seed=ctx.seed,time=ctx.game.time,camera=JSON.stringify(ctx.camera),last=ctx.last,debt=ctx.debt;
  let renders=0;ctx.arenaRenderer={resize(){},render(){renders++;}};
  button.click();
  assert.equal(ctx.arenaExpanded,true);assert.equal(ctx.root.classList.contains('arena-expanded'),true);
  assert.equal(button.getAttribute('aria-label'),'Свернуть');assert.equal(button.getAttribute('aria-pressed'),'true');
  assert.equal(ctx.fieldWidth,1200);assert.equal(ctx.fieldHeight,dom.window.innerHeight-60-36);
  assert.equal(ctx.paused,false);assert.equal(ctx.timeScale,2);assert.equal(ctx.seed,seed);assert.equal(ctx.game.time,time);
  assert.equal(JSON.stringify(ctx.camera),camera);assert.equal(ctx.last,last);assert.equal(ctx.debt,debt);
  assert.equal(renders,1);
  const cards=ctx.roles.innerHTML;ctx.game.time+=1;ctx.robots[0].damage('head',1);paintTelemetry();
  assert.equal(ctx.roles.innerHTML,cards,'hidden telemetry does no rendering work');
  button.click();
  assert.equal(ctx.arenaExpanded,false);assert.equal(button.getAttribute('aria-label'),'Развернуть');
  assert.equal(ctx.fieldWidth,700);assert.notEqual(ctx.roles.innerHTML,cards,'cards catch up immediately on collapse');
  assert.equal(ctx.paused,false);assert.equal(ctx.timeScale,2);
  ctx.arenaRenderer=null;ctx.root.__disposeTag();dom.window.close();
});

test('Escape closes Settings before collapsing the arena and preserves a manual pause and telemetry preference',()=>{
  const dom=setup();togglePause();
  const toggle=document.querySelector('.render-diagnostics input');toggle.checked=false;toggle.dispatchEvent(new Event('change'));
  document.getElementById('arena-expand-button').click();open();
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(ctx.settingsOpen,false);assert.equal(ctx.arenaExpanded,true);assert.equal(ctx.paused,true);
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(ctx.arenaExpanded,false);assert.equal(ctx.paused,true);assert.equal(ctx.telemetryEnabled,false);
  assert.equal(toggle.checked,false);assert.equal(ctx.root.querySelector('.tag7hop-sidebar-wrap').style.visibility,'hidden');
  assert.equal(ctx.betHud.hidden,false,'layout mode does not overwrite ledger visibility');
  ctx.root.__disposeTag();dom.window.close();
});

test('disposing expanded mode restores scrolling and removes its listeners',()=>{
  const dom=setup();document.documentElement.style.overflow='clip';document.body.style.overflow='scroll';
  const button=document.getElementById('arena-expand-button');button.click();
  assert.equal(document.documentElement.style.overflow,'hidden');assert.equal(document.body.style.overflow,'hidden');
  ctx.root.__disposeTag();
  assert.equal(document.documentElement.style.overflow,'clip');assert.equal(document.body.style.overflow,'scroll');
  assert.equal(ctx.arenaExpanded,false);assert.equal(button.onclick,null);assert.equal(button.getAttribute('aria-pressed'),'false');
  dom.window.close();
});
