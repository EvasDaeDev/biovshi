import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {resetRound} from '../src/game/session.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://floor.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
 ctx.combat.finished=true;ctx.combat.winner=0;
 return dom;
}
test('next round opens betting while IndexedDB is pending, without PNG data URLs in the Pixi path',async()=>{
 const dom=setup();let encoded=0,installed=0,request;
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray([10,20,30,255])};},putImageData(){}};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
 dom.window.HTMLCanvasElement.prototype.toBlob=callback=>{encoded++;callback(new Blob(['floor']));};
 dom.window.HTMLCanvasElement.prototype.toDataURL=()=>{throw Error('Synchronous PNG encoding should not run');};
 ctx.floorCanvas=document.createElement('canvas');ctx.floorImage=null;
 ctx.arenaRenderer={rasterizeRemains:()=>document.createElement('canvas'),replaceFloor(){installed++;},render(){}};
 globalThis.indexedDB={open(){request={};return request;}};
 await resetRound();assert.equal(ctx.startup.phase,'betting');assert.equal(ctx.floorBaking,false);assert.equal(ctx.resultsAgain.disabled,false);assert.equal(installed,1);
 await Promise.resolve();assert.equal(encoded,1);assert.ok(request);request.onblocked();await ctx.floorSavePromise;assert.equal(ctx.floorStorageAvailable,false);
 ctx.arenaRenderer=null;ctx.floorCanvas=null;delete globalThis.indexedDB;ctx.root.__disposeTag();dom.window.close();
});
test('a failed floor capture preserves the prior floor and does not trap the player on results',async()=>{
 const dom=setup(),previous={};ctx.floorCanvas=previous;
 ctx.arenaRenderer={rasterizeRemains(){throw Error('Readback unavailable');},render(){}};
 const warn=console.warn;console.warn=()=>{};
 try{await resetRound();}finally{console.warn=warn;}
 assert.equal(ctx.startup.phase,'betting');assert.equal(ctx.floorCanvas,previous);assert.match(ctx.lastFloorBakeError,/Предыдущий пол сохранён/);assert.equal(ctx.floorBaking,false);
 ctx.arenaRenderer=null;ctx.floorCanvas=null;ctx.root.__disposeTag();dom.window.close();
});

async function captureBodies(dom){
 const {bakeRoundFloor}=await import('../src/render/floor-history.js');
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray([10,20,30,255])};},putImageData(){}};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
 ctx.floorCanvas=document.createElement('canvas');ctx.floorImage=null;let captured;
 ctx.arenaRenderer={rasterizeRemains(nodes){captured=[...nodes];return document.createElement('canvas');},replaceFloor(){},render(){}};
 await bakeRoundFloor();await ctx.floorSavePromise;return captured;
}
function closeFloor(dom){ctx.arenaRenderer=null;ctx.floorCanvas=null;ctx.root.__disposeTag();dom.window.close();}

test('floor baking keeps dead bodies, blood and fragments, excludes both types of unconscious patient',async()=>{
 const dom=setup();try{
  for(const r of ctx.robots)r.setVisible(true);
  // A cumulative injury KO, with a living head and remaining limbs.
  const {CONFIG}=await import('../src/config.js');const cfg={...CONFIG.combat.trauma};
  try{CONFIG.combat.trauma.threshold=1;ctx.robots[1].damage('arm-1-lower',0,2);}finally{Object.assign(CONFIG.combat.trauma,cfg);}
  ctx.robots[2].damage('head',0,100);
  for(const kind of ['arm','leg'])for(const side of [-1,1])ctx.robots[3].damage(`${kind}-${side}-upper`,0,100);
  ctx.robots[3].failFromOilLoss();
  assert.equal(ctx.robots[1].knockoutCause,'trauma');assert.equal(ctx.robots[3].knockoutCause,'limb-loss');
  const actors=ctx.robots.map(r=>r.actor),captured=await captureBodies(dom);
  assert.deepEqual(captured,[ctx.oilG,ctx.detachedG,actors[2]]);
  for(const actor of actors)assert.equal(actor.isConnected,true,'capturing must not remove bodies from the live scene');
 }finally{closeFloor(dom);}
});

