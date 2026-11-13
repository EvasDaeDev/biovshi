import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {installTowerUI} from '../src/tower/ui.js';
import {newTower} from '../src/tower/model.js';
import {betNewSession} from '../src/betting/ledger.js';
import {advanceStartup} from '../src/game/session.js';
import {createRobot} from '../src/robot/robot.js';
import {controlledIntent,arenaPoint} from '../src/tower/input.js';
import {loadControlMode,setControlMode} from '../src/tower/control-mode.js';
import {viewportLayout,fitInterface} from '../src/ui/viewport.js';
import {fittedCamera} from '../src/render/camera.js';
import {loadAudioSettings} from '../src/audio/audio.js';

function setup(arenaId='ring',mode='tower'){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://direction.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 initializeGame({session:betNewSession(['Игрок'],100),entry:mode==='tower'?'tower':'betting',tower:mode==='tower'?newTower(0):null,arenaId});
 installTowerUI();
 if(mode==='tower'){
  document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
  ctx.robots=[];const robot=createRobot(0,{x:arenaId==='annulus'?170:300,y:350,angle:0}),foe=createRobot(1,{x:450,y:450,angle:0});
  ctx.robots=[robot,foe];robot.setVisible(true);foe.setVisible(false);
  setControlMode('direction');ctx.fieldWidth=ctx.fieldHeight=700;ctx.svg.setAttribute('viewBox','0 0 700 700');
  ctx.svg.getBoundingClientRect=()=>({left:100,top:50,width:350,height:350});
 }
 return {dom,robot:ctx.robots[0],close(){ctx.root.__disposeTag();dom.window.close();}};
}
function click(dom,x,y){ctx.svg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,clientX:100+x*.5,clientY:50+y*.5,button:0}));}
function tick(robot,frames){for(let i=0;i<frames;i++){ctx.game.time+=1/60;robot.tick(1/60,controlledIntent(robot));}}

