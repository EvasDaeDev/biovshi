import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {initializeTutorial} from '../src/ui/tutorial.js';
import {initializeModalFocus} from '../src/ui/modal-focus.js';
import {TUTORIAL_CHAPTERS} from '../src/ui/tutorial-content.js';
import {TUTORIAL_STORAGE,freshTutorial,readTutorial,writeTutorial,tutorialChapter,tutorialPlacement} from '../src/ui/tutorial-model.js';
import {advanceStartup} from '../src/game/session.js';
import {step,frame} from '../src/game/loop.js';
import {togglePause,toggleSpeed} from '../src/ui/controls.js';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingOpen,bettingSetup} from '../src/betting/ui.js';
import {garageOpen} from '../src/garage/ui.js';
import {installTowerUI,openMenu,towerPreparation,towerResults,settleTower} from '../src/tower/ui.js';
import {ensureTowerFloorPlan} from '../src/tower/floors.js';
import {towerCycleWins} from '../src/tower/cycles.js';
import {towerFor} from '../src/tower/model.js';
import {earnedStats} from '../src/garage/model.js';
import {BOSS_FLOOR_INTERVAL} from '../src/build-channel.js';

function setup({saved=null,tower=false,legacyRects=false,floor=1}={}){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://tutorial.test/',pretendToBeVisual:true});
 if(legacyRects){
  const original=dom.window.HTMLElement.prototype.getBoundingClientRect;
  dom.window.HTMLElement.prototype.getBoundingClientRect=function(){
   if(this.style.zoom==='2'&&this.style.width==='10px')return {left:0,top:0,right:10,bottom:10,width:10,height:10};
   return original.call(this);
  };
 }
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=dom.window.ResizeObserver=class{observe(){}unobserve(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.confirm=()=>true;
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;
 if(saved)writeTutorial(localStorage,saved);
 const session=tower?betNewSession(['Игрок'],100):null;
 ctx.towerPlayer=0;
 if(tower){const run=towerFor(session,0);run.level=floor;run.wins=floor-1;run.record=floor-1;run.stats=earnedStats(towerCycleWins(run.level));}
 initializeGame({entry:tower?'tower':'auto',session,tower:tower?structuredClone(towerFor(session,0)):null});
 installTowerUI();initializeModalFocus();
 const api=initializeTutorial(),doc=dom.window.document;
 const next=()=>doc.querySelector('[data-tutorial-next]').click();
 const finish=()=>{for(let i=0;i<10&&api.active;i++)next();assert.equal(api.active,false);};
 const cleanup=()=>{ctx.root.__disposeTag();dom.window.close();};
 return {dom,doc,api,next,finish,cleanup};
}

test('tutorial starts at first menu and UI recreation advances past already shown steps',()=>{
 const s=setup();s.api.sync();assert.equal(s.api.active,true);assert.equal(ctx.paused,true);
 s.next();assert.equal(readTutorial(localStorage).steps.menu,1);
 const text=s.doc.querySelector('#tutorial-text').textContent;
 ctx.root.__disposeTag();initializeGame({entry:'auto'});installTowerUI();initializeModalFocus();
 const api=initializeTutorial();api.sync();assert.equal(api.active,true);assert.notEqual(s.doc.querySelector('#tutorial-text').textContent,text);
 assert.equal(readTutorial(localStorage).steps.menu,2);
 for(let i=0;i<5&&api.active;i++)s.next();
 assert.equal(api.active,false);assert.ok(readTutorial(localStorage).completed.includes('menu'));
 api.sync();assert.equal(api.active,false);assert.equal(ctx.paused,false);
 s.cleanup();
});

test('a first boss encounter has its own chapter even after normal tower training, then stays completed',()=>{
 const saved=freshTutorial();saved.completed=['menu','tower-ready','tower'];
 const s=setup({tower:true,floor:BOSS_FLOOR_INTERVAL,saved});
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;
  s.doc.querySelector('#tower-fight').click();advanceStartup(10);
  assert.equal(tutorialChapter(ctx),'tower-boss');assert.equal(ctx.robots.length,4);
  for(const step of TUTORIAL_CHAPTERS['tower-boss'].steps)assert.ok(ctx.root.querySelector(step.target));
  s.api.sync();assert.equal(s.api.active,true);s.finish();
  assert.ok(readTutorial(localStorage).completed.includes('tower-boss'));
  ctx.towerRun.level=BOSS_FLOOR_INTERVAL*2;s.api.sync();assert.equal(s.api.active,false);
 }finally{s.cleanup();}
});

test('skipping training also suppresses the new boss chapter without resetting earlier progress',()=>{
 const saved=freshTutorial();saved.enabled=false;saved.completed=['tower'];
 const s=setup({tower:true,floor:BOSS_FLOOR_INTERVAL,saved});
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;s.doc.querySelector('#tower-fight').click();advanceStartup(10);
  assert.equal(tutorialChapter(ctx),'tower-boss');s.api.sync();assert.equal(s.api.active,false);
  assert.deepEqual(readTutorial(localStorage).completed,['tower']);
 }finally{s.cleanup();}
});

