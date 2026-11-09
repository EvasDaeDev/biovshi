import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {betNewSession,betResolve} from '../src/betting/ledger.js';
import {buyHat,setPatientStats,resolvePatron} from '../src/garage/model.js';
import {garageOpen} from '../src/garage/ui.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
import {startSpawnSequence,advanceStartup,resetRound} from '../src/game/session.js';
import {arenaClearance,chooseSpawnLayout} from '../src/game/arena.js';
import {cameraUpdate,cameraApply,fittedCamera} from '../src/render/camera.js';
import {note} from '../src/game/events.js';
import {showResults} from '../src/ui/results.js';
import {ROBOT_COLORS} from '../src/utils/colors.js';
function setup(options={}){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://procedure.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;initializeGame({entry:'setup',...options});return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
test('patron keeps cumulative investment through losses, retains ties and alone controls tuning',()=>{
 const s=betNewSession(['A','B'],1000);
 setPatientStats(s,0,1,[4,3,2]);buyHat(s,0,0,1,10);assert.equal(resolvePatron(s.garage[0]),0);
 assert.throws(()=>setPatientStats(s,0,1,[2,4,3]),/покровитель/);
 s.garage[0].head=null;buyHat(s,0,1,2,10);assert.equal(resolvePatron(s.garage[0]),0,'tie retains the existing patron');
 s.garage[0].head=null;buyHat(s,0,1,3,10);assert.equal(resolvePatron(s.garage[0]),1);
 setPatientStats(s,0,1,[2,4,3]);assert.deepEqual(s.garage[0].stats,[2,4,3]);
 s.garage[0].head=null;assert.deepEqual(s.garage[0].investments,{0:10,1:20});
});
test('procedure locks controls by editor and patron popup lists every player and contribution',()=>{
 const s=betNewSession(['Первый','Второй'],100);buyHat(s,0,1,1,10);const dom=setup({session:s});ctx.procedureEditor=0;garageOpen();
 let section=document.querySelector('[data-patient="0"]');assert.equal(section.querySelector('[data-stat]').disabled,true);section.querySelector('.patron-name').click();assert.equal(section.querySelector('.patron-popup').hidden,false);assert.match(section.querySelector('.patron-popup').textContent,/Первый: 0.*Второй: 10/);
 const editor=document.querySelector('#procedure-editor');editor.value='1';editor.dispatchEvent(new Event('change'));section=document.querySelector('[data-patient="0"]');assert.equal(section.querySelector('[data-stat]').disabled,false);
 const select=section.querySelector('[data-stat="1"]');select.value='4';select.dispatchEvent(new Event('change'));assert.equal(s.garage[0].stats[1],4);bettingSave();const loaded=bettingLoad();assert.equal(loaded.garage[0].patron,1);assert.equal(loaded.garage[0].investments[1],10);close(dom);
});
test('first boot queues an exhibition, and post-exhibition next round opens account setup then stakes directly',async()=>{
 const dom=setup({entry:'auto'});assert.equal(ctx.startup.phase,'demo');assert.equal(ctx.betOverlay.hidden,true);assert.equal(ctx.betting,null);
 startSpawnSequence();advanceStartup(3);assert.equal(ctx.startup.phase,'running');ctx.combat.finished=true;ctx.combat.winner=0;ctx.combat.finishedAt=0;showResults();
 assert.equal(document.querySelector('.gladiator-results-kicker'),null);assert.equal(document.querySelector('.bet-kicker'),null);assert.match(ctx.resultsTitle.textContent,/Пациент A/);
 await resetRound('betting');assert.ok(document.querySelector('#bet-setup-form'));document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));assert.equal(ctx.startup.phase,'betting');assert.equal(document.querySelector('#garage-next'),null);close(dom);
});
test('ring is a regular 4m octagon with safe spawn points and no internal obstacles',()=>{
 const dom=setup({session:betNewSession(['A'],100),arenaId:'ring'});assert.equal(ctx.obstacles.length,0);assert.equal(ctx.arenaBoundary.right-ctx.arenaBoundary.left,400);assert.equal(ctx.arenaBoundary.points.length,8);
 const p=ctx.arenaBoundary.points,edges=p.map((a,i)=>Math.hypot(a.x-p[(i+1)%8].x,a.y-p[(i+1)%8].y));assert.ok(Math.max(...edges)-Math.min(...edges)<1e-8);assert.ok(chooseSpawnLayout().every(p=>arenaClearance(p)>=60));assert.equal(ctx.CAMERA_FULL,476);close(dom);
});
test('arena selection preserves drafts while rebuilding the ring before committing stakes',async()=>{
 const s=betNewSession(['A','B'],100),dom=setup({session:s});const fields=[...document.querySelectorAll('[data-bet-player] input')];fields[0].value='10';fields[1].value='20';
 ctx.switchArena=async id=>{s.arenaId=id;initializeGame({session:s,arenaId:id,entry:'betting'});};document.querySelector('[data-arena="ring"]').click();const button=document.querySelector('#bet-fight');await button.onclick({preventDefault(){},currentTarget:button});
 assert.equal(ctx.arenaId,'ring');assert.equal(ctx.startup.phase,'spawning');assert.deepEqual(s.players.map(p=>p.balance),[90,80]);assert.deepEqual(s.bets.map(b=>b.amount),[10,20]);ctx.switchArena=null;close(dom);
});
test('camera uses viewport-axis margins, follows outside walls and never exceeds x1',()=>{
 const dom=setup();ctx.startup.phase='running';ctx.combat.finished=false;ctx.fieldWidth=1200;ctx.fieldHeight=600;ctx.robots=[{x:50,y:50,visible:true,mobile:true,capsules:[]}];
 for(let i=0;i<600;i++)cameraUpdate(1/60);assert.ok(ctx.camera.x<0);assert.ok(ctx.camera.y<0);const projection=fittedCamera(1200,600,ctx.camera.x,ctx.camera.y,ctx.camera.size);const horizontal=1200/projection.scale,vertical=600/projection.scale;assert.ok(horizontal>=400-.1);assert.ok(vertical>=200-.1);assert.ok(ctx.camera.size<=ctx.CAMERA_FULL);
 ctx.robots=[{x:-1000,y:0,visible:true,mobile:true},{x:2000,y:900,visible:true,mobile:true}];for(let i=0;i<600;i++)cameraUpdate(1/60);assert.equal(ctx.camera.size,ctx.CAMERA_FULL);close(dom);
});
test('combat log keeps ten colourful, short messages and records critical hits and destruction',()=>{
 const dom=setup();for(let i=0;i<15;i++)note('hit',{robot:1,by:0,segment:'head',damage:i===14?2:1});assert.equal(ctx.combatLog.children.length,10);assert.match(ctx.combatLog.lastElementChild.textContent,/мощный удар.*голову/);
 note('robot-immobilized',{robot:1,by:0,reason:'погиб',segment:'head'});assert.match(ctx.combatLog.lastElementChild.textContent,/погиб.*голова уничтожена/);assert.equal(ctx.combatLog.lastElementChild.querySelector('.patient-name').style.color,'rgb(255, 179, 107)');note('combat-end',{winner:0});assert.match(ctx.combatLog.lastElementChild.textContent,/Пациент A победил/);close(dom);
});

