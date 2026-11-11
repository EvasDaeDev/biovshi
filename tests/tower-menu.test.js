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
test('boot menu creates shared players, switches modes and restarts a saved floor with no duplicate rewards',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://menu.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.confirm=()=>true;
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 try{
  await import('../src/main.js');await until(()=>!document.querySelector('#texture-loading'));
  assert.equal(document.querySelector('#launch-overlay').hidden,false);
  document.querySelector('#launch-tower').click();document.querySelector('#bet-count').value='1';document.querySelector('#bet-count').dispatchEvent(new Event('input'));
  document.querySelector('#bet-names input').value='Общий игрок';document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(document.querySelector('#launch-overlay').hidden,false);assert.equal(ctx.betting.players[0].name,'Общий игрок');
  await ctx.startTower(0);assert.equal(ctx.mode,'tower');assert.equal(ctx.robots.length,2);assert.equal(document.querySelector('#launch-overlay').hidden,true);assert.equal(document.querySelector('#tower-preparation').hidden,false);
  document.querySelector('#tower-fight').click();advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,110);
  document.querySelector('#game-menu').click();await ctx.startTotalizator();assert.equal(ctx.mode,'spectator');assert.equal(ctx.robots.length,4);assert.equal(ctx.betting.players[0].balance,110);assert.ok(document.querySelector('#bet-stakes-form'));
  await ctx.startTower(0);assert.equal(ctx.robots[1].hasHead,true);document.querySelector('#tower-fight').click();advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,110,'no duplicate payout after mode switch');
  assert.equal(bettingLoad().players[0].balance,110);
  await ctx.startSetup();assert.equal(ctx.mode,'spectator');assert.ok(document.querySelector('#bet-setup-form'));
 }finally{ctx.root?.__disposeTag?.();dom.window.close();hooks.deregister();}
});
