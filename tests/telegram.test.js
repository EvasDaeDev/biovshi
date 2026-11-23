import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {telegramWebApp,telegramInsets,supportsTelegram} from '../src/platform/telegram.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor} from '../src/tower/model.js';
import {installTowerUI} from '../src/tower/ui.js';
import {initializeGameNavigation} from '../src/ui/game-navigation.js';
import {confirmGameAction} from '../src/ui/confirm-action.js';
import {frame,step} from '../src/game/loop.js';
import {advanceStartup} from '../src/game/session.js';
import {setPaused,fitField} from '../src/ui/controls.js';
import {contentViewport} from '../src/ui/geometry.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
function mockApp(version='8.0'){
 const listeners=new Map(),calls=[];
 const app={version,platform:'android',isActive:true,isFullscreen:false,isOrientationLocked:false,viewportStableHeight:390,
  safeAreaInset:{top:10,right:20,bottom:5,left:15},contentSafeAreaInset:{top:32,right:0,bottom:0,left:0},
  BackButton:{show(){calls.push('BackButton.show');},hide(){calls.push('BackButton.hide');}},
  onEvent(name,fn){const set=listeners.get(name)??new Set();set.add(fn);listeners.set(name,set);},
  offEvent(name,fn){listeners.get(name)?.delete(fn);},
 };
 for(const name of ['ready','expand','requestFullscreen','lockOrientation','disableVerticalSwipes'])app[name]=()=>calls.push(name);
 return {app,calls,listeners,emit(name,data){for(const fn of [...listeners.get(name)??[]])fn(data);},count(){return [...listeners.values()].reduce((sum,set)=>sum+set.size,0);}};
}
function setup({version='8.0',sdk=true,touch=true}={}){
 const dom=new JSDOM(html,{url:'https://telegram.test/biovshi/test/',pretendToBeVisual:true});
 const win=dom.window,doc=win.document,mock=mockApp(version);
 Object.defineProperties(win,{innerWidth:{value:844,writable:true},innerHeight:{value:390,writable:true}});
 const orientation=new win.EventTarget();orientation.type='landscape-primary';
 Object.defineProperty(win.screen,'orientation',{value:orientation,configurable:true});
 if(sdk)win.Telegram={WebApp:mock.app};
 for(const key of ['document','localStorage','Event'])globalThis[key]=win[key];
 globalThis.matchMedia=()=>({matches:touch});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 const session=betNewSession(['Игрок'],100);
 const initialize=()=>{initializeGame({session,entry:'tower',tower:structuredClone(towerFor(session,0))});installTowerUI();};
 initialize();
 return {dom,win,doc,mock,orientation,session,initialize,close(){ctx.root.__disposeTag();dom.window.close();},
  fight(){doc.querySelector('#tower-fight').click();advanceStartup(20);assert.equal(ctx.startup.phase,'running');}};
}

test('platform detection ignores SDK defaults, missing SDK and unrelated Telegram globals',()=>{
 for(const win of [{},{Telegram:{}},{Telegram:{WebApp:{platform:'unknown',onEvent(){}}}},{Telegram:{WebApp:{platform:'android'}}}])assert.equal(telegramWebApp(win),null);
 const {app}=mockApp();assert.equal(telegramWebApp({Telegram:{WebApp:app}}),app);
 assert.equal(supportsTelegram(app,'8.0'),true);assert.equal(supportsTelegram(app,'8.1'),false);
 app.version='10.1';assert.equal(supportsTelegram(app,'8.0'),true);
 app.isVersionAtLeast=()=>{throw Error('unsupported');};assert.equal(supportsTelegram(app,'8.0'),false);
 assert.deepEqual(telegramInsets({safeAreaInset:{top:NaN,left:-1},contentSafeAreaInset:{top:4}}),{top:4,right:0,bottom:0,left:0});
});