test('a full ring battle remains finite inside its own boundary',async()=>{
 const dom=setup({session:betNewSession(['A'],100),arenaId:'ring'});startSpawnSequence();advanceStartup(3);const {step}=await import('../src/game/loop.js');
 for(let i=0;i<900&&!ctx.combat.finished;i++)step(1/60);
 assert.ok(ctx.robots.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.y)&&arenaClearance(r.center)>=-1e-4));assert.ok(ctx.combat.hits>0,'ring fighters must actually hit each other');close(dom);
});
test('legacy current hats migrate into patronage without inventing unknown past purchases',()=>{
 const s=betNewSession(['A','B'],100);s.players[1].balance-=10;s.shopSpent=10;s.garage[0].head={hat:1,price:10,player:1};delete s.garage[0].investments;delete s.garage[0].patron;
 const dom=setup({session:s});bettingSave();const saved=bettingLoad();assert.equal(saved.garage[0].patron,1);assert.deepEqual(saved.garage[0].investments,{1:10});close(dom);
});
test('returning from the ring restores the ward floor without sharing the two arenas histories',async()=>{
 const dom=setup({session:betNewSession(['A'],100)}),s=ctx.betting,OriginalImage=globalThis.Image;
 globalThis.Image=class{naturalWidth=1024;naturalHeight=1024;set src(value){queueMicrotask(()=>this.onload?.());}async decode(){}};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>({drawImage(){},getImageData(){return {data:new Uint8ClampedArray([10,20,30,255])};},putImageData(){}});
 dom.window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,FLOOR';
 const {initializeFloor,bakeRoundFloor}=await import('../src/render/floor-history.js');
 try{
  await initializeFloor();ctx.arenaRenderer={rasterizeRemains:()=>document.createElement('canvas'),replaceFloor(){},render(){}};ctx.combat.winner=0;await bakeRoundFloor();const ward=ctx.floorCanvas;
  ctx.arenaRenderer=null;s.arenaId='ring';initializeGame({session:s,arenaId:'ring'});await initializeFloor();const ring=ctx.floorCanvas;assert.notEqual(ward,ring);
  s.arenaId='ward';initializeGame({session:s,arenaId:'ward'});await initializeFloor();assert.equal(ctx.floorCanvas,ward);assert.equal(ctx.arenaFloors.get(s.floorId+':ring'),ring);
 }finally{ctx.arenaRenderer=null;globalThis.Image=OriginalImage;close(dom);}
});

