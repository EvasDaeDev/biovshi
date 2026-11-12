import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {emitGameEvent} from '../src/game/event-bus.js';
import {initializeStreamerMascot,createReactionTrack,reactionFor} from '../src/ui/streamer-mascot.js';
import {initializeHints} from '../src/ui/hints.js';

test('reactions coalesce, prioritise knockouts and finals, and expire without a backlog',()=>{
 const track=createReactionTrack();
 for(let i=0;i<100;i++)track.offer({type:'hit',time:i,damage:1});
 track.offer({type:'segment-broken'});track.offer({type:'hit',damage:1});
 track.tick(.1);assert.equal(track.tick(.1).emotion,'fear');
 track.offer({type:'combat-end',winner:0});track.tick(.1);assert.equal(track.tick(.1).emotion,'cheer');
 for(let i=0;i<60;i++)track.tick(.1);
 assert.equal(track.tick(.1),null);
 track.offer({type:'hit'});for(let i=0;i<30;i++)track.tick(.1,false);
 assert.equal(track.tick(.1),null);
 track.offer({type:'combat-end',winner:0});track.reset();assert.equal(track.tick(.1),null);
 assert.equal(reactionFor({type:'robot-immobilized',reason:'потерял сознание'}).emotion,'admire');
 assert.equal(reactionFor({type:'robot-immobilized',reason:'погиб'}).emotion,'fear');
});

test('mascot renders in both modes, keeps its own visibility and uses shared hints',()=>{
 for(const mode of ['tower','spectator']){
  const dom=new JSDOM('<div id="root"><div class="tag7hop-stage"><ol id="combat-log" hidden></ol></div></div>',{url:'https://mascot.test/',pretendToBeVisual:true});
  const {window:win}=dom;const calls=[];
  const painter=new Proxy({imageSmoothingEnabled:true,getImageData:()=>({data:new Uint8ClampedArray(163*249*4)})},{get:(o,k)=>k in o?o[k]:(...args)=>calls.push([k,...args])});
  win.HTMLCanvasElement.prototype.getContext=()=>painter;
  const images=[];win.Image=class{constructor(){this.naturalWidth=783;this.naturalHeight=512;images.push(this);}set src(value){this.url=value;}};
  Object.assign(ctx,{root:win.document.querySelector('#root'),stage:win.document.querySelector('.tag7hop-stage'),mode,combat:{finished:false},startup:{phase:'running'},paused:false,settingsOpen:false,orientationBlocked:false});
  ctx.root.__disposeTag=()=>{};
  initializeStreamerMascot();initializeHints();images[0].onload();
  const button=ctx.root.querySelector('#streamer-mascot-toggle'),box=ctx.root.querySelector('#streamer-mascot');
  assert.equal(button.hasAttribute('title'),false);
  button.dispatchEvent(new win.Event('pointerover',{bubbles:true}));
  assert.equal(win.document.querySelector('.biovshi-hint').textContent,'Скрыть маскота');
  assert.equal(box.hidden,false);ctx.streamerMascot.sync(.1,100);
  assert.equal(painter.imageSmoothingEnabled,false);assert.ok(calls.some(c=>c[0]==='drawImage'));
  emitGameEvent('combat-end',{winner:0});ctx.streamerMascot.sync(.1,200);ctx.streamerMascot.sync(.1,300);
  assert.equal(box.dataset.emotion,'cheer');
  assert.equal(box.querySelector('.streamer-quip').textContent,'Остался один!');
  assert.equal(box.querySelector('.streamer-quip').hidden,false);
  ctx.streamerMascot.reset();ctx.streamerMascot.sync(.1,400);assert.equal(box.dataset.emotion,'neutral');
  assert.equal(box.querySelector('.streamer-quip').hidden,true);
  ctx.paused=true;for(let i=0;i<110;i++)ctx.streamerMascot.sync(.1,500+i*100);
  assert.equal(box.querySelector('.streamer-quip').hidden,true);
  ctx.paused=false;for(let i=0;i<104;i++)ctx.streamerMascot.sync(.1,12000+i*100);
  assert.equal(box.dataset.emotion,'annoyed');
  assert.equal(box.querySelector('.streamer-quip').textContent,'…скуучно.');
  button.click();assert.equal(box.hidden,true);assert.equal(button.dataset.hint,'Показать маскота');
  assert.equal(win.localStorage.getItem('biovshi.streamer-hidden.v1'),'true');
  const count=calls.length;emitGameEvent('segment-broken',{});ctx.streamerMascot.sync(.1,500);assert.equal(calls.length,count);
  ctx.root.__disposeTag();assert.equal(ctx.streamerMascot,null);assert.equal(box.isConnected,false);
  initializeStreamerMascot();assert.equal(ctx.root.querySelector('#streamer-mascot').hidden,true);
  ctx.root.__disposeTag();dom.window.close();
 }
});

test('mascot preserves pixel scaling and participates in normal and standalone asset pipelines',()=>{
 const css=fs.readFileSync(new URL('../styles/streamer.css',import.meta.url),'utf8');
 assert.match(css,/image-rendering:pixelated/);
 assert.match(css,/data-game-mode="tower"/);
 const initialize=fs.readFileSync(new URL('../src/game/initialize.js',import.meta.url),'utf8');
 assert.match(initialize,/initializeStreamerMascot\(\)/);
});
