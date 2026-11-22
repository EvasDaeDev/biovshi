import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
// Exercise the real application boot and navigation, replacing only image/GPU
// work unavailable in JSDOM. Combat, storage, menu, disposal and handlers are real.
const hooks=registerHooks({load(url,context,next){
 const stubs={
  '/src/assets/preload.js':`import {ASSETS} from './manifest.js';export const preloadTextures=async()=>Object.fromEntries(Object.keys(ASSETS.textures).map(k=>[k,{loaded:false}]));export const loadTextureImage=async()=>{throw Error('No test image decoder')};export const releaseTextureImage=()=>{};`,
  '/src/render/textures.js':'export const applyTextures=async()=>{};',
  '/src/render/floor-history.js':'export const initializeFloor=async()=>{};export const cleanFloor=async()=>{};export const bakeRoundFloor=async()=>{};',
  '/src/render/pixi-scene.js':'export const initializePixiArena=async()=>{};'
 };
 const entry=Object.entries(stubs).find(([path])=>url.endsWith(path));
 return entry?{format:'module',source:entry[1],shortCircuit:true}:next(url,context);
}});
const {ctx}=await import('../src/game/state.js');
const {advanceStartup}=await import('../src/game/session.js');
const {bettingLoad}=await import('../src/betting/storage.js');
async function until(fn){for(let i=0;i<100;i++){if(fn())return;await new Promise(resolve=>setImmediate(resolve));}assert.ok(fn(),'application transition completed');}
async function enterTower(){
 const oldRobots=ctx.robots;
 await ctx.startTower(0);
 assert.equal(document.querySelector('#tower-floor-selector'),null,'no secondary dialog');
 assert.equal(document.querySelector('#tower-preparation').hidden,false,'original preparation sheet appears');
 assert.equal(ctx.startup.phase,'tower-ready');
 assert.equal(ctx.root.dataset.gameMode,'tower-preparing','preparation uses the dark backdrop');
 assert.equal(ctx.robots,oldRobots,'preparation did not load a new arena or patients');
 assert.ok(document.querySelector('#tower-floor-preview .tower-challenge-option'));
 assert.equal(document.querySelector('#tower-controls').hidden,true,'joystick container stays hidden during preparation');
}
async function launchTower(){
 const sheet=document.querySelector('#tower-preparation');
 const artifacts=document.querySelector('#tower-prep-artifacts');
 assert.ok(artifacts.closest('#tower-upgrade-artifacts-page'),
   'the collection starts inside the Shelter, not the preparation sheet');
 assert.equal(artifacts.hidden,false);
 document.querySelector('#tower-fight').click();
 assert.equal(sheet.hidden,true,'preparation is hidden synchronously, before the world loads');
 assert.equal(artifacts.hidden,true,'returning artifacts to their parking place cannot display the old screen');
 assert.ok(document.querySelector('#texture-loading'),
   'a full-screen loading cover hides the previous world during asynchronous initialization');
 await ctx.towerTransition;
 assert.equal(document.querySelector('#texture-loading'),null,'loading cover is cleared after arena is ready');
 assert.equal(ctx.mode,'tower');
 assert.equal(ctx.startup.phase,'spawning');
 assert.equal(document.querySelector('#tower-preparation').hidden,true);
 assert.equal(document.querySelector('#tower-controls').hidden,false,'arena launch restores joystick container after deferred initialization');
 assert.equal(document.querySelector('#tower-stick').hidden,ctx.towerControlMode==='direction',
   'only explicit direction control hides the physical stick');
}
test('boot menu creates shared players, switches modes and restarts a saved floor with no duplicate rewards',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://menu.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.confirm=()=>true;
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 try{
  await import('../src/main.js');await until(()=>!document.querySelector('#texture-loading'));
  document.querySelector('#startup-intro [data-startup-dismiss]').click();
  assert.equal(document.querySelector('#launch-overlay').hidden,false);
  assert.equal(document.querySelector('#launch-setup').classList.contains('is-new-game'),false);
  document.querySelector('#launch-tower').click();document.querySelector('#bet-count').value='1';document.querySelector('#bet-count').dispatchEvent(new Event('input'));
  document.querySelector('#bet-names input').value='Общий игрок';document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(document.querySelector('#launch-overlay').hidden,false);assert.equal(ctx.betting.players[0].name,'Общий игрок');assert.equal(document.querySelector('#launch-setup').classList.contains('is-new-game'),true);
  await enterTower();assert.equal(document.querySelector('#launch-overlay').hidden,true);await launchTower();assert.equal(ctx.robots.length,2);
  const controlMode=document.querySelector('#tower-control-mode'),stick=document.querySelector('#tower-stick');
  controlMode.value='direction';controlMode.dispatchEvent(new Event('change'));
  assert.equal(stick.hidden,true,'direction mode deliberately hides the joystick');
  controlMode.value='control';controlMode.dispatchEvent(new Event('change'));
  assert.equal(stick.hidden,false,'switching back restores joystick without rebuilding arena');
  advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,210);
  document.querySelector('#arena-settings-button').click();document.querySelector('#settings-main-menu').click();await ctx.startTotalizator();assert.equal(ctx.mode,'spectator');assert.equal(ctx.robots.length,4);assert.equal(ctx.betting.players[0].balance,210);assert.ok(document.querySelector('#bet-stakes-form'));
  await enterTower();await launchTower();assert.equal(ctx.robots[1].hasHead,true);advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,210,'no duplicate payout after mode switch');
  assert.equal(bettingLoad().players[0].balance,210);
  await ctx.startSetup();assert.equal(ctx.mode,'spectator');assert.ok(document.querySelector('#bet-setup-form'));
  assert.equal(document.querySelector('.startup-dialog[open]'),null,'mode changes do not reopen the intro');
 }finally{ctx.root?.__disposeTag?.();dom.window.close();hooks.deregister();}
});