test('opening with a saved session starts a free fight without changing balances or jackpot',()=>{
 const s=betNewSession(['A','B'],100);s.jackpot=20;s.players[0].balance=80;const dom=setup({session:s,entry:'auto'});assert.equal(ctx.startup.phase,'demo');assert.equal(ctx.betOverlay.hidden,true);assert.equal(s.phase,'running');assert.deepEqual(s.bets,[]);assert.deepEqual(s.players.map(p=>p.balance),[80,100]);
 betResolve(s,0);assert.equal(s.jackpot,20);assert.deepEqual(s.players.map(p=>p.balance),[80,100]);close(dom);
});

test('switching arenas rebuilds masks and scene definitions from pristine markup',()=>{
 const s=betNewSession(['A'],100),dom=setup({session:s});
 ctx.darkness.setAttribute('fill','#fff');ctx.darkness.setAttribute('transform','translate(300 0) scale(10)');
 const stale=document.createElementNS(ctx.NS,'rect');stale.id='stale-ring-layer';stale.setAttribute('fill','white');ctx.arenaContent.append(stale);
 const oldDefs=ctx.defs;ctx.defs.append(ctx.lightHoles.cloneNode(true));
 for(const arenaId of ['ring','ward','ring']){
  initializeGame({session:s,arenaId,entry:'betting'});
  assert.equal(ctx.darkness.getAttribute('fill'),'var(--night-bg)');assert.equal(ctx.darkness.hasAttribute('transform'),false);assert.equal(ctx.svg.querySelector('#stale-ring-layer'),null);assert.notEqual(ctx.defs,oldDefs);
  const ids=[...ctx.svg.querySelectorAll('[id]')].map(n=>n.id);assert.equal(new Set(ids).size,ids.length,'duplicate SVG IDs must not leak across arenas');
  assert.equal(ctx.fieldClip.firstElementChild.getAttribute('points'),ctx.arenaBoundary.points.map(p=>p.x+','+p.y).join(' '));
 }
 close(dom);
});
test('combat log uses a 35-character column at the stage corner and fades only a full oldest edge',()=>{
 const dom=setup(),style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../styles/interface.css',import.meta.url),'utf8');document.head.append(style);
 const computed=dom.window.getComputedStyle(ctx.combatLog);assert.ok(Number.parseFloat(computed.width)>0);const rule=[...style.sheet.cssRules].find(r=>r.selectorText==='#robot-tag-hops-v22 #combat-log');assert.equal(rule.style.width,'35ch');assert.equal(computed.right,'0px');assert.equal(computed.top,'0px');
 for(let i=0;i<10;i++)note('hit',{robot:1,by:0,segment:'head',damage:1});assert.equal(ctx.combatLog.dataset.full,'true');assert.equal(ctx.combatLog.children.length,10);
 const fade=dom.window.getComputedStyle(ctx.combatLog).getPropertyValue('mask-image');assert.match(fade,/28px/);
 ctx.resultsAgain.click();assert.equal(ctx.combatLog.children.length,0);assert.equal(ctx.combatLog.dataset.full,'false');close(dom);
});