test('a lost tower floor never bakes the unconscious player or surviving opponents',async()=>{
 const dom=setup();try{
  for(const r of ctx.robots)r.setVisible(true);
  const {CONFIG}=await import('../src/config.js');const cfg={...CONFIG.combat.trauma};
  try{CONFIG.combat.trauma.threshold=1;ctx.robots[0].damage('arm-1-lower',1,2);}finally{Object.assign(CONFIG.combat.trauma,cfg);}
  ctx.robots[2].damage('head',1,100);ctx.combat.winner=null;
  const captured=await captureBodies(dom);
  assert.deepEqual(captured,[ctx.oilG,ctx.detachedG,ctx.robots[2].actor]);
  assert.equal(ctx.robots[1].mobile,true);assert.equal(ctx.robots[3].mobile,true);
 }finally{closeFloor(dom);}
});

test('Tower floors survive a loss and reload, stay private, and clear at a cycle change or reset',async()=>{
 const dom=setup(),originalImage=globalThis.Image;
 const {initializeFloor}=await import('../src/render/floor-history.js');
 const {betNewSession}=await import('../src/betting/ledger.js');
 const {bettingLoad}=await import('../src/betting/storage.js');
 const {completeTower,resetTower,towerFor}=await import('../src/tower/model.js');
 const {settleTower}=await import('../src/tower/ui.js');
 const stored=new Map();
 globalThis.indexedDB={open(){
  const request={};
  queueMicrotask(()=>{
   request.result={close(){},transaction(){
    const tx={objectStore(){return {
     get(key){
      const operation={result:stored.get(key)};
      queueMicrotask(()=>{operation.onsuccess?.();tx.oncomplete();});
      return operation;
     },
     put(value,key){stored.set(key,value);queueMicrotask(()=>tx.oncomplete());return {};}
    };}};
    return tx;
   }};
   request.onsuccess();
  });
  return request;
 }};
 globalThis.Image=class {
  naturalWidth=1024;naturalHeight=1024;
  set src(value){queueMicrotask(()=>this.onload?.());}
  async decode(){}
 };
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({
  drawImage(){},getImageData(){return {data:new Uint8ClampedArray([10,20,30,255])};},putImageData(){}
 });
 dom.window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,FLOOR';
 dom.window.HTMLCanvasElement.prototype.toBlob=callback=>callback(new Blob(['floor']));
 let session=betNewSession(['A','B'],100);
 async function enter(player,arenaId){
  ctx.arenaRenderer=null;
  ctx.towerPlayer=player;
  initializeGame({session,entry:'tower',arenaId,tower:towerFor(session,player)});
  ctx.towerSettled=false;
  await initializeFloor();
  ctx.arenaRenderer={rasterizeRemains:()=>document.createElement('canvas'),render(){}};
 }
 async function finish(winner){
  ctx.combat.finished=true;ctx.combat.winner=winner;
  settleTower(winner);
  await ctx.towerFloorBake;
  await ctx.floorSavePromise;
 }
 const clean=()=>assert.equal(ctx.floorCanvas,ctx.cleanFloorCanvas);
 const marked=()=>assert.notEqual(ctx.floorCanvas,ctx.cleanFloorCanvas);
 try{
  await enter(0,'ward');clean();await finish(null);
  ctx.arenaFloors.clear();session=bettingLoad();assert.ok(session);
  await enter(0,'ward');marked();
  await enter(0,'ring');clean();await finish(null);
  await enter(1,'ward');clean();await finish(null);
  for(let i=1;i<30;i++)completeTower(session,0,true,()=>.99);
  await enter(0,'ward');marked();await finish(0);
  assert.equal(towerFor(session,0).level,31);
  await enter(0,'ward');clean();
  await enter(0,'ring');clean();await finish(null);
  await enter(0,'ring');marked();
  resetTower(session,0);
  await enter(0,'ring');clean();
  await enter(1,'ward');marked();
 }finally{
  globalThis.Image=originalImage;delete globalThis.indexedDB;closeFloor(dom);
 }
});
