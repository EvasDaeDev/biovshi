import {createRobot} from '../src/robot/robot.js';
import {combatAttacks} from '../src/systems/combat.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {newTower,towerFor,rewardTower,completeTower,resetTower,validTower} from '../src/tower/model.js';
import {betNewSession,betCommit,betResolve,betTopUp,betAddPlayer} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {installTowerUI,openMenu} from '../src/tower/ui.js';
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
 initializeGame({session:s,entry:'tower',tower:structuredClone(tower),arenaId});installTowerUI();return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();ctx.mode='spectator';}
test('rewards survive restart and defeat, are once per enemy per floor and isolated per player',()=>{
 const s=betNewSession(['Первый','Второй'],100);
 assert.equal(rewardTower(s,0,1,1),false);assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,1,0),false);
 const copy=JSON.parse(JSON.stringify(s));assert.equal(rewardTower(copy,0,1,0),false);
 completeTower(s,0,true);assert.equal(towerFor(s,0).level,2);assert.deepEqual(towerFor(s,0).stats,[3,4,3]);assert.ok(validTower(towerFor(s,0)));
 assert.equal(rewardTower(s,0,1,0),false,'no payouts during preparation');towerFor(s,0).preparing=false;
 assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,2,0),true);
 completeTower(s,0,false);assert.deepEqual(towerFor(s,0),newTower());assert.equal(s.players[0].balance,130);
 assert.deepEqual(towerFor(s,1),newTower());assert.equal(s.players[1].balance,100);
 resetTower(s,0);assert.equal(s.players[0].balance,130);
});
test('tower rewards remain valid in shared betting storage after spending, settlement, joining and topups',()=>{
 const s=betNewSession(['Первый','Второй'],100);const dom=setup(s,towerFor(s,0));
 rewardTower(s,0,1,0);betTopUp(s,0,20);betAddPlayer(s,'Третий');
 betCommit(s,[{player:0,robot:0,amount:50},{player:1,robot:1,amount:20},{player:2,robot:2,amount:0}]);betResolve(s,0);
 bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.towerEarned,10);assert.deepEqual(loaded.towers,s.towers);assert.deepEqual(loaded.players,s.players);
 close(dom);
});
test('two existing arenas spawn variable counts; tower stats and cosmetics never touch regular patients',()=>{
 const s=betNewSession(['<Игрок>'],100);const t=towerFor(s,0);for(let i=0;i<7;i++)completeTower(s,0,true);t.patient=3;
 const original=structuredClone(s.garage);
 for(const arena of ['ward','ring']){
   const dom=setup(s,t,arena);assert.equal(ctx.robots.length,9);assert.equal(ctx.cardNodes.length,9);assert.equal(patientSkin(0),3);assert.equal(patientSkin(8),0);
   assert.deepEqual(patientGarage()[1].stats,[3,3,3]);assert.deepEqual(s.garage,original);assert.match(patientName(0),/&lt;Игрок&gt;/);assert.match(patientName(8),/ИИ 8/);
   for(const r of ctx.robots)assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));close(dom);
 }
});
test('manual patient stays still with no input and responds to keyboard with automatic attacks enabled',()=>{
 const s=betNewSession(['Первый'],100);const dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 const r=ctx.robots[0];ctx.robots[1].setVisible(false);const start={x:r.x,y:r.y};
 assert.equal(controlledIntent(r).speed,0);for(let i=0;i<90;i++)step(1/60);assert.ok(Math.hypot(r.x-start.x,r.y-start.y)<.01);
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));assert.equal(ctx.towerInput.turn,1);assert.equal(controlledIntent(r).manualTurn,1);assert.equal(controlledIntent(r).speed,0);
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
 showResults();assert.equal(ctx.resultsPanel.hidden,false);assert.match(ctx.resultsTitle.textContent,/ЗАВЕРШЕНА/);close(dom);
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
 assert.match(document.querySelector('#launch-tower').textContent,/УРОВЕНЬ 2/);assert.equal(ctx.menuPlayer,1);assert.equal(ctx.towerPlayer,0);assert.equal(s.towerPlayerId,1);close(dom);
});
function manualFixture(){
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0),'ring');
 document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 ctx.robots=[];const r=createRobot(0,{x:350,y:350,angle:0}),foe=createRobot(1,{x:450,y:450,angle:0});ctx.robots=[r,foe];r.setVisible(true);foe.setVisible(false);
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
test('player direction interrupts a kick before damage and moves instead; AI cannot restart it during input',()=>{
 const {dom,r}=manualFixture();const start={x:r.x,y:r.y};
 ctx.combat.pending[0]={source:'leg-1-upper',victim:1,started:0,impactAt:0,endsAt:10,resolved:false};
 ctx.towerInput={x:0,y:1};
 for(let i=0;i<30;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));combatAttacks();}
 assert.equal(ctx.combat.pending[0],null);assert.ok(r.angle>.2);assert.ok(Math.hypot(r.x-start.x,r.y-start.y)>1);assert.equal(ctx.combat.hits,0);close(dom);
});
test('manual input cancels preflight preparation but preserves an airborne jump until landing',()=>{
 let fixture=manualFixture();let {dom,r}=fixture;
 assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);ctx.towerInput={x:0,y:1};r.tick(1/60,controlledIntent(r));assert.equal(r.actualPose.leap,null);close(dom);
 fixture=manualFixture();({dom,r}=fixture);assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);
 const leap=r.actualPose.leap;Object.assign(leap,{launched:true,started:ctx.game.time-.5,takeoffAt:ctx.game.time-.1,direction:{x:1,y:0},lastHead:{...r.eye}});
 ctx.towerInput={x:0,y:1};const angle=r.angle;r.tick(1/60,controlledIntent(r));assert.equal(r.actualPose.leap,leap);assert.equal(r.angle,angle);
 // End the forward flight and backward landing, then input must override recovery.
 for(let i=0;i<120&&r.actualPose.leap;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.equal(r.actualPose.leap,null);const landing={x:r.x,y:r.y};
 for(let i=0;i<20;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-landing.x,r.y-landing.y)>1);close(dom);
});
test('uncommanded pounce preparation cannot turn a standing player automatically',()=>{
 const {dom,r}=manualFixture();assert.equal(r.pounce({x:350,y:425},{victimId:1}),true);const angle=r.angle;
 r.tick(1/60,controlledIntent(r));assert.equal(r.angle,angle);assert.equal(r.actualPose.leap,null);close(dom);
});
test('automatic strikes resume after the player releases movement',()=>{
 const {dom,r}=manualFixture();ctx.robots=[r];const foe=createRobot(1,{x:350,y:380,angle:0});ctx.robots.push(foe);foe.setVisible(true);ctx.combat.nextStrike[1]=Infinity;
 ctx.towerInput={x:1,y:0};combatAttacks();assert.equal(ctx.combat.pending[0],null);assert.equal(r.actualPose.leap,null);
 ctx.towerInput={x:0,y:0};combatAttacks();assert.ok(ctx.combat.pending[0],'standing player automatically attacks within reach');close(dom);
});
function pressTowerKey(dom,type,code){document.dispatchEvent(new dom.window.KeyboardEvent(type,{code,bubbles:true}));}
function tickManual(r,frames=20){for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}}
test('keyboard forward and reverse follow body heading without turning around',()=>{
 for(const [code,sign] of [['ArrowUp',1],['KeyW',1],['ArrowDown',-1],['KeyS',-1]]){
  const {dom,r}=manualFixture(),x=r.x,y=r.y,angle=r.angle;
  pressTowerKey(dom,'keydown',code);tickManual(r);
  assert.ok((r.x-x)*sign>1,`${code} moves along the body axis`);assert.ok(Math.abs(r.y-y)<.01);assert.equal(r.angle,angle,'reverse does not turn the patient 180 degrees');
  pressTowerKey(dom,'keyup',code);assert.equal(controlledIntent(r).speed,0);close(dom);
 }
});
test('keyboard turns in place; forward and turn can be combined',()=>{
 for(const [code,sign] of [['ArrowRight',1],['KeyD',1],['ArrowLeft',-1],['KeyA',-1]]){
  const {dom,r}=manualFixture(),x=r.x,y=r.y;
  pressTowerKey(dom,'keydown',code);ctx.combat.pending[0]={source:'leg-1-upper',victim:1,endsAt:10};tickManual(r);
  assert.ok(r.angle*sign>.2,`${code} changes heading`);assert.ok(Math.hypot(r.x-x,r.y-y)<.01,'turn alone does not walk');assert.equal(ctx.combat.pending[0],null,'turning cancels the attack too');
  combatAttacks();assert.equal(ctx.combat.pending[0],null,'AI cannot restart an attack while turning');close(dom);
 }
 const {dom,r}=manualFixture(),x=r.x,y=r.y;
 pressTowerKey(dom,'keydown','KeyW');pressTowerKey(dom,'keydown','KeyD');tickManual(r);
 assert.ok(r.angle>.2);assert.ok(r.x>x&&r.y>y,'forward plus right follows a curve');close(dom);
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
test('forward key follows the heading chosen by keyboard turning, not a screen axis',()=>{
 const {dom,r}=manualFixture();pressTowerKey(dom,'keydown','KeyD');tickManual(r);pressTowerKey(dom,'keyup','KeyD');
 const angle=r.angle,x=r.x,y=r.y;pressTowerKey(dom,'keydown','ArrowUp');tickManual(r);
 const dx=r.x-x,dy=r.y-y;
 assert.equal(r.angle,angle);assert.ok(dx*Math.cos(angle)+dy*Math.sin(angle)>1);assert.ok(Math.abs(-dx*Math.sin(angle)+dy*Math.cos(angle))<.01);close(dom);
});
