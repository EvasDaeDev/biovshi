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