test('insurance gets a dedicated preparation target and reads the live policy rather than the arena snapshot',()=>{
 const s=setup({tower:true});
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;
  ctx.betting.players[0].balance=1000;ctx.betting.capital=1000;
  towerPreparation();
  const step=TUTORIAL_CHAPTERS['tower-ready'].steps.find(step=>step.target==='#tower-insurance');
  assert.ok(step);assert.ok(ctx.root.querySelector(step.target));
  const before=step.text(ctx);ctx.root.querySelector('#tower-insurance').click();
  const confirmation=s.doc.querySelector('#game-action-confirm');
  assert.ok(confirmation,'DMS purchase requires confirmation');
  assert.equal(ctx.betting.towers[0].insurance.checkpoint,null,'opening confirmation never buys a policy');
  confirmation.querySelector('.game-action-confirm-submit').click();
  assert.equal(ctx.towerRun.insurance.checkpoint,null,'arena snapshot is intentionally unchanged');
  assert.notEqual(step.text(ctx),before,'tutorial follows the policy purchased in the current window');
  assert.equal(ctx.betting.towers[0].insurance.checkpoint.level,1);
 }finally{s.cleanup();}
});

test('results copy follows current outcome states without fixed text assertions',()=>{
 const s=setup({tower:true});
 try{
  const step=TUTORIAL_CHAPTERS['tower-results'].steps.find(step=>step.target==='.results-actions');
  const render=winner=>{ctx.combat.winner=winner;return step.text(ctx);};
  ctx.towerOutcome={insuranceFloor:null};const defeat=render(null),win=render(0);
  ctx.towerOutcome.insuranceFloor=7;const insured=render(null);
  assert.notEqual(defeat,win);assert.notEqual(insured,defeat);assert.notEqual(insured,win);
 }finally{s.cleanup();}
});

test('creating a game during training keeps completed menu and setup chapters, while future chapters remain enabled',()=>{
 const s=setup(),previousMenu=ctx.openMainMenu;
 try{
  s.api.sync();s.finish();assert.ok(readTutorial(localStorage).completed.includes('menu'));
  s.doc.querySelector('#launch-overlay').hidden=true;bettingSetup();s.api.sync();s.finish();
  ctx.afterSetup='menu';ctx.openMainMenu=openMenu;
  s.doc.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  s.api.sync();assert.equal(tutorialChapter(ctx),'menu');assert.equal(s.api.active,false);
  const saved=readTutorial(localStorage);assert.ok(saved.completed.includes('menu'));assert.ok(saved.completed.includes('setup'));assert.equal(saved.enabled,true);
  s.doc.querySelector('#launch-overlay').hidden=true;bettingOpen();s.api.sync();
  assert.equal(s.api.active,true);assert.equal(tutorialChapter(ctx),'betting');
 }finally{ctx.openMainMenu=previousMenu;s.cleanup();}
});