test('landscape layout scales uniformly only below its usable size on phones and tablets',()=>{
 for(const [width,height] of [[1366,768],[1024,768],[1180,820],[844,390],[667,375],[568,320]]){
  const result=viewportLayout(width,height);
  assert.ok(result.scale>0&&result.scale<=1);
  assert.ok(result.width>=1000-1e-8);
  assert.ok(result.height-24/result.scale>=620-1e-8);
  assert.ok(Math.abs(result.width*result.scale-(width-24))<1e-8);
  if(width>=1024&&height>=768)assert.equal(result.scale,1);
 }
});
test('camera unprojection accounts for zoom, letterboxing and scaled DOM bounds',()=>{
 const f=setup();
 ctx.fieldWidth=900;ctx.fieldHeight=450;ctx.svg.setAttribute('viewBox','100 200 300 300');
 ctx.svg.getBoundingClientRect=()=>({left:30,top:70,width:450,height:225});
 const camera=fittedCamera(900,450,100,200,300),world={x:235,y:347};
 const p=arenaPoint({clientX:30+(world.x*camera.scale+camera.x)*.5,clientY:70+(world.y*camera.scale+camera.y)*.5},ctx.svg);
 assert.deepEqual(p,world);f.close();
});
test('one marker is replaced or cancelled without clearing the combat focus or pending attack',()=>{
 const f=setup(),robot=f.robot;
 ctx.combat.focus[0]=1;const strike={victim:1,source:'arm-1-lower'};ctx.combat.pending[0]=strike;
 click(f.dom,400,350);assert.equal(ctx.towerDestination.x,400);assert.equal(document.querySelector('#tower-direction-marker').hidden,false);
 click(f.dom,400,420);assert.equal(ctx.towerDestination.y,420);assert.equal(document.querySelectorAll('#tower-direction-marker').length,1);
 click(f.dom,400,420);assert.equal(ctx.towerDestination,null);assert.equal(controlledIntent(robot).speed,0);
 assert.equal(ctx.combat.focus[0],1);assert.equal(ctx.combat.pending[0],strike);assert.equal(document.querySelector('#tower-direction-marker').hidden,true);f.close();
});
test('patient reaches the marker, hides it and keeps the position without an input command',()=>{
 const f=setup(),robot=f.robot;click(f.dom,420,350);
 tick(robot,900);const destination=ctx.towerDestination;
 assert.ok(destination.arrived);assert.ok(Math.hypot(robot.x-420,robot.y-350)<=8);
 ctx.paintTowerMarker();assert.equal(document.querySelector('#tower-direction-marker').hidden,true);
 const start={x:robot.x,y:robot.y};tick(robot,120);assert.ok(Math.hypot(robot.x-start.x,robot.y-start.y)<.1);
 assert.equal(ctx.combat.focus[0],-1);f.close();
});
test('direction uses navigation around the central obstacle and rejects obstacle and out-of-arena taps',()=>{
 const f=setup('annulus'),robot=f.robot;
 click(f.dom,350,350);assert.equal(ctx.towerDestination,null);
 click(f.dom,10,10);assert.equal(ctx.towerDestination,null);
 click(f.dom,530,350);assert.ok(ctx.towerDestination);
 let largestDeviation=0;
 for(let i=0;i<2400&&!ctx.towerDestination.arrived;i++){tick(robot,1);largestDeviation=Math.max(largestDeviation,Math.abs(robot.y-350));}
 assert.ok(largestDeviation>100,'route goes around the central obstacle');
 assert.ok(ctx.towerDestination.arrived,`patient reaches destination: ${robot.x},${robot.y}`);f.close();
});
test('pauses and disabled input cannot place markers; settings persist and spectator switch is disabled',()=>{
 const f=setup();
 ctx.paused=true;click(f.dom,420,350);assert.equal(ctx.towerDestination,null);ctx.paused=false;
 click(f.dom,420,350);assert.ok(ctx.towerDestination);
 document.querySelector('#arena-settings-button').click();assert.ok(ctx.towerDestination,'opening settings preserves navigation');
 assert.equal(document.querySelector('#tower-control-mode').disabled,false);
 const selector=document.querySelector('#tower-control-mode');selector.value='control';selector.dispatchEvent(new Event('change'));
 assert.equal(ctx.towerDestination,null);assert.equal(document.querySelector('#tower-stick').hidden,false);assert.equal(loadControlMode(), 'control');
 setControlMode('direction');assert.equal(loadControlMode(),'direction');assert.equal(document.querySelector('#tower-stick').hidden,true);
 f.close();const spectator=setup('ring','betting');assert.equal(document.querySelector('#tower-control-mode').disabled,true);spectator.close();
});
test('portrait guard blocks launch, settings and native input dialogs without rotating the browser',async()=>{
 const f=setup(),win=f.dom.window;ctx.touchDevice=true;
 const dialog=document.createElement('dialog');dialog.innerHTML='<input><button>OK</button>';ctx.root.append(dialog);
 dialog.setAttribute('open','');dialog.showModal=()=>{dialog.open=true;};
 let clicks=0;dialog.querySelector('button').onclick=()=>clicks++;
 Object.defineProperty(win,'innerWidth',{value:390,configurable:true});Object.defineProperty(win,'innerHeight',{value:844,configurable:true});
 win.dispatchEvent(new Event('resize'));
 const guard=document.querySelector('#landscape-required');assert.equal(ctx.orientationBlocked,true);assert.equal(guard.open,true);
 document.querySelector('#arena-settings-button').click();dialog.querySelector('button').click();assert.equal(ctx.settingsOpen,false);assert.equal(clicks,0);
 const cancel=new Event('cancel',{cancelable:true});guard.dispatchEvent(cancel);assert.equal(cancel.defaultPrevented,true);
 // Screen can remain portrait after a split-view/window resize. Viewport wins.
 Object.defineProperty(win.screen,'orientation',{value:{type:'portrait-primary'},configurable:true});
 Object.defineProperty(win,'innerWidth',{value:844,configurable:true});Object.defineProperty(win,'innerHeight',{value:390,configurable:true});win.dispatchEvent(new Event('resize'));
 assert.equal(ctx.orientationBlocked,false);assert.equal(guard.hidden,true);assert.equal(dialog.open,true,'underlying form remains open');dialog.querySelector('button').click();assert.equal(clicks,1);f.close();
});
test('new audio preferences start at half volume and existing preferences survive',()=>{
 const store={getItem:()=>null};assert.deepEqual(loadAudioSettings(store),{sounds:50,music:50});
 assert.deepEqual(loadAudioSettings({getItem:()=>JSON.stringify({sounds:17,music:0})}),{sounds:17,music:0});
});