test('Telegram system Back closes confirmation first and then Settings without leaving the current screen',()=>{
 const f=setup();
 try{
  const navigation=initializeGameNavigation();
  const launch=f.doc.querySelector('#launch-overlay');
  const tower=f.doc.querySelector('#tower-preparation');
  launch.hidden=true;tower.hidden=false;navigation.update();
  const nav=f.doc.querySelector('#game-nav-back');
  assert.ok(nav);
  let charges=0;
  const popup=confirmGameAction({root:ctx.root,title:'УСТАНОВКА',cost:100,onConfirm:()=>charges++});
  f.mock.emit('backButtonClicked');
  assert.equal(popup.isConnected,false);
  assert.equal(charges,0,'system Back cancels and never purchases');
  assert.equal(tower.hidden,false,'underlying preparation remains visible');
  f.doc.querySelector('#game-nav-settings').click();
  assert.equal(ctx.settingsOpen,true);
  f.mock.emit('backButtonClicked');
  assert.equal(ctx.settingsOpen,false);
  assert.equal(tower.hidden,false);
  const loader=f.doc.querySelector('#texture-loading');
  loader.setAttribute('aria-busy','false');
  const dismiss=f.doc.createElement('button');
  dismiss.className='loading-dismiss';
  loader.append(dismiss);
  dismiss.onclick=()=>loader.remove();
  f.mock.emit('backButtonClicked');
  assert.equal(loader.isConnected,false,'native Back dismisses failed loading overlay');
  assert.equal(tower.hidden,false,'native Back cannot navigate behind the loader');
  assert.ok(f.mock.calls.includes('BackButton.show'));
  ctx.root.querySelector('#launch-overlay').hidden=false;tower.hidden=true;
  // Native Back is hidden on the main menu; it is not an app-exit command.
  f.doc.querySelector('#game-nav-back').hidden=true;
  ctx.platform.setBackAvailable(false);
  assert.ok(f.mock.calls.includes('BackButton.hide'));
 }finally{f.close();}
});