test('leaving a partially viewed window resumes at its first unseen step; revisiting fully shown windows stays quiet',()=>{
 const s=setup();
 try{
  s.api.sync();assert.equal(readTutorial(localStorage).steps.menu,0);
  s.doc.querySelector('#launch-overlay').hidden=true;bettingSetup();s.api.sync();assert.equal(tutorialChapter(ctx),'setup');
  s.doc.querySelector('#launch-overlay').hidden=false;s.api.sync();assert.equal(readTutorial(localStorage).steps.menu,1);
  s.next();assert.equal(readTutorial(localStorage).steps.menu,2);
  s.doc.querySelector('#launch-overlay').hidden=true;ctx.betOverlay.hidden=true;s.api.sync();
  s.doc.querySelector('#launch-overlay').hidden=false;s.api.sync();assert.equal(s.api.active,false);
  assert.ok(readTutorial(localStorage).completed.includes('menu'));assert.equal(readTutorial(localStorage).enabled,true);
  s.doc.querySelector('#launch-overlay').hidden=true;ctx.betOverlay.hidden=false;s.api.sync();
  assert.equal(s.api.active,true,'the remaining setup step is still available');assert.equal(readTutorial(localStorage).steps.setup,1);
 }finally{s.cleanup();}
});

test('going back within a chapter does not make already shown later steps repeat after a route change',()=>{
 const s=setup();
 try{
  s.api.sync();s.next();s.next();s.doc.querySelector('[data-tutorial-back]').click();
  assert.equal(readTutorial(localStorage).steps.menu,1);assert.equal(readTutorial(localStorage).seen.menu,3);
  s.doc.querySelector('#launch-overlay').hidden=true;bettingSetup();s.api.sync();
  s.doc.querySelector('#launch-overlay').hidden=false;s.api.sync();assert.equal(s.api.active,false);
 }finally{s.cleanup();}
});

test('a new game can start a fresh tour after every chapter was completed',()=>{
 const saved=freshTutorial();saved.completed=Object.keys(TUTORIAL_CHAPTERS);
 const s=setup({saved});
 try{
  s.api.sync();assert.equal(s.api.active,false);
  s.api.restart({newGame:true});s.api.sync();
  assert.equal(s.api.active,true);assert.deepEqual(readTutorial(localStorage).completed,['setup']);
 }finally{s.cleanup();}
});

test('temporary settings, orientation and loading interruptions preserve the current step, unlike route changes',()=>{
 const s=setup();
 try{
  s.api.sync();s.next();
  for(const property of ['settingsOpen','orientationBlocked']){
   ctx[property]=true;s.api.sync();assert.equal(s.api.active,false);
   ctx[property]=false;s.api.sync();assert.equal(s.api.active,true);assert.equal(readTutorial(localStorage).steps.menu,1);
  }
  ctx.root.inert=true;s.api.sync();assert.equal(s.api.active,false);
  ctx.root.inert=false;s.api.sync();assert.equal(readTutorial(localStorage).steps.menu,1);
  s.api.restart();assert.equal(readTutorial(localStorage).steps.menu,0,'explicit replay from Settings starts over');
  s.finish();assert.equal(ctx.paused,false,'temporary settings must not leak the tutorial pause into gameplay');
 }finally{s.cleanup();}
});

