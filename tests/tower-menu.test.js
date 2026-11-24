import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
// Exercise the real application boot and navigation, replacing only image/GPU
// work unavailable in JSDOM. Combat, storage, menu, disposal and handlers are real.
const hooks=registerHooks({load(url,context,next){
 const stubs={
  '/src/assets/preload.js':`import {ASSETS} from './manifest.js';export const preloadTextures=async()=>Object.fromEntries(Object.keys(ASSETS.textures).map(k=>[k,{loaded:true}]));export const loadTextureImage=async()=>{throw Error('No test image decoder')};export const releaseTextureImage=()=>{};`,
  '/src/render/textures.js':'export const applyTextures=async()=>{};',
  '/src/render/floor-history.js':'export const initializeFloor=async()=>{};export const cleanFloor=async()=>{};let pendingBake;export const holdFloorBake=promise=>{pendingBake=promise;};export const bakeRoundFloor=()=>pendingBake;',
  '/src/render/pixi-scene.js':'export const initializePixiArena=async()=>{};'
 };
 const entry=Object.entries(stubs).find(([path])=>url.endsWith(path));
 return entry?{format:'module',source:entry[1],shortCircuit:true}:next(url,context);
}});
const {ctx}=await import('../src/game/state.js');
const {advanceStartup}=await import('../src/game/session.js');
const {bettingLoad}=await import('../src/betting/storage.js');
const {holdFloorBake}=await import('../src/render/floor-history.js');
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(fn(),'application transition completed');}
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
 let release;
 ctx.towerFloorBake=new Promise(resolve=>{release=resolve;});
 document.querySelector('#tower-fight').click();
 assert.equal(sheet.hidden,true,'preparation is hidden synchronously, before the world loads');
 assert.equal(artifacts.hidden,true,'returning artifacts to their parking place cannot display the old screen');
 const cover=document.querySelector('#battle-transition');
 assert.ok(cover,'the backdrop appears immediately');
 assert.equal(cover.querySelector('img').src,document.querySelector('#menu-background img').src);
 assert.equal(document.querySelector('#texture-loading'),null);
 const shade=cover.querySelector('.battle-transition-shade');
 await until(()=>Number(shade.style.opacity)>0);
 assert.ok(Number(shade.style.opacity)<1,'still waiting for arena work');
 assert.notEqual(ctx.startup.phase,'spawning');
 ctx.towerFloorBake=null;release();
 await ctx.towerTransition;
 assert.equal(shade.style.opacity,'1','the backdrop reaches black before advancing');
 assert.equal(cover.isConnected,false,'the ready arena replaces the backdrop');
 assert.equal(ctx.mode,'tower');
 assert.equal(ctx.startup.phase,'spawning');
 assert.equal(document.querySelector('#tower-preparation').hidden,true);
 assert.equal(document.querySelector('#tower-controls').hidden,false,'arena launch restores joystick container after deferred initialization');
 assert.equal(document.querySelector('#tower-stick').hidden,ctx.towerControlMode==='direction',
   'only explicit direction control hides the physical stick');
}
test('boot menu starts spectator fights after mode changes and restarts a saved floor with no duplicate rewards',async()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://menu.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.confirm=()=>true;
 globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
 globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(0)});
 try{
  await import('../src/main.js');await until(()=>!document.querySelector('#texture-loading'));
  document.querySelector('#startup-intro [data-paper-dismiss]').click();
  assert.equal(document.querySelector('#launch-overlay').hidden,false);
  assert.equal(document.querySelector('#launch-setup').classList.contains('is-new-game'),false);
  document.querySelector('#menu-player-create').click();assert.equal(document.querySelector('#bet-title').textContent,'Новая игра');document.querySelector('#bet-count').value='1';document.querySelector('#bet-count').dispatchEvent(new Event('input'));
  document.querySelector('#bet-names input').value='Общий игрок';document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(document.querySelector('#launch-overlay').hidden,false);assert.equal(ctx.betting.players[0].name,'Общий игрок');assert.equal(document.querySelector('#launch-setup').classList.contains('is-new-game'),true);
  await enterTower();document.querySelector('#game-nav-back').click();
  assert.equal(ctx.startup.phase,'menu');assert.equal(ctx.paused,true);
  const watchFight=document.querySelector('#launch-game').onclick();
  assert.ok(document.querySelector('#battle-transition'));
  await watchFight;
  assert.equal(ctx.startup.phase,'spawning','the first spectator launch after Tower preparation must build a new arena');
  advanceStartup(10);assert.equal(ctx.startup.phase,'running');assert.equal(ctx.paused,false);assert.equal(ctx.button.disabled,false);
  assert.equal(ctx.root.querySelector('.arena-pause-label').hidden,true);
  ctx.button.click();assert.equal(ctx.paused,true);ctx.openMainMenu();
  await enterTower();assert.equal(document.querySelector('#launch-overlay').hidden,true);await launchTower();assert.equal(ctx.robots.length,2);
  const controlMode=document.querySelector('#tower-control-mode'),stick=document.querySelector('#tower-stick');
  controlMode.value='direction';controlMode.dispatchEvent(new Event('change'));
  assert.equal(stick.hidden,true,'direction mode deliberately hides the joystick');
  controlMode.value='control';controlMode.dispatchEvent(new Event('change'));
  assert.equal(stick.hidden,false,'switching back restores joystick without rebuilding arena');
  advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,2100);
  document.querySelector('#arena-settings-button').click();document.querySelector('#settings-main-menu').click();await ctx.startTotalizator();assert.equal(ctx.mode,'spectator');assert.equal(ctx.robots.length,4);assert.equal(ctx.betting.players[0].balance,2100);assert.ok(document.querySelector('#bet-stakes-form'));
  await enterTower();await launchTower();assert.equal(ctx.robots[1].hasHead,true);advanceStartup(10);ctx.robots[1].damage('head',0,100);assert.equal(ctx.betting.players[0].balance,2100,'no duplicate payout after mode switch');
  assert.equal(bettingLoad().players[0].balance,2100);
  ctx.openMainMenu();
  assert.equal(document.querySelector('.paper-dialog[open]'),null,'mode changes do not reopen the intro');
  const profiles=document.querySelector('#player-profiles');
  document.querySelector('#launch-setup').click();
  assert.equal(profiles.open,true);
  const cards=profiles.querySelector('.profile-cards');
  assert.equal(cards.children[0].open,false);
  cards.children[0].querySelector('summary').click();
  assert.equal(cards.children[0].open,true);
  assert.equal(cards.children[0].querySelectorAll('dd')[2].textContent,'1');
  const add=profiles.querySelector('.profile-add');
  add.elements.name.value='Второй игрок';
  add.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(cards.children[1].open,true);
  const edit=cards.children[1].querySelector('form');
  edit.elements.name.value='Новое имя';
  edit.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(cards.children[1].querySelector('summary').textContent,'Новое имя');
  assert.equal(bettingLoad().players[1].name,'Новое имя');
  cards.children[1].querySelector('.profile-delete').click();
  document.querySelector('.game-action-confirm-close').click();
  assert.equal(cards.children.length,2);
  cards.children[1].querySelector('.profile-delete').click();
  document.querySelector('.game-action-confirm-submit').click();
  assert.equal(cards.children.length,1);
  assert.equal(bettingLoad().players[0].balance,2100);
  profiles.querySelector('[data-paper-dismiss]').click();
  assert.equal(profiles.open,false);await document.querySelector('#launch-totalizator').onclick();
  document.querySelector('[data-arena="ring"]').click();
  document.querySelector('#bet-fight').click();
  assert.ok(document.querySelector('#battle-transition'));
  assert.equal(document.querySelector('#texture-loading'),null);
  await until(()=>!document.querySelector('#battle-transition'));
  assert.equal(ctx.arenaId,'ring');
  advanceStartup(10);
  assert.equal(ctx.startup.phase,'running');assert.equal(ctx.paused,false);
  ctx.combat.finished=true;ctx.resultsPanel.hidden=false;
  let finishBake;
  holdFloorBake(new Promise(resolve=>{finishBake=resolve;}));
  const oldRound=ctx.resultsAgain.onclick();
  ctx.openMainMenu();await document.querySelector('#launch-totalizator').onclick();
  document.querySelector('#bet-fight').click();
  finishBake();await oldRound;
  await until(()=>!document.querySelector('#battle-transition'));
  assert.equal(ctx.startup.phase,'spawning','the retired round must not reopen stakes over a new fight');
  assert.equal(ctx.betOverlay.hidden,true);
  advanceStartup(10);assert.equal(ctx.startup.phase,'running');assert.equal(ctx.paused,false);assert.equal(ctx.button.disabled,false);
  ctx.openMainMenu();
  document.querySelector('#launch-setup').click();
  cards.children[0].querySelector('summary').click();
  cards.children[0].querySelector('.profile-delete').click();
  document.querySelector('.game-action-confirm-submit').click();
  assert.equal(bettingLoad(),null);
  assert.equal(document.querySelector('#menu-player').hidden,true);
  assert.equal(document.querySelector('#menu-player-create').hidden,false);
  add.elements.name.value='Новый пациент';
  add.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(bettingLoad().players[0].name,'Новый пациент');
  assert.equal(bettingLoad().players[0].balance,2000);
 }finally{ctx.root?.__disposeTag?.();dom.window.close();hooks.deregister();}
});