test('SDK loads only for launch parameters; no SDK network request in a browser',()=>{
 const bootstrap=html.match(/<!-- telegram-sdk:start -->[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
 for(const telegram of [false,true]){
  const dom=new JSDOM(html,{url:'https://example.test/'+(telegram?'#tgWebAppPlatform=ios&tgWebAppVersion=8.0':''),runScripts:'outside-only'});
  try{dom.window.eval(bootstrap);assert.equal(dom.window.document.querySelectorAll('script[src$="/vendor/telegram-web-app-65.js"]').length,telegram?1:0);}finally{dom.window.close();}
 }
});

test('deactivation stops physics and input without touching manual pause; resume has no time debt',()=>{
 const f=setup();try{
  f.fight();frame(1000);frame(1100);assert.ok(ctx.game.time>0);
  f.doc.dispatchEvent(new f.win.KeyboardEvent('keydown',{code:'KeyD'}));assert.equal(ctx.towerInput.x,1);
  const time=ctx.game.time,round=ctx.round.elapsedSec;
  f.mock.app.isActive=false;f.mock.emit('deactivated');
  assert.equal(ctx.appInactive,true);assert.equal(ctx.paused,false);assert.deepEqual(ctx.towerInput,{x:0,y:0});
  f.doc.dispatchEvent(new f.win.KeyboardEvent('keydown',{code:'KeyD'}));assert.equal(ctx.towerInput.x,0);
  step(1);frame(10000);frame(20000);assert.equal(ctx.game.time,time);assert.equal(ctx.round.elapsedSec,round);
  f.mock.app.isActive=true;f.mock.emit('activated');frame(30000);assert.equal(ctx.game.time,time);
  frame(30100);assert.ok(ctx.game.time>time);
  setPaused(true);f.mock.app.isActive=false;f.mock.emit('deactivated');f.mock.app.isActive=true;f.mock.emit('activated');
  const paused=ctx.game.time;frame(40000);frame(40100);assert.equal(ctx.paused,true);assert.equal(ctx.game.time,paused);
 }finally{f.close();}
});

test('page visibility and Telegram activity both have to permit resumption; BFCache resets clocks',()=>{
 const f=setup();try{
  f.fight();Object.defineProperty(f.doc,'hidden',{value:true,configurable:true});f.doc.dispatchEvent(new f.win.Event('visibilitychange'));
  f.mock.emit('activated');assert.equal(ctx.appInactive,true);
  Object.defineProperty(f.doc,'hidden',{value:false,configurable:true});f.doc.dispatchEvent(new f.win.Event('visibilitychange'));assert.equal(ctx.appInactive,false);
  f.win.dispatchEvent(new f.win.Event('pagehide'));assert.equal(ctx.appInactive,true);
  f.win.dispatchEvent(new f.win.Event('pageshow'));assert.equal(ctx.appInactive,false);assert.equal(ctx.last,null);
 }finally{f.close();}
});

test('inactive launch and spawning freeze until activation',()=>{
 const f=setup();try{
  f.mock.app.isActive=false;f.mock.emit('deactivated');f.doc.querySelector('#tower-fight').click();
  const elapsed=ctx.startup.elapsed;advanceStartup(50);frame(1000);frame(5000);assert.equal(ctx.startup.elapsed,elapsed);
  f.mock.app.isActive=true;f.mock.emit('activated');frame(10000);assert.equal(ctx.startup.elapsed,elapsed);
  frame(10100);assert.ok(ctx.startup.elapsed>elapsed);
 }finally{f.close();}
});

test('a browser uses device safe areas for the arena and sheets after rotation',()=>{
 const f=setup({sdk:false});
 try{
  const computed=f.win.getComputedStyle.bind(f.win);
  const insets={top:0,right:47,bottom:21,left:47};
  f.win.getComputedStyle=element=>{
   if(element.parentElement===f.doc.body&&element.style.visibility==='hidden'&&element.style.width==='0px'){
    return {getPropertyValue:property=>insets[property.replace('padding-','')]+'px'};
   }
   return computed(element);
  };
  f.win.dispatchEvent(new f.win.Event('resize'));
  assert.equal(ctx.platform.isTelegram,false);
  assert.deepEqual(ctx.layoutViewport,{width:750,height:369,...insets});
  assert.deepEqual(contentViewport(f.win),{x:47,y:0,width:750,height:369});
  assert.ok(Math.abs(parseFloat(ctx.root.style.getPropertyValue('--telegram-layout-left'))*ctx.layoutScale-47)<.01);
  ctx.setArenaExpanded(true);
  f.win.innerWidth=390;f.win.innerHeight=844;
  Object.assign(insets,{top:47,right:0,bottom:34,left:0});
  f.orientation.dispatchEvent(new f.win.Event('change'));
  assert.deepEqual(ctx.layoutViewport,{width:390,height:763,...insets});
  assert.deepEqual(contentViewport(f.win),{x:0,y:47,width:390,height:763});
 }finally{f.close();}
});

test('safe area and stable height resize both arena layouts; keyboard keeps the game scale',()=>{
 const f=setup();try{
  assert.equal(ctx.platform.isTelegram,true);assert.equal(ctx.layoutViewport.width,809);assert.equal(ctx.layoutViewport.height,343);
  assert.ok(f.doc.documentElement.classList.contains('telegram-app'));
  const before=ctx.layoutScale;
  ctx.setArenaExpanded(true);assert.equal(ctx.arenaExpanded,true);
  f.mock.app.contentSafeAreaInset.top=52;f.mock.emit('contentSafeAreaChanged');assert.ok(ctx.layoutScale<before);
  assert.equal(ctx.layoutViewport.height,323);assert.equal(f.doc.documentElement.style.getPropertyValue('--telegram-inset-top'),'62px');
  assert.ok(Math.abs(parseFloat(ctx.root.style.getPropertyValue('--telegram-layout-top'))*ctx.layoutScale-62)<.01);
  assert.deepEqual(contentViewport(f.win),{x:15,y:62,width:809,height:323});
  f.mock.app.viewportStableHeight=350;f.mock.emit('viewportChanged');assert.equal(ctx.layoutViewport.height,283);
  // An editor reducing the WebView height must not shrink the underlying game.
  ctx.setArenaExpanded(false);
  f.initialize();
  // Open a real editable field through the setup form instead of a synthetic viewport flag.
  const field=f.doc.createElement('input');field.type='text';ctx.root.append(field);field.focus();
  const scale=ctx.layoutScale;f.win.innerHeight=150;f.mock.app.viewportStableHeight=150;f.win.dispatchEvent(new f.win.Event('resize'));f.mock.emit('viewportChanged');fitField();
  assert.equal(ctx.keyboardViewport.active,true);assert.equal(ctx.layoutScale,scale);
  field.remove();
 }finally{f.close();}
});

test('portrait stays blocked until a real landscape rotation; unsupported methods and failures are harmless',()=>{
 const f=setup();try{
  f.mock.calls.length=0;f.mock.app.isOrientationLocked=false;
  f.orientation.type='portrait-primary';f.win.innerWidth=390;f.win.innerHeight=844;f.mock.app.viewportStableHeight=844;
  f.initialize();assert.equal(ctx.orientationBlocked,true);assert.ok(!f.mock.calls.includes('lockOrientation'));
  f.orientation.type='landscape-primary';f.win.innerWidth=844;f.win.innerHeight=390;f.mock.app.viewportStableHeight=390;
  f.orientation.dispatchEvent(new f.win.Event('change'));assert.equal(ctx.orientationBlocked,false);assert.ok(f.mock.calls.includes('lockOrientation'));
  f.mock.calls.length=0;f.mock.emit('fullscreenFailed');ctx.root.dispatchEvent(new f.win.Event('pointerdown'));assert.ok(f.mock.calls.includes('requestFullscreen'));
 }finally{f.close();}
 const old=setup({version:'6.0'});try{assert.equal(ctx.platform.isTelegram,true);assert.deepEqual(old.mock.calls,['expand']);ctx.platform.ready();assert.equal(old.mock.calls.at(-1),'ready');}finally{old.close();}
 const broken=setup({sdk:false});try{
  for(const name of ['ready','expand','requestFullscreen','lockOrientation','disableVerticalSwipes'])broken.mock.app[name]=()=>{throw Error('unsupported');};
  broken.win.Telegram={WebApp:broken.mock.app};assert.doesNotThrow(()=>broken.win.dispatchEvent(new broken.win.Event('telegram-sdk-ready')));
  assert.doesNotThrow(()=>ctx.platform.ready());assert.equal(ctx.platform.isTelegram,true);
 }finally{broken.close();}
});

test('mode recreation replaces subscriptions, preserves inactive state and leaves local saves untouched',()=>{
 const f=setup();try{
  localStorage.setItem('biovshi.local-totalizator.v1',JSON.stringify(f.session));const saved=localStorage.getItem('biovshi.local-totalizator.v1');
  const count=f.mock.count();assert.ok(count>0);f.mock.app.isActive=false;f.mock.emit('deactivated');
  for(let i=0;i<4;i++){f.initialize();assert.equal(f.mock.count(),count);assert.equal(ctx.appInactive,true);}
  assert.equal(localStorage.getItem('biovshi.local-totalizator.v1'),saved);
  ctx.platform.ready();assert.ok(f.mock.calls.includes('ready'));
  ctx.root.__disposeTag();assert.equal(f.mock.count(),0);assert.equal(ctx.platform,null);
  assert.equal(f.doc.documentElement.classList.contains('telegram-app'),false);
  f.mock.emit('deactivated');assert.equal(ctx.appInactive,false);
 }finally{f.dom.window.close();}
});

test('a late SDK connects once; browser fallback retains the original layout',()=>{
 const f=setup({sdk:false});try{
  assert.equal(ctx.platform.isTelegram,false);assert.equal(ctx.layoutViewport.width,844);assert.equal(ctx.layoutViewport.height,390);
  ctx.platform.ready();f.win.Telegram={WebApp:f.mock.app};f.win.dispatchEvent(new f.win.Event('telegram-sdk-ready'));
  const count=f.mock.count();f.win.dispatchEvent(new f.win.Event('telegram-sdk-ready'));assert.equal(f.mock.count(),count);
  assert.equal(ctx.platform.isTelegram,true);assert.ok(f.mock.calls.includes('ready'));
 }finally{f.close();}
});

test('saved player and tower progress load after a fresh Mini App document',()=>{
 const first=setup();let saved,key;
 try{
  first.session.players[0].name='Тест ТГ';
  const tower=towerFor(first.session,0);tower.record=7;
  bettingSave();key=ctx.BET_STORAGE;saved=first.win.localStorage.getItem(key);assert.ok(saved);
 }finally{first.close();}
 const reopened=setup();try{
  reopened.win.localStorage.setItem(key,saved);ctx.BET_STORAGE=key;
  const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.players[0].name,'Тест ТГ');
  assert.equal(towerFor(loaded,0).record,7);
 }finally{reopened.close();}
});

test('partial SDK with no event cleanup cannot accumulate subscriptions',()=>{
 const f=setup({sdk:false});try{
  delete f.mock.app.offEvent;f.win.Telegram={WebApp:f.mock.app};f.win.dispatchEvent(new f.win.Event('telegram-sdk-ready'));
  assert.equal(ctx.platform.isTelegram,true);assert.equal(f.mock.count(),0);
  f.initialize();assert.equal(f.mock.count(),0);
 }finally{f.close();}
});

test('an ignored initial fullscreen request is retried after ready and on a gesture until acknowledged',()=>{
 const f=setup();try{
  let now=0;f.win.performance.now=()=>now;
  const count=()=>f.mock.calls.filter(call=>call==='requestFullscreen').length;
  const initial=count();assert.equal(initial,1);
  ctx.platform.ready();assert.equal(count(),initial+1);
  ctx.root.dispatchEvent(new f.win.Event('pointerdown'));assert.equal(count(),initial+2);
  ctx.root.dispatchEvent(new f.win.Event('keydown'));assert.equal(count(),initial+2,'coalesce rapid inputs');
  now=1500;ctx.root.dispatchEvent(new f.win.Event('pointerdown'));assert.equal(count(),initial+3);
  f.mock.app.isFullscreen=true;f.mock.emit('fullscreenChanged');
  now=3000;ctx.root.dispatchEvent(new f.win.Event('pointerdown'));assert.equal(count(),initial+3,'acknowledged fullscreen stops requests');
 }finally{f.close();}
});

test('native header and background receive the game color, including after theme changes',()=>{
 const f=setup({sdk:false});try{
  const colors=[];
  for(const method of ['setHeaderColor','setBackgroundColor','setBottomBarColor'])f.mock.app[method]=color=>colors.push([method,color]);
  f.win.Telegram={WebApp:f.mock.app};f.win.dispatchEvent(new f.win.Event('telegram-sdk-ready'));
  assert.deepEqual(colors,[['setHeaderColor','#02050d'],['setBackgroundColor','#02050d'],['setBottomBarColor','#02050d']]);
  f.mock.emit('themeChanged');assert.equal(colors.length,6);
 }finally{f.close();}
});

test('iOS env safe area covers a zero SDK inset, follows either landscape side and is not added twice',()=>{
 const f=setup();try{
  const nativeGet=f.win.getComputedStyle.bind(f.win),system={top:0,right:0,bottom:21,left:44};
  f.win.getComputedStyle=node=>node.style.cssText.includes('safe-area-inset-')?{getPropertyValue:name=>system[name.replace('padding-','')]+'px'}:nativeGet(node);
  f.mock.app.safeAreaInset={top:0,right:0,bottom:0,left:0};f.mock.app.contentSafeAreaInset={top:0,right:0,bottom:0,left:0};
  f.mock.emit('safeAreaChanged');assert.equal(ctx.layoutViewport.left,44);assert.equal(ctx.layoutViewport.right,0);
  assert.equal(ctx.layoutViewport.width,800);assert.equal(ctx.layoutViewport.height,369);
  f.mock.app.safeAreaInset.left=44;f.mock.emit('safeAreaChanged');assert.equal(ctx.layoutViewport.left,44,'env and SDK describe the same physical inset');
  system.left=0;system.right=44;f.mock.app.safeAreaInset.left=0;f.mock.app.safeAreaInset.right=44;
  f.orientation.type='landscape-secondary';f.orientation.dispatchEvent(new f.win.Event('change'));
  assert.equal(ctx.layoutViewport.left,0);assert.equal(ctx.layoutViewport.right,44);
  assert.equal(f.doc.documentElement.style.getPropertyValue('--telegram-inset-left'),'0px');
  assert.equal(f.doc.documentElement.style.getPropertyValue('--telegram-inset-right'),'44px');
 }finally{f.close();}
});

test('Telegram launch retains iOS safe areas even if the SDK cannot load',()=>{
 const f=setup({sdk:false});try{
  f.doc.documentElement.classList.add('telegram-launch');
  const nativeGet=f.win.getComputedStyle.bind(f.win);
  f.win.getComputedStyle=node=>node.style.cssText.includes('safe-area-inset-')?{getPropertyValue:name=>name==='padding-left'?'44px':'0px'}:nativeGet(node);
  f.win.dispatchEvent(new f.win.Event('resize'));
  assert.equal(ctx.platform.isTelegram,true);assert.equal(ctx.layoutViewport.left,44);assert.equal(ctx.layoutViewport.width,800);
 }finally{f.close();}
});

test('mobile fullscreen reserves the native control row when Telegram reports zero content insets',()=>{
 const f=setup();try{
  f.mock.app.platform='ios';f.mock.app.isFullscreen=true;f.mock.app.safeAreaInset={top:0,right:44,bottom:21,left:44};
  f.mock.app.contentSafeAreaInset={top:0,right:0,bottom:0,left:0};f.mock.emit('fullscreenChanged');
  assert.equal(ctx.layoutViewport.top,56);assert.equal(ctx.layoutViewport.height,313);
  assert.equal(f.doc.documentElement.style.getPropertyValue('--telegram-inset-top'),'56px');
  assert.deepEqual(contentViewport(f.win),{x:44,y:56,width:756,height:313});
  ctx.setArenaExpanded(true);assert.equal(ctx.layoutViewport.top,56);
  assert.ok(Math.abs(parseFloat(ctx.root.style.getPropertyValue('--telegram-layout-top'))*ctx.layoutScale-56)<.01);
  // A later native measurement takes over. The fallback does not become a second header.
  f.mock.app.contentSafeAreaInset.top=64;f.mock.emit('contentSafeAreaChanged');assert.equal(ctx.layoutViewport.top,64);
  f.mock.app.contentSafeAreaInset.top=0;f.mock.app.isFullscreen=false;f.mock.emit('fullscreenChanged');assert.equal(ctx.layoutViewport.top,0);
  f.mock.app.platform='tdesktop';f.mock.app.isFullscreen=true;f.mock.emit('fullscreenChanged');assert.equal(ctx.layoutViewport.top,0);
 }finally{f.close();}
});

test('Telegram joystick cancels native touch panning while pointer input and other scrollable content work',()=>{
 const f=setup();try{
  f.fight();const stick=f.doc.querySelector('#tower-stick'),captured=new Set();
  stick.setPointerCapture=id=>captured.add(id);stick.hasPointerCapture=id=>captured.has(id);stick.releasePointerCapture=id=>captured.delete(id);
  stick.getBoundingClientRect=()=>({left:0,top:0,width:168,height:168});
  const pointer=(type,x,y)=>{const e=new f.win.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:1});stick.dispatchEvent(e);return e;};
  assert.ok(pointer('pointerdown',145,84).defaultPrevented);assert.equal(ctx.towerInput.x,1);
  for(const type of ['touchstart','touchmove']){
   const touch=new f.win.Event(type,{bubbles:true,cancelable:true});stick.dispatchEvent(touch);assert.equal(touch.defaultPrevented,true);
  }
  assert.ok(pointer('pointermove',84,145).defaultPrevented);assert.equal(ctx.towerInput.y,1);
  const panel=f.doc.querySelector('.settings-panel'),scroll=new f.win.Event('touchmove',{bubbles:true,cancelable:true});panel.dispatchEvent(scroll);assert.equal(scroll.defaultPrevented,false);
  pointer('pointerup',84,145);assert.deepEqual(ctx.towerInput,{x:0,y:0});
  const detached=stick;ctx.root.__disposeTag();const after=new f.win.Event('touchmove',{bubbles:true,cancelable:true});detached.dispatchEvent(after);assert.equal(after.defaultPrevented,false);
 }finally{f.dom.window.close();}
});

