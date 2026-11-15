import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor} from '../src/tower/model.js';
import {installTowerUI,towerPreparation} from '../src/tower/ui.js';
import {advanceStartup,resetRound} from '../src/game/session.js';
import {frame} from '../src/game/loop.js';
import {setPaused,togglePause} from '../src/ui/controls.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://pause.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};globalThis.confirm=()=>true;
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 const session=betNewSession(['Игрок'],100);
 const initialize=()=>{initializeGame({session,entry:'tower',tower:structuredClone(towerFor(session,0))});installTowerUI();};
 initialize();return {dom,session,initialize,close(){ctx.root.__disposeTag();dom.window.close();}};
}
function assertResumed(){
 assert.equal(ctx.paused,false);assert.equal(document.querySelector('.arena-pause-label').hidden,true);
 assert.equal(ctx.button.getAttribute('aria-pressed'),'false');assert.equal(ctx.button.textContent,'Пауза');
}
for(const entry of ['settings-menu','manual-pause'])test(`tower entry after ${entry} clears the previous pause overlay and keeps controls aligned with physics`,()=>{
 const f=setup();try{
  if(entry==='settings-menu'){
   document.querySelector('#arena-settings-button').click();assert.equal(ctx.paused,true);
   document.querySelector('#settings-main-menu').click();assert.equal(ctx.settingsOpen,false);assert.equal(ctx.startup.phase,'menu');
  }else setPaused(true);
  assert.equal(document.querySelector('.arena-pause-label').hidden,false);
  f.initialize();assertResumed();
  document.querySelector('#tower-fight').click();advanceStartup(20);assert.equal(ctx.startup.phase,'running');assertResumed();
  const time=ctx.game.time;frame(1000);frame(1100);assert.ok(ctx.game.time>time,'fight advances without a false pause label');
  togglePause();assert.equal(ctx.paused,true);assert.equal(document.querySelector('.arena-pause-label').hidden,false);assert.equal(ctx.button.getAttribute('aria-pressed'),'true');
  const pausedTime=ctx.game.time;frame(5000);frame(6000);assert.equal(ctx.game.time,pausedTime);
  togglePause();assertResumed();frame(10000);assert.equal(ctx.game.time,pausedTime,'resume discards background wall-clock time');frame(10100);assert.ok(ctx.game.time>pausedTime);
 }finally{f.close();}
});
test('starting a prepared tower floor in the same view clears menu pause consistently',()=>{
 const f=setup();try{
  document.querySelector('#arena-settings-button').click();document.querySelector('#settings-main-menu').click();
  towerPreparation();document.querySelector('#tower-fight').click();assertResumed();advanceStartup(20);assertResumed();
 }finally{f.close();}
});
test('round reset clears pause label and button together before the next fight',async()=>{
 const f=setup();try{
  initializeGame({session:f.session,entry:'betting'});setPaused(true);await resetRound();assertResumed();
 }finally{f.close();}
});
