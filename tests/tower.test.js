import {compareStrikeCandidates} from '../src/systems/combat.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import {createRobot} from '../src/robot/robot.js';
import {combatAttacks} from '../src/systems/combat.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {newTower,towerFor,rewardTower,completeTower,resetTower,validTower,floorEnemyCount,towerEnemyCount,normalizeTower} from '../src/tower/model.js';
import {betNewSession,betCommit,betResolve,betTopUp,betAddPlayer} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {installTowerUI,openMenu,settleTower} from '../src/tower/ui.js';
import {controlledIntent} from '../src/tower/input.js';
import {advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {note} from '../src/game/events.js';
import {patientGarage,patientSkin} from '../src/game/patients.js';
import {patientName} from '../src/ui/patient.js';
import {showResults} from '../src/ui/results.js';
function setup(s,tower,arenaId='ward'){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://tower.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 initializeGame({session:s,entry:'tower',tower:structuredClone(tower),arenaId});
 // Pixi copies the SVG handler before installTowerUI; exercise that exact order.
 const canvas=document.createElement('canvas');canvas.id='copied-arena';canvas.onclick=ctx.svg.onclick;ctx.svg.after(canvas);
 installTowerUI();return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();ctx.mode='spectator';}
test('rewards survive restart and defeat, are once per enemy per floor and isolated per player',()=>{
 const s=betNewSession(['Первый','Второй'],100);
 assert.equal(rewardTower(s,0,1,1),false);assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,1,0),false);
 const copy=JSON.parse(JSON.stringify(s));assert.equal(rewardTower(copy,0,1,0),false);
 completeTower(s,0,true);assert.equal(towerFor(s,0).level,2);assert.deepEqual(towerFor(s,0).stats,[3,4,3]);assert.ok(validTower(towerFor(s,0)));
 assert.equal(rewardTower(s,0,1,0),false,'no payouts during preparation');towerFor(s,0).preparing=false;
 assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,2,0),true);
 completeTower(s,0,false);assert.deepEqual(towerFor(s,0),newTower(towerFor(s,0).patient,1));assert.equal(s.players[0].balance,130);
 assert.deepEqual(towerFor(s,1),newTower(towerFor(s,1).patient));assert.equal(s.players[1].balance,100);
 resetTower(s,0);assert.equal(s.players[0].balance,130);
});
test('tower rewards remain valid in shared betting storage after spending, settlement, joining and topups',()=>{
 const s=betNewSession(['Первый','Второй'],100);const dom=setup(s,towerFor(s,0));
 rewardTower(s,0,1,0);betTopUp(s,0,20);betAddPlayer(s,'Третий');
 betCommit(s,[{player:0,robot:0,amount:50},{player:1,robot:1,amount:20},{player:2,robot:2,amount:0}]);betResolve(s,0);
 bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.towerEarned,10);assert.deepEqual(loaded.towers,s.towers);assert.deepEqual(loaded.players,s.players);
 close(dom);
});
test('all arenas spawn variable counts; tower stats and cosmetics never touch regular patients',()=>{
 const s=betNewSession(['<Игрок>'],100);const t=towerFor(s,0);for(let i=0;i<7;i++)completeTower(s,0,true);t.patient=3;
 const original=structuredClone(s.garage);
 for(const arena of ['ward','ring','annulus']){
   const dom=setup(s,t,arena);assert.equal(ctx.robots.length,6);assert.equal(ctx.cardNodes.length,6);assert.equal(patientSkin(0),3);assert.equal(patientSkin(8),0);
   assert.deepEqual(patientGarage()[1].stats,[3,3,3]);assert.deepEqual(s.garage,original);assert.match(patientName(0),/&lt;Игрок&gt;/);assert.match(patientName(8),/ИИ 8/);
   for(const r of ctx.robots)assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));close(dom);
 }
});
test('manual patient stays still with no input and responds to keyboard with automatic attacks enabled',()=>{
 const s=betNewSession(['Первый'],100);const dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 const r=ctx.robots[0];ctx.robots[1].setVisible(false);const start={x:r.x,y:r.y};
 assert.equal(controlledIntent(r).speed,0);for(let i=0;i<90;i++)step(1/60);assert.ok(Math.hypot(r.x-start.x,r.y-start.y)<.01);
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));assert.equal(ctx.towerInput.x,1);assert.ok(controlledIntent(r).speed>0);
 document.dispatchEvent(new dom.window.KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));assert.equal(controlledIntent(r).speed,0);
 note('robot-immobilized',{robot:1,lastAttacker:0});note('robot-immobilized',{robot:1,lastAttacker:0});assert.equal(s.players[0].balance,110);
 openMenu();assert.equal(document.querySelector('#launch-overlay').hidden,false);assert.match(document.querySelector('#menu-bank').textContent,/110/);close(dom);
});
test('player elimination ends attempt immediately even while several AI remain and banks are preserved',()=>{
 const s=betNewSession(['Первый'],100);const t=towerFor(s,0);for(let i=0;i<3;i++)completeTower(s,0,true);
 const dom=setup(s,t);document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 ctx.robots[0].failFromOilLoss=()=>{};
 // Removal of the head exercises real anatomy and permanent-garage isolation.
 ctx.robots[0].damage('head',1,100);step(1/60);
 assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,null);assert.equal(towerFor(s,0).level,1);assert.equal(s.garage[0].wins,0);
 showResults();assert.equal(ctx.resultsPanel.hidden,false);assert.match(ctx.resultsTitle.textContent,/ПРОЙДЕНО ЭТАЖЕЙ/);close(dom);
});
test('real final strikes pay once and victory unlocks next floor with one skill point and full recovery',()=>{
 const s=betNewSession(['Первый'],100);let dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 const original=structuredClone(s.garage);ctx.robots[0].damage('arm--1-upper',1,100);ctx.robots[1].damage('head',0,100);
 assert.equal(s.players[0].balance,110);assert.equal(s.towerEarned,10);step(1/60);
 assert.equal(ctx.combat.winner,0);assert.equal(towerFor(s,0).level,2);assert.equal(towerFor(s,0).wins,1);assert.deepEqual(s.garage,original);
 const next=structuredClone(towerFor(s,0));bettingSave();assert.deepEqual(bettingLoad().towers,s.towers);close(dom);
 dom=setup(s,next);assert.equal(ctx.robots.length,3);assert.equal(ctx.robots[0].segmentCount,ctx.robots[0].segmentTotal);assert.equal(ctx.towerGarage[0].stats.reduce((a,b)=>a+b,0),10);
 for(const r of ctx.robots)for(const [key,hp] of r.hp)assert.equal(hp,r.maxHp(key));close(dom);
});
test('switching menu player updates floor and balance without changing the active run owner',()=>{
 const s=betNewSession(['Первый','Второй'],100);completeTower(s,1,true);const dom=setup(s,towerFor(s,0));openMenu();
 const select=document.querySelector('#menu-player');select.value='1';select.dispatchEvent(new Event('change'));
 assert.match(document.querySelector('#launch-tower').textContent,/ЭТАЖ 2/);assert.equal(ctx.menuPlayer,1);assert.equal(ctx.towerPlayer,0);assert.equal(s.towerPlayerId,1);close(dom);
});
function manualFixture(arenaId='ring'){
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0),arenaId);
 document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 ctx.robots=[];const r=createRobot(0,{x:arenaId==='annulus'?170:350,y:350,angle:0}),foe=createRobot(1,{x:450,y:450,angle:0});ctx.robots=[r,foe];r.setVisible(true);foe.setVisible(false);
 return {s,dom,r};
}
test('tower selectors automatically transfer a point, show standard effects and reset to earned skills',()=>{
 const {s,dom}=manualFixture();openMenu();
 // Reopen the actual preparation interface, not a separately computed draft.
 ctx.root.querySelector('#tower-preparation').hidden=false;
 let speed=document.querySelector('[data-tower-stat="0"]');speed.value='4';speed.dispatchEvent(new Event('change'));
 assert.deepEqual(towerFor(s,0).stats,[4,2,3]);assert.deepEqual(ctx.towerGarage[0].stats,[4,2,3]);
 assert.deepEqual([...document.querySelectorAll('[data-tower-stat]')].map(n=>Number(n.value)),[4,2,3]);
 assert.match(document.querySelector('#tower-stats .garage-stat-effects').textContent,/Скор\. 120% Мобиль\. 100% Сила \+0%крит\./);
 assert.deepEqual(bettingLoad().towers[0].stats,[4,2,3]);
 const strength=document.querySelector('[data-tower-stat="1"]');strength.value='4';strength.dispatchEvent(new Event('change'));
 assert.deepEqual(towerFor(s,0).stats,[3,4,2],'changing the other selector replaces the previous transfer');
 document.querySelector('[data-tower-base]').click();assert.deepEqual(towerFor(s,0).stats,[3,3,3]);close(dom);
});
test('standing manual patient never rotates toward another patient',()=>{
 const {dom,r}=manualFixture();const foe=ctx.robots[1];foe.setVisible(true);
 const angle=r.angle,x=r.x,y=r.y;
 for(let i=0;i<60;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.equal(r.angle,angle);assert.ok(Math.hypot(r.x-x,r.y-y)<.01);assert.equal(controlledIntent(r).lookPoint,null);close(dom);
});
test('every ordinary manual strike allows movement and turning without cancelling the attack',()=>{
 for(const source of ['leg-1-lower','leg--1-lower','arm-1-lower','arm--1-lower','head']){
  const {dom,r}=manualFixture(),x=r.x,y=r.y,angle=r.angle;
  const strike={source,victim:1,aim:{x:x+20,y:y+20},started:ctx.game.time,impactAt:ctx.game.time+.52,endsAt:ctx.game.time+.78,resolved:false};ctx.combat.pending[0]=strike;
  ctx.towerInput={x:0,y:1};
  for(const [frames,phase] of [[12,'windup'],[12,'thrust'],[16,'recover']]){
   const before={x:r.x,y:r.y};tickManual(r,frames);
   const pose=r.attackPose(strike);assert.equal(pose.progress.phase,phase);assert.ok(Number.isFinite(pose.tip.x)&&Number.isFinite(pose.tip.y));
   assert.ok(Math.hypot(r.x-before.x,r.y-before.y)>.1,`${source} permits movement during ${phase}`);
  }
  assert.equal(ctx.combat.pending[0],strike);assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-x,r.y-y)>1);
  ctx.combat.pending[0]=null;tickManual(r,20);assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-x,r.y-y)>1);close(dom);
 }
});
test('tower arena clicks never pause; the pause button and other modes retain their controls',()=>{
 const {dom,s}=manualFixture(),canvas=document.querySelector('#copied-arena');
 for(const paused of [false,true]){
  ctx.paused=paused;ctx.svg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));canvas.click();assert.equal(ctx.paused,paused);
 }
 ctx.paused=false;ctx.button.click();assert.equal(ctx.paused,true);ctx.button.click();assert.equal(ctx.paused,false);
 initializeGame({session:s,entry:'betting'});installTowerUI();ctx.startup.phase='running';ctx.paused=false;
 const spectatorClick=ctx.svg.onclick;ctx.svg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));assert.equal(ctx.paused,true);
 ctx.mode='tower';spectatorClick();assert.equal(ctx.paused,true,'a copied stale handler cannot pause or resume a tower fight');
 close(dom);
});
test('held input preserves jump preparation, flight and recovery before movement resumes',()=>{
 let fixture=manualFixture();let {dom,r}=fixture;
 assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);ctx.towerInput={x:0,y:1};r.tick(1/60,controlledIntent(r));assert.ok(r.actualPose.leap);assert.equal(r.actualPose.leap.launched,true);close(dom);
 fixture=manualFixture();({dom,r}=fixture);assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);
 const leap=r.actualPose.leap;Object.assign(leap,{launched:true,started:ctx.game.time-.5,takeoffAt:ctx.game.time-.1,direction:{x:1,y:0},lastHead:{...r.eye}});
 ctx.towerInput={x:0,y:1};const angle=r.angle;r.tick(1/60,controlledIntent(r));assert.equal(r.actualPose.leap,leap);assert.equal(r.angle,angle);
 // End the forward flight and backward landing, then wait for recovery.
 for(let i=0;i<120&&r.actualPose.leap;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.equal(r.actualPose.leap,null);const landing={x:r.x,y:r.y};
 for(let i=0;i<60;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-landing.x,r.y-landing.y)>1);close(dom);
});
test('uncommanded pounce preparation cannot turn a standing player automatically',()=>{
 const {dom,r}=manualFixture();assert.equal(r.pounce({x:350,y:425},{victimId:1}),true);const angle=r.angle;
 r.tick(1/60,controlledIntent(r));assert.equal(r.angle,angle);assert.equal(r.actualPose.leap,null);close(dom);
});
test('automatic strikes can start while the player holds movement',()=>{
 const {dom,r}=manualFixture();ctx.robots=[r];const foe=createRobot(1,{x:350,y:380,angle:0});ctx.robots.push(foe);foe.setVisible(true);ctx.combat.nextStrike[1]=Infinity;
 ctx.towerInput={x:0,y:1};combatAttacks();assert.ok(ctx.combat.pending[0],'attack takes priority even with held input');close(dom);
});
function pressTowerKey(dom,type,code){document.dispatchEvent(new dom.window.KeyboardEvent(type,{code,bubbles:true}));}
function tickManual(r,frames=20){for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}}
test('WASD and arrow keys command the same screen directions and stop on release',()=>{
 for(const [code,x,y] of [['KeyW',0,-1],['ArrowUp',0,-1],['KeyS',0,1],['ArrowDown',0,1],['KeyA',-1,0],['ArrowLeft',-1,0],['KeyD',1,0],['ArrowRight',1,0]]){
  const {dom,r}=manualFixture();pressTowerKey(dom,'keydown',code);
  assert.deepEqual(ctx.towerInput,{x,y});const intent=controlledIntent(r);
  assert.ok(intent.speed>0);assert.equal(Math.sign(intent.goal.x-r.x),x);assert.equal(Math.sign(intent.goal.y-r.y),y);
  pressTowerKey(dom,'keyup',code);assert.equal(controlledIntent(r).speed,0);close(dom);
 }
});
test('diagonal keyboard speed is capped at the cardinal speed',()=>{
 const {dom,r}=manualFixture();pressTowerKey(dom,'keydown','KeyD');const speed=controlledIntent(r).speed;
 pressTowerKey(dom,'keydown','KeyW');const intent=controlledIntent(r);assert.equal(intent.speed,speed);assert.ok(intent.goal.x>r.x&&intent.goal.y<r.y);close(dom);
});
test('tower detailed statistics show totals and every patient after victory and defeat',()=>{
 for(const won of [true,false]){
  const s=betNewSession(['Статистик'],100),dom=setup(s,towerFor(s,0),'ring');
  document.querySelector('#tower-fight').click();advanceStartup(10);
  ctx.combat.strikes=7;ctx.combat.hits=4;ctx.combat.fighterHits=[3,1];ctx.combat.fighterTaken=[1,3];
  ctx.robots[won?1:0].damage('head',won?0:1,100);
  ctx.combat.finished=true;ctx.combat.winner=won?0:null;showResults();
  const details=document.querySelector('.gladiator-results-details');details.open=true;
  assert.equal(ctx.resultsTotals.children.length,3);assert.deepEqual([...ctx.resultsTotals.querySelectorAll('strong')].map(n=>n.textContent),['7','4','1']);
  assert.equal(ctx.resultsRows.children.length,2);const rows=[...ctx.resultsRows.querySelectorAll('tr')].map(row=>[...row.cells].map(cell=>cell.textContent));
  assert.deepEqual(rows[0].slice(0,4),['Статистик',won?'13/13':'12/13','3','1']);assert.equal(rows[0][4],won?'ПОБЕДИЛ':'ПОГИБ');assert.equal(rows[1][0],'ИИ 1');
  assert.equal(rows[1][4],won?'ПОГИБ':'ПОДВИЖЕН');close(dom);
 }
});
test('keyboard changes direction in screen coordinates regardless of current heading',()=>{
 const {dom,r}=manualFixture();pressTowerKey(dom,'keydown','KeyS');tickManual(r,40);pressTowerKey(dom,'keyup','KeyS');
 assert.ok(r.angle>.2);pressTowerKey(dom,'keydown','KeyD');const intent=controlledIntent(r);
 assert.equal(intent.goal.y,r.y);assert.ok(intent.goal.x>r.x);assert.equal(intent.manualDrive,undefined);close(dom);
});
test('tower has one toolbar menu button and restores cancel-fight control in totalizator',()=>{
 const {dom,s}=manualFixture();assert.equal(document.querySelector('#tag7hop-reset').hidden,true);assert.equal(document.querySelector('#game-menu').hidden,false);
 initializeGame({session:s,entry:'betting'});installTowerUI();assert.equal(document.querySelector('#tag7hop-reset').hidden,false);assert.equal(document.querySelector('#tag7hop-reset').textContent,'Отменить бой');close(dom);
});
test('new tower patient is random, retained across levels and continued saves, rerolled on reset or defeat',()=>{
 const originalRandom=Math.random;
 try{
  for(const [value,patient] of [[0,0],[.25,1],[.5,2],[.999,3]]){Math.random=()=>value;assert.equal(newTower().patient,patient);}
  const s=betNewSession(['Первый'],100);Math.random=()=>.1;assert.equal(towerFor(s,0).patient,0);
  Math.random=()=>.99;assert.equal(towerFor(s,0).patient,0);completeTower(s,0,true);assert.equal(towerFor(s,0).patient,0);
  assert.equal(resetTower(s,0).patient,3);Math.random=()=>.26;assert.equal(completeTower(s,0,false).patient,1);
  const dom=setup(s,towerFor(s,0));assert.equal(document.querySelector('#tower-patient'),null);bettingSave();assert.equal(bettingLoad().towers[0].patient,1);close(dom);
 }finally{Math.random=originalRandom;}
});
test('touch joystick supplies directional input and stops after finger release',()=>{
 const {dom,r}=manualFixture(),stick=document.querySelector('#tower-stick');stick.getBoundingClientRect=()=>({left:0,top:0,width:112,height:112});stick.setPointerCapture=()=>{};
 const pointer=(type,x,y)=>{const event=new dom.window.Event(type,{bubbles:true});Object.assign(event,{pointerId:7,clientX:x,clientY:y});stick.dispatchEvent(event);};
 pointer('pointerdown',95,56);assert.ok(ctx.towerInput.x>.9);assert.equal(ctx.towerInput.y,0);assert.ok(controlledIntent(r).goal.x>r.x);
 pointer('pointermove',56,17);assert.ok(ctx.towerInput.y<-.9);assert.equal(ctx.towerInput.x,0);
 pointer('pointerup',56,17);assert.equal(controlledIntent(r).speed,0);close(dom);
});
test('floors use 1,2,2,3,3 enemies and personal records survive defeat and reset',()=>{
 assert.deepEqual([1,2,3,4,5,6,7,8].map(floorEnemyCount),[1,2,2,3,3,4,4,5]);
 const s=betNewSession(['Первый','Второй'],100);for(let i=0;i<7;i++)completeTower(s,0,true);
 assert.equal(towerFor(s,0).record,7);completeTower(s,0,false);assert.equal(towerFor(s,0).record,7);assert.equal(towerFor(s,0).level,1);
 resetTower(s,0);assert.equal(towerFor(s,0).record,7);assert.equal(towerFor(s,1).record,0);
});
test('legacy runs keep the current fight, skill points and paid enemies, then adopt the new floor curve',()=>{
 const old={level:4,patient:2,stats:[4,4,4],wins:3,rewarded:[1,4],preparing:false};
 const s=betNewSession(['Первый'],100);s.towers[0]=old;normalizeTower(old);assert.ok(validTower(old));assert.equal(towerEnemyCount(old),4);assert.equal(old.record,3);assert.equal(old.runCoins,null);
 assert.equal(rewardTower(s,0,4,0),false);assert.equal(rewardTower(s,0,2,0),true);completeTower(s,0,true);
 assert.equal(towerFor(s,0).record,4);assert.equal(towerEnemyCount(towerFor(s,0)),3);assert.equal(towerFor(s,0).legacyEnemyCount,undefined);
 const dom=setup(s,towerFor(s,0));bettingSave();assert.equal(bettingLoad().towers[0].record,4);close(dom);
});
test('floor result distinguishes a cleared floor from a reached floor and marks a new personal record',()=>{
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);
 ctx.robots[1].damage('head',0,100);ctx.combat.finished=true;ctx.combat.winner=0;settleTower(0);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ЭТАЖ 1 ПРОЙДЕН');assert.match(document.querySelector('#bet-result-summary').textContent,/НОВЫЙ ЛИЧНЫЙ РЕКОРД/);assert.equal(ctx.resultsAgain.textContent,'НА ЭТАЖ 2');
 assert.match(document.querySelector('#bet-result-summary').textContent,/10/);assert.equal(towerFor(s,0).record,1);assert.equal(towerFor(s,0).runCoins,10);
 openMenu();assert.match(document.querySelector('#menu-tower-progress').textContent,/ПРОЙДЕНО: 1 · РЕКОРД: 1/);close(dom);
 const lossDom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.robots[0].damage('head',1,100);ctx.combat.finished=true;ctx.combat.winner=null;settleTower(null);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ПРОЙДЕНО ЭТАЖЕЙ: 1');assert.match(ctx.resultsSummary.textContent,/на этаже 2/);assert.equal(towerFor(s,0).level,1);assert.equal(towerFor(s,0).record,1);assert.equal(s.players[0].balance,110);close(lossDom);
});
test('a five-floor milestone is celebrated without awarding extra money',()=>{
 const s=betNewSession(['Первый'],100);for(let i=0;i<4;i++)completeTower(s,0,true);
 const dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.combat.finished=true;ctx.combat.winner=0;settleTower(0);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ЭТАЖ 5 ПРОЙДЕН');assert.match(document.querySelector('.tower-milestone').textContent,/5 ЭТАЖЕЙ/);assert.equal(s.players[0].balance,100);assert.equal(towerFor(s,0).wins,5);close(dom);
});
test('moving attack selection prefers a reachable hand; stable selection retains target and strike priorities',()=>{
 const hand={source:{kind:'arm'},segment:'head',score:50},kick={source:{kind:'leg'},segment:'leg-1-upper',score:0};
 assert.ok(compareStrikeCandidates(hand,kick,{moving:true})<0);assert.ok(compareStrikeCandidates(hand,kick)>0);
});
test('manual and autonomous patients can leave a perimeter contact and slide without losing a limb',()=>{
 for(const manual of [true,false]){
  const {dom,r}=manualFixture();const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,{manual,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:620,y:350},240);const contact={x:r.x,y:r.y};tick({x:450,y:440},120);tick({x:350,y:350},100);
  assert.equal(r.segmentCount,r.segmentTotal);assert.ok(Math.hypot(r.x-contact.x,r.y-contact.y)>15,'patient frees itself without dismemberment');
  for(const c of r.capsules)for(const hit of staticContacts(c))assert.ok(hit.depth<=(isLimb(c)?5:0)+.01,`${c.segment}: penetration ${hit.depth}`);
  close(dom);
 }
});
test('manual and autonomous patients can leave the annulus obstacle without losing a limb',()=>{
 for(const manual of [true,false]){
  const {dom,r}=manualFixture('annulus');const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,{manual,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:350,y:350},240);const contact={x:r.x,y:r.y};tick({x:190,y:450},120);tick({x:150,y:350},100);
  assert.equal(r.segmentCount,r.segmentTotal);assert.ok(Math.hypot(r.x-contact.x,r.y-contact.y)>15,'patient leaves the central obstacle');
  for(const c of r.capsules)for(const hit of staticContacts(c))assert.ok(hit.depth<=(isLimb(c)?5:0)+.01,`${c.segment}: penetration ${hit.depth}`);
  close(dom);
 }
});