test('page gestures are blocked in battle and menus without swallowing taps or panel scrolling',()=>{
 const f=setup({sdk:false});try{
  f.fight();
  const gesture=(type,target=ctx.stage,touches)=>{
   const event=new f.win.Event(type,{bubbles:true,cancelable:true});
   if(touches)Object.defineProperty(event,'touches',{value:touches});
   target.dispatchEvent(event);
   return event.defaultPrevented;
  };
  const finger=(clientY,identifier=1)=>({clientX:25,clientY,identifier});
  assert.equal(gesture('gesturestart'),true);
  assert.equal(gesture('gesturechange'),true);
  assert.equal(gesture('pointerdown'),false);
  assert.equal(gesture('touchstart',ctx.stage,[finger(10)]),false);
  assert.equal(gesture('touchmove',ctx.stage,[finger(25)]),true);
  assert.equal(gesture('touchmove',ctx.stage,[finger(25),finger(45,2)]),true);
  ctx.startup.phase='menu';
  const panel=f.doc.querySelector('.settings-panel');
  panel.style.overflowY='auto';
  panel.scrollTop=12;
  assert.equal(gesture('gesturestart',panel),true);
  assert.equal(gesture('touchstart',panel,[finger(10)]),false);
  assert.equal(gesture('touchmove',panel,[finger(22)]),false);
  panel.scrollTop=0;
  assert.equal(gesture('touchmove',panel,[finger(15)]),false);
  assert.equal(gesture('touchmove',panel,[finger(25)]),true);
  const stage=ctx.stage;
  ctx.root.__disposeTag();
  assert.equal(gesture('gesturechange',stage),false);
 }finally{f.dom.window.close();}
});