test('skip is reversible, disables all remaining chapters, survives reload and can be restarted in Settings',()=>{
 const s=setup();s.api.sync();s.doc.querySelector('.tutorial-skip').click();
 assert.equal(s.doc.querySelector('.tutorial-skip').hidden,true);
 assert.equal(readTutorial(localStorage).enabled,true);
 s.doc.querySelector('[data-tutorial-back]').click();assert.equal(s.doc.querySelector('.tutorial-skip').hidden,false);
 s.doc.dispatchEvent(new s.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 s.next();assert.equal(s.api.active,false);assert.equal(readTutorial(localStorage).enabled,false);
 s.doc.querySelector('#launch-overlay').hidden=true;bettingSetup();s.api.sync();assert.equal(s.api.active,false);
 s.doc.querySelector('#game-nav-settings').click();assert.equal(ctx.settingsOpen,true);
 s.doc.querySelector('#tutorial-start').click();assert.equal(ctx.settingsOpen,false);assert.equal(s.api.active,true);
 assert.equal(tutorialChapter(ctx),'setup');assert.equal(readTutorial(localStorage).enabled,true);
 s.cleanup();
});

test('a fresh game resets skipped progress only after successful creation, not on opening or cancelling the form',()=>{
 const saved=freshTutorial();saved.enabled=false;saved.completed=['menu','betting'];
 const s=setup({saved});s.doc.querySelector('#launch-overlay').hidden=true;
 bettingSetup();s.api.sync();assert.equal(readTutorial(localStorage).enabled,false);
 s.doc.querySelector('#bet-count').value='0';s.doc.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
 assert.equal(readTutorial(localStorage).enabled,false);
 s.doc.querySelector('#bet-count').value='2';s.doc.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
 s.api.sync();assert.equal(s.api.active,true);assert.equal(tutorialChapter(ctx),'betting');
 assert.deepEqual(readTutorial(localStorage).completed,['setup']);assert.equal(ctx.betting.players.length,2);
 s.cleanup();
});

test('combat tutorial freezes physics, startup, held input and time scale, then restores a running or already paused battle',()=>{
 for(const paused of [false,true]){
  const s=setup();s.doc.querySelector('#launch-overlay').hidden=true;ctx.startup.phase='running';ctx.paused=paused;ctx.timeScale=2;
  let clears=0;ctx.clearTowerInput=()=>clears++;
  s.api.sync();assert.equal(s.api.active,true);assert.ok(clears>0);
  const time=ctx.game.time,round=ctx.round.elapsedSec;
  step(2);frame(10000);frame(20000);togglePause();toggleSpeed();
  assert.equal(ctx.game.time,time);assert.equal(ctx.round.elapsedSec,round);assert.equal(ctx.timeScale,2);assert.equal(ctx.paused,true);
  s.finish();assert.equal(ctx.paused,paused);assert.equal(ctx.last,null);assert.equal(ctx.debt,0);
  s.cleanup();ctx.clearTowerInput=null;
 }
});

test('portrait-orientation interruption resumes the same chapter without permanently pausing gameplay',()=>{
 const s=setup();s.doc.querySelector('#launch-overlay').hidden=true;ctx.startup.phase='running';ctx.paused=false;
 s.api.sync();s.next();ctx.orientationBlocked=true;s.api.sync();assert.equal(s.api.active,false);
 ctx.orientationBlocked=false;s.api.sync();assert.equal(s.api.active,true);assert.equal(readTutorial(localStorage).steps.spectator,1);
 s.finish();assert.equal(ctx.paused,false);s.cleanup();
});

test('chapter selection follows actual visible windows and each reachable chapter resolves its targets',()=>{
 const s=setup();s.doc.querySelector('#launch-overlay').hidden=true;
 bettingSetup();assert.equal(tutorialChapter(ctx),'setup');
 ctx.betting=betNewSession(['Игрок'],100);bettingOpen();assert.equal(tutorialChapter(ctx),'betting');
 for(const step of TUTORIAL_CHAPTERS.betting.steps)assert.ok(ctx.root.querySelector(step.target));
 garageOpen();assert.equal(tutorialChapter(ctx),'garage');
 for(const step of TUTORIAL_CHAPTERS.garage.steps)assert.ok(ctx.root.querySelector(step.target));
 ctx.betOverlay.hidden=true;ctx.startup.phase='spawning';assert.equal(tutorialChapter(ctx),null);
 advanceStartup(10);assert.equal(tutorialChapter(ctx),'spectator');
 ctx.settingsOpen=true;assert.equal(tutorialChapter(ctx),null);ctx.settingsOpen=false;
 ctx.resultsPanel.hidden=false;assert.equal(tutorialChapter(ctx),'betting-results');s.cleanup();
 const t=setup({tower:true});t.doc.querySelector('#launch-overlay').hidden=true;
 assert.equal(tutorialChapter(ctx),'tower-ready');
 for(const step of TUTORIAL_CHAPTERS['tower-ready'].steps)assert.ok(ctx.root.querySelector(step.target));
 t.doc.querySelector('#tower-fight').click();advanceStartup(10);assert.equal(tutorialChapter(ctx),'tower');
 for(const mode of ['control','direction'])for(const touch of [false,true]){
  ctx.towerControlMode=mode;ctx.touchDevice=touch;
  for(const step of TUTORIAL_CHAPTERS.tower.steps){
   const selector=typeof step.target==='function'?step.target(ctx):step.target;
   assert.ok(ctx.root.querySelector(selector));
   assert.equal(typeof (typeof step.text==='function'?step.text(ctx):step.text),'string');
  }
 }
 t.cleanup();
});

test('storage tolerates malformed and unavailable persistence; saved steps cannot become negative or arbitrary objects',()=>{
 for(const value of [null,'broken','{}','{"version":1,"enabled":true,"completed":{},"steps":{}}']){
  assert.deepEqual(readTutorial({getItem:()=>value}),freshTutorial());
 }
 const blocked={getItem(){throw Error();},setItem(){throw Error();}};
 assert.deepEqual(readTutorial(blocked),freshTutorial());assert.doesNotThrow(()=>writeTutorial(blocked,freshTutorial()));
 const s=readTutorial({getItem:()=>JSON.stringify({version:1,enabled:false,completed:['menu',{}],steps:{menu:2,betting:-2,garage:{}}})});
 assert.deepEqual(s.completed,['menu']);assert.deepEqual(s.steps,{menu:2});assert.equal(s.enabled,false);
});

test('placement keeps the bubble in the arena, avoids the highlighted corner and can use the top edge',()=>{
 const bounds={x:300,y:100,width:900,height:600},size={width:400,height:250};
 const target={x:790,y:430,width:400,height:260};
 const box=tutorialPlacement(bounds,size,target);
 assert.notEqual(box.corner,'bottom-right');assert.ok(box.x>=bounds.x&&box.y>=bounds.y);
 assert.ok(box.x+box.width<=bounds.x+bounds.width&&box.y+box.height<=bounds.y+bounds.height);
 const top=tutorialPlacement(bounds,size,{x:300,y:400,width:900,height:300});assert.ok(top.corner.startsWith('top'));
 const phone=tutorialPlacement({x:0,y:0,width:400,height:250},{width:600,height:500},{x:0,y:0,width:20,height:20});
 assert.ok(phone.width<=380&&phone.height<=230);
});

test('disposal removes dialog and restores keyboard ownership without duplicating tutorial UI',()=>{
 const s=setup();s.api.sync();assert.equal(s.doc.querySelectorAll('#game-tutorial').length,1);
 s.cleanup();assert.equal(ctx.tutorial,null);assert.equal(s.doc.querySelector('#game-tutorial'),null);
});

test('without localStorage permission, skip and progress survive game UI recreation in this document',()=>{
 const s=setup();
 Object.defineProperty(s.dom.window,'localStorage',{get(){throw Error('Storage unavailable');},configurable:true});
 s.api.sync();s.doc.querySelector('.tutorial-skip').click();s.next();
 ctx.root.__disposeTag();initializeGame({entry:'auto'});installTowerUI();initializeModalFocus();
 const api=initializeTutorial();api.sync();assert.equal(api.active,false);
 api.restart();assert.equal(api.active,true);s.cleanup();
});

for(const legacyRects of [false,true])test(`phone tutorial spotlight matches a scaled target with ${legacyRects?'legacy':'modern'} rectangles`,()=>{
 const s=setup({legacyRects}),win=s.dom.window;
 Object.defineProperty(win,'visualViewport',{value:{offsetLeft:40,offsetTop:20,width:700,height:250,addEventListener(){},removeEventListener(){}},configurable:true});
 ctx.root.style.zoom='0.4';ctx.layoutScale=.4;
 const box=(left,top,width,height)=>({x:left,y:top,left,top,right:left+width,bottom:top+height,width,height});
 const target=s.doc.querySelector('#launch-game'),panel=s.doc.querySelector('.launch-paper');
 target.getBoundingClientRect=()=>legacyRects?box(800,200,400,100):box(320,80,160,40);
 target.scrollIntoView=()=>assert.fail('tutorial must not move the entire page');
 panel.getBoundingClientRect=()=>legacyRects?box(600,100,470,200):box(240,40,188,80);
 Object.defineProperties(panel,{offsetHeight:{value:200},clientHeight:{value:200}});
 const dialog=s.doc.querySelector('#game-tutorial');dialog.getBoundingClientRect=()=>box(40,20,700,250);
 dialog.querySelector('.tutorial-group').getBoundingClientRect=()=>box(0,0,500,220);
 s.api.sync();
 const spot=dialog.querySelector('.tutorial-spotlight');assert.equal(spot.hidden,false);
 assert.equal(spot.style.left,'276px');assert.equal(spot.style.top,'56px');assert.equal(spot.style.width,'168px');assert.equal(spot.style.height,'48px');
 assert.equal(win.scrollX,0);assert.equal(win.scrollY,0);assert.equal(panel.scrollTop,0);
 s.cleanup();
});


test('saved learners get the boss odds and the automatic reward at the relevant screens',()=>{
 const saved=freshTutorial();saved.completed=['menu','tower-ready','tower','tower-boss'];
 const s=setup({tower:true,floor:5,saved});
 const random=Math.random;
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;
  ensureTowerFloorPlan(towerFor(ctx.betting,0),()=>.2);
  towerPreparation();
  assert.equal(tutorialChapter(ctx),'tower-boss-ready');
  s.api.sync();assert.equal(s.api.active,true);
  assert.ok(s.doc.querySelector('.tower-arena-map .tower-boss-drop'));
  s.finish();assert.ok(readTutorial(localStorage).completed.includes('tower-ready'));
  s.doc.querySelector('#tower-fight').click();advanceStartup(10);
  Math.random=()=>0;
  ctx.combat.winner=0;ctx.combat.finished=true;
  settleTower(0);towerResults();
  assert.equal(tutorialChapter(ctx),'tower-loot');
  s.api.sync();assert.equal(s.api.active,true);
  assert.match(s.doc.querySelector('#tutorial-text').textContent,/склад/);
  s.finish();assert.ok(readTutorial(localStorage).completed.includes('tower-loot'));
 }finally{Math.random=random;s.cleanup();}
});