test('direction still moves during an ordinary leg strike and changing mode cancels only navigation',()=>{
 const f=setup(),robot=f.robot,start={x:robot.x,y:robot.y};
 const strike={source:'leg-1-lower',victim:1,aim:{x:350,y:370},started:ctx.game.time,impactAt:ctx.game.time+.52,endsAt:ctx.game.time+.78,resolved:false};
 ctx.combat.pending[0]=strike;ctx.combat.focus[0]=1;click(f.dom,420,350);tick(robot,35);
 assert.ok(Math.hypot(robot.x-start.x,robot.y-start.y)>1);
 assert.equal(ctx.combat.pending[0],strike);setControlMode('control');
 assert.equal(ctx.towerDestination,null);assert.equal(ctx.combat.pending[0],strike);assert.equal(ctx.combat.focus[0],1);f.close();
});
test('portrait keyboard guard keeps the underlying settings sheet open and restores it on rotation',()=>{
 const f=setup(),win=f.dom.window;
 document.querySelector('#arena-settings-button').click();assert.equal(ctx.settingsOpen,true);
 ctx.touchDevice=true;Object.defineProperty(win,'innerWidth',{value:390,configurable:true});Object.defineProperty(win,'innerHeight',{value:844,configurable:true});win.dispatchEvent(new Event('resize'));
 const button=document.querySelector('#landscape-required button');
 button.dispatchEvent(new win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(ctx.settingsOpen,true);assert.equal(ctx.orientationBlocked,true);
 Object.defineProperty(win,'innerWidth',{value:844,configurable:true});Object.defineProperty(win,'innerHeight',{value:390,configurable:true});win.dispatchEvent(new Event('resize'));
 assert.equal(ctx.settingsOpen,true);assert.equal(ctx.paused,true);f.close();
});

test('joystick keeps its owning finger while a second finger uses other controls or touches the stick',()=>{
 const f=setup();setControlMode('control');
 const stick=document.querySelector('#tower-stick'),captured=new Set();
 stick.setPointerCapture=id=>captured.add(id);stick.hasPointerCapture=id=>captured.has(id);stick.releasePointerCapture=id=>captured.delete(id);
 stick.getBoundingClientRect=()=>({left:0,top:0,width:168,height:168});
 const pointer=(type,id,x,y)=>{
  const event=new f.dom.window.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});
  Object.defineProperty(event,'pointerId',{value:id});stick.dispatchEvent(event);
 };
 pointer('pointerdown',11,145,84);assert.equal(ctx.towerInput.x,1);assert.ok(captured.has(11));
 let secondControlClicks=0;const secondControl=document.createElement('button');ctx.root.append(secondControl);secondControl.onclick=()=>secondControlClicks++;
 secondControl.click();assert.equal(secondControlClicks,1);assert.equal(ctx.towerInput.x,1);
 pointer('pointerdown',22,10,84);pointer('pointermove',22,84,10);assert.equal(ctx.towerInput.x,1);assert.equal(captured.has(22),false);
 for(const type of ['pointerup','pointercancel','lostpointercapture']){pointer(type,22,84,10);assert.equal(ctx.towerInput.x,1);}
 pointer('pointermove',11,84,145);assert.equal(ctx.towerInput.y,1);
 pointer('pointerup',11,84,145);assert.deepEqual(ctx.towerInput,{x:0,y:0});assert.equal(captured.size,0);
 pointer('pointerdown',22,145,84);assert.equal(ctx.towerInput.x,1);
 f.dom.window.dispatchEvent(new Event('blur'));assert.deepEqual(ctx.towerInput,{x:0,y:0});assert.equal(captured.size,0);f.close();
});

test('wide touch screens use the mobile toolbar while a desktop at the same size keeps its layout',()=>{
 const f=setup(),win=f.dom.window;
 Object.defineProperty(win,'innerWidth',{value:1366,configurable:true});Object.defineProperty(win,'innerHeight',{value:1024,configurable:true});
 ctx.touchDevice=true;fitInterface();assert.equal(ctx.root.classList.contains('mobile-layout'),true);assert.equal(ctx.layoutScale,1);
 ctx.touchDevice=false;fitInterface();assert.equal(ctx.root.classList.contains('mobile-layout'),false);assert.equal(ctx.layoutScale,1);f.close();
});