test('Telegram native swipes stay disabled after fullscreen and reactivation',()=>{
 const f=setup();try{
  const count=()=>f.mock.calls.filter(call=>call==='disableVerticalSwipes').length;
  const before=count();f.mock.emit('fullscreenChanged');assert.ok(count()>before);
  const full=count();f.mock.emit('activated');assert.ok(count()>full);
 }finally{f.close();}
});

for(const marker of ['telegram-app','telegram-launch'])test(`full stylesheet cascade applies physical safe-area padding to the ${marker} page`,()=>{
 const f=setup();try{
  // Load every real stylesheet in index order. API/geometry mocks alone cannot
  // detect base.css overriding Telegram padding with a more specific selector.
  for(const link of f.doc.querySelectorAll('link[rel="stylesheet"]')){
   const style=f.doc.createElement('style');style.textContent=fs.readFileSync(new URL('../'+link.getAttribute('href'),import.meta.url),'utf8');link.replaceWith(style);
  }
  f.mock.app.platform='ios';f.mock.app.isFullscreen=true;
  f.mock.app.safeAreaInset={top:0,left:44,right:44,bottom:21};
  f.mock.app.contentSafeAreaInset={top:0,left:0,right:0,bottom:0};f.mock.emit('fullscreenChanged');
  f.doc.documentElement.classList.remove('telegram-app','telegram-launch');f.doc.documentElement.classList.add(marker);
  const padding=()=>{
   const computed=f.win.getComputedStyle(f.doc.body);
   return Object.fromEntries(['top','right','bottom','left'].map(side=>[side,parseFloat(computed.getPropertyValue('padding-'+side))]));
  };
  assert.deepEqual(padding(),{top:56,right:44,bottom:21,left:44});
  for(const side of ['top','right','bottom','left'])assert.equal(padding()[side],ctx.layoutViewport[side],'page offset and available geometry must use the same physical inset');
  const style=selector=>f.win.getComputedStyle(f.doc.querySelector(selector));
  assert.equal(ctx.root.classList.contains('fit-sheets'),true);
  for(const [side,value] of Object.entries(padding()))
   assert.equal(ctx.root.style.getPropertyValue('--sheet-offset-'+side),value+'px');
  assert.equal(style('#tower-preparation .bet-panel').maxHeight,'100%');
  assert.equal(style('.tower-reroll-line').flexWrap,'wrap');
  assert.equal(style('.tower-upgrade-paper').maxHeight,'100%');
  assert.equal(style('.tower-upgrade-paper').display,'grid');
  assert.match(style('.tower-upgrade-paper').gridTemplateAreas,/"patient inventory"/);
  assert.equal(style('.tower-upgrade-patient-panel').overflow,'auto');
  assert.equal(style('.tower-upgrade-content').overflow,'auto','the inventory scrolls within its own column');
  f.doc.querySelector('[data-upgrade-tab="artifacts"]').click();
  assert.equal(style('.tower-upgrade-content').overflow,'auto');
  const patient=f.doc.querySelector('.tower-upgrade-table');
  assert.equal(patient.parentElement.className,'tower-upgrade-patient-panel');
  assert.equal(patient.nextElementSibling.id,'tower-upgrade-stats');
  // Expanded arena has its own positioning; the page padding must not displace it again.
  ctx.setArenaExpanded(true);assert.deepEqual(padding(),{top:56,right:44,bottom:21,left:44});
  const rootStyle=f.win.getComputedStyle(ctx.root);
  assert.ok(Math.abs(parseFloat(rootStyle.top)*ctx.layoutScale-56)<.01);
  f.doc.documentElement.classList.remove('telegram-app','telegram-launch');
  assert.deepEqual(padding(),{top:12,right:12,bottom:12,left:12});
 }finally{f.close();}
});