test('Shelter training follows the existing window and waits behind a confirmation',()=>{
 const saved=freshTutorial();saved.completed=['menu','tower-ready'];
 const s=setup({tower:true,saved});
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;
  s.doc.querySelector('#tower-upgrade-open').click();
  assert.equal(tutorialChapter(ctx),'tower-shelter');
  for(const step of TUTORIAL_CHAPTERS['tower-shelter'].steps)assert.ok(ctx.root.querySelector(step.target));
  const blocker=s.doc.createElement('dialog');blocker.id='game-action-confirm';blocker.setAttribute('open','');
  ctx.root.append(blocker);
  s.api.sync();assert.equal(s.api.active,false);
  blocker.remove();s.api.sync();assert.equal(s.api.active,true);
  s.finish();assert.ok(readTutorial(localStorage).completed.includes('tower-shelter'));
  assert.ok(s.doc.querySelector('#tower-upgrade-window[open]'));
  s.doc.querySelector('#tower-upgrade-window .tower-upgrade-close').click();
  assert.equal(tutorialChapter(ctx),'tower-ready');
 }finally{s.cleanup();}
});

test('the late lesson introduces the soft limit and leaves a cycle notice in control',()=>{
 const saved=freshTutorial();saved.completed=['menu','tower-ready'];
 const s=setup({tower:true,floor:19,saved});
 try{
  s.doc.querySelector('#launch-overlay').hidden=true;
  assert.equal(tutorialChapter(ctx),'tower-late');
  s.api.sync();assert.match(s.doc.querySelector('#tutorial-text').textContent,/9 очков/);
  s.finish();assert.ok(readTutorial(localStorage).completed.includes('tower-late'));
  const run=ctx.betting.towers[0];run.level=31;run.wins=30;run.stats=earnedStats(0);run.cycleNotice=31;
  towerPreparation();
  const notice=s.doc.querySelector('#tower-cycle-notice[open]');assert.ok(notice);
  assert.match(notice.textContent,/зелёная/);
  s.api.sync();assert.equal(s.api.active,false);
  notice.querySelector('button').click();
  assert.equal(tutorialChapter(ctx),'tower-ready');
 }finally{s.cleanup();}
});