test('cached SDK fullscreen never suppresses a new native request and ALREADY_FULLSCREEN acknowledges it',()=>{
 const f=setup({sdk:false});try{
  f.mock.app.isFullscreen=true;f.win.Telegram={WebApp:f.mock.app};f.win.dispatchEvent(new f.win.Event('telegram-sdk-ready'));
  const count=()=>f.mock.calls.filter(call=>call==='requestFullscreen').length;
  assert.equal(count(),1,'cached true must still send a request');assert.equal(ctx.platform.diagnostics().fullscreen.confirmed,null);
  ctx.platform.ready();assert.equal(count(),2);
  f.mock.emit('fullscreenFailed',{error:'ALREADY_FULLSCREEN'});assert.equal(ctx.platform.diagnostics().fullscreen.confirmed,true);
  ctx.root.dispatchEvent(new f.win.Event('pointerdown'));assert.equal(count(),2,'native acknowledgement stops retries');
  ctx.platform.enterFullscreen();assert.equal(count(),3,'manual action can re-request even when the cached flag remains true');
 }finally{f.close();}
});

test('ready retries an unacknowledged fullscreen transition without requiring another tap',()=>{
 const f=setup();try{
  let retry;f.win.setTimeout=fn=>{retry=fn;return 1;};f.win.clearTimeout=()=>{};
  const count=()=>f.mock.calls.filter(call=>call==='requestFullscreen').length;
  ctx.platform.ready();const sent=count();assert.equal(typeof retry,'function');retry();assert.equal(count(),sent+1);
  f.mock.app.isFullscreen=true;f.mock.emit('fullscreenChanged');retry();assert.equal(count(),sent+1);
 }finally{f.close();}
});

test('Telegram removes the general page gutter while browser geometry retains it',()=>{
 for(const sdk of [true,false]){
  const f=setup({sdk});try{
   const physicalWidth=parseFloat(ctx.root.style.width)*ctx.layoutScale;
   assert.ok(Math.abs(physicalWidth-(ctx.layoutViewport.width-(sdk?0:24)))<.01);
  }finally{f.close();}
 }
});

test('Telegram settings expose native fullscreen and safe-area diagnostics without authentication data',async()=>{
 const f=setup();try{
  const details=f.doc.querySelector('.telegram-diagnostics');assert.equal(details.hidden,false);details.open=true;details.ontoggle();
  const data=JSON.parse(details.querySelector('pre').textContent);assert.equal(data.platform,'android');assert.equal(data.api,'8.0');assert.deepEqual(data.safe,f.mock.app.safeAreaInset);assert.ok(!('initData' in data));
  let copied;Object.defineProperty(f.win.navigator,'clipboard',{value:{writeText:async text=>{copied=text;}}});
  details.querySelector('[data-telegram-copy]').click();await Promise.resolve();assert.equal(JSON.parse(copied).platform,'android');
  const before=f.mock.calls.filter(call=>call==='requestFullscreen').length;details.querySelector('[data-telegram-fullscreen]').click();assert.equal(f.mock.calls.filter(call=>call==='requestFullscreen').length,before+1);
 }finally{f.close();}
 const browser=setup({sdk:false});try{
  assert.equal(browser.doc.querySelector('.telegram-diagnostics').hidden,true);
  browser.doc.querySelector('#arena-credits-open').click();browser.doc.querySelector('#arena-credits-back').click();assert.equal(browser.doc.querySelector('.telegram-diagnostics').hidden,true);
 }finally{browser.close();}
});

test('acknowledged fullscreen uses the real WebView height instead of stale sheet metrics',()=>{
 const f=setup();try{
  f.mock.app.viewportHeight=280;f.mock.app.viewportStableHeight=280;f.mock.emit('viewportChanged');assert.equal(ctx.layoutViewport.height,233);
  f.mock.app.isFullscreen=true;f.mock.emit('fullscreenChanged');
  assert.equal(ctx.layoutViewport.height,343);assert.equal(contentViewport(f.win).height,343);
 }finally{f.close();}
});
