import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {CONFIG} from '../src/config.js';
import {betNewSession,betCommit,betRefund} from '../src/betting/ledger.js';
import {buyHat,earnedStats} from '../src/garage/model.js';
import {startSpawnSequence,advanceStartup,resetRound} from '../src/game/session.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {newTower} from '../src/tower/model.js';
import {installTowerUI} from '../src/tower/ui.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {setPendingStrikes,pendingStrikes} from '../src/systems/strikes.js';
import {step} from '../src/game/loop.js';

function setup({threshold=18,headMultiplier=1.5,enabled=true,tower=false}={}){
 const saved={...CONFIG.combat.trauma};Object.assign(CONFIG.combat.trauma,{threshold,headMultiplier,enabled});
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://trauma.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const s=betNewSession(['First','Second'],1000);
 s.garage[0].wins=6;s.garage[0].stats=earnedStats(6);buyHat(s,0,1,2,50);
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 if(tower)s.towers[0]=newTower(0);
 initializeGame({session:s,entry:'betting',...(tower?{tower:structuredClone(s.towers[0])}:{})});
 if(tower){installTowerUI();document.querySelector('#tower-fight').click();}
 else{betCommit(s,[{player:0,robot:0,amount:20},{player:1,robot:1,amount:20}]);startSpawnSequence();}
 advanceStartup(20);ctx.paused=false;ctx.orientationBlocked=false;ctx.settingsOpen=false;
 const events=[],off=onGameEvent(e=>events.push(e));
 return {s,events,close(){off();ctx.root.__disposeTag();dom.window.close();Object.assign(CONFIG.combat.trauma,saved);}};
}
function hit(r,key,damage=1,by=1){ctx.game.time+=CONFIG.combat.damageInvulnerabilitySec+.01;return r.damage(key,by,damage);}

test('trauma counts actual HP, weights head damage and ignores invulnerable or invalid repeats',()=>{
 const env=setup();try{
  const r=ctx.robots[0];assert.equal(hit(r,'head',2),true);assert.equal(r.trauma,3);
  assert.equal(r.damage('head',1,2),false);assert.equal(r.trauma,3);
  assert.equal(hit(r,'arm--1-lower',100),true);assert.equal(r.trauma,6,'overkill adds only 3 HP');
  assert.equal(hit(r,'arm--1-lower'),false);assert.equal(hit(r,'spine-0'),false);
  for(const amount of [0,-1,NaN,Infinity])assert.equal(hit(r,'arm-1-lower',amount),false);
  assert.equal(r.trauma,6);assert.equal(r.unconscious,false);
 }finally{env.close();}
});

test('detached descendants do not turn one severing hit into several injuries',()=>{
 const env=setup();try{
  const r=ctx.robots[0];hit(r,'spine-3',100);
  assert.equal(r.movementLimbs,2);assert.equal(r.hp.get('leg-1-upper'),0);
  assert.equal(r.trauma,4);assert.equal(r.mobile,true);
 }finally{env.close();}
});

test('crossing the threshold knocks out a living patient with intact limbs without erasing progression',()=>{
 const env=setup({threshold:4});try{
  const r=ctx.robots[0],build=structuredClone(env.s.garage[0]);
  hit(r,'arm--1-lower',2);assert.equal(r.mobile,true);
  hit(r,'leg-1-lower',2);assert.equal(r.mobile,false);assert.equal(r.unconscious,true);
  assert.equal(r.hasHead,true);assert.equal(r.movementLimbs,4);assert.equal(r.knockoutCause,'trauma');assert.deepEqual(r.capsules,[]);
  assert.deepEqual(env.s.garage[0],build);
  const elimination=env.events.filter(e=>e.type==='robot-immobilized');
  assert.equal(elimination.length,1);assert.equal(elimination[0].reason,'потерял сознание');assert.equal(elimination[0].lastAttacker,1);
  const hp=[...r.hp];assert.equal(hit(r,'head',100),false);assert.equal(r.failFromOilLoss(),false);assert.deepEqual([...r.hp],hp);
  assert.equal(env.events.filter(e=>e.type==='robot-immobilized').length,1);
 }finally{env.close();}
});

test('lethal head destruction takes priority even when the same hit exceeds the trauma threshold',()=>{
 const env=setup({threshold:2});try{
  const r=ctx.robots[0];hit(r,'head',100);
  assert.equal(r.hasHead,false);assert.equal(r.unconscious,false);assert.equal(r.knockoutCause,null);
  assert.equal(env.s.garage[0].wins,0);assert.equal(env.s.garage[0].head,null);
  const rows=env.events.filter(e=>e.type==='robot-immobilized');assert.equal(rows.length,1);assert.equal(rows[0].reason,'погиб');
 }finally{env.close();}
});

test('knockout cancels outgoing and incoming primary and secondary strikes',()=>{
 const env=setup({threshold:1});try{
  setPendingStrikes(0,[{victim:1},{victim:2}]);setPendingStrikes(1,[{victim:0},{victim:2}]);setPendingStrikes(2,[{victim:3},{victim:0}]);
  hit(ctx.robots[0],'arm-1-lower');
  assert.deepEqual(pendingStrikes(0),[]);assert.deepEqual(pendingStrikes(1).map(p=>p.victim),[2]);assert.deepEqual(pendingStrikes(2).map(p=>p.victim),[3]);
 }finally{env.close();}
});

test('complete limb loss retains the existing timed knockout when trauma has not reached its threshold',()=>{
 const env=setup({threshold:100});try{
  const r=ctx.robots[0];for(const kind of ['arm','leg'])for(const side of [-1,1])hit(r,`${kind}-${side}-upper`,100);
  assert.equal(r.trauma,12);assert.equal(r.mobile,true);step(1/60);
  assert.ok(ctx.combat.unarmedDeadline[0]>ctx.game.time);
  ctx.game.time=ctx.combat.unarmedDeadline[0];step(1/60);
  assert.equal(r.unconscious,true);assert.equal(r.knockoutCause,'limb-loss');
 }finally{env.close();}
});

test('disabling trauma restores the old knockout condition',()=>{
 const env=setup({enabled:false,threshold:1});try{
  const r=ctx.robots[0];hit(r,'arm-1-lower',2);hit(r,'head',2);
  assert.equal(r.trauma,0);assert.equal(r.mobile,true);assert.equal(r.unconscious,false);
 }finally{env.close();}
});

test('cancellation, reload and the next round restore a fresh trauma counter and original patient build',async()=>{
 for(const reload of [false,true]){
  const env=setup({threshold:2});try{
   const initial=structuredClone(env.s.roundSnapshot.garage);hit(ctx.robots[0],'arm-1-lower',2);assert.equal(ctx.robots[0].unconscious,true);
   if(reload){bettingSave();ctx.betting=bettingLoad();assert.ok(ctx.betting);}else betRefund(env.s);
   assert.deepEqual(ctx.betting.garage,initial);await resetRound();
   assert.equal(ctx.robots[0].trauma,0);assert.equal(ctx.robots[0].knockoutCause,null);assert.equal(ctx.robots[0].mobile,true);
  }finally{env.close();}
 }
});

test('tower trauma knockout rewards the last attacker once and advances a won floor',()=>{
 const env=setup({threshold:2,tower:true});try{
  const victim=ctx.robots[1],balance=env.s.players[0].balance;
  hit(victim,'arm-1-lower',2,0);assert.equal(victim.unconscious,true);assert.equal(env.s.players[0].balance,balance+10);
  assert.equal(hit(victim,'head',100,0),false);assert.equal(env.s.players[0].balance,balance+10);
  step(1/60);assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,0);assert.equal(env.s.towers[0].level,2);
  assert.equal(ctx.robots[0].trauma,0);assert.equal(env.s.garage[0].wins,6);
 }finally{env.close();}
});

test('tower player knockout immediately ends the floor, keeps coins and resets the run',()=>{
 const env=setup({threshold:2,tower:true});try{
  const balance=env.s.players[0].balance;hit(ctx.robots[0],'arm-1-lower',2,1);step(1/60);
  assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,null);assert.equal(env.s.players[0].balance,balance);
  assert.equal(env.s.towers[0].level,1);assert.match(ctx.towerOutcome.reason,/сознание/);
 }finally{env.close();}
});

test('a completed knockout fight settles bets once and preserves the knocked-out patient build',()=>{
 const env=setup({threshold:4});try{
  const build=structuredClone(env.s.garage[0]);hit(ctx.robots[0],'arm--1-lower',2);hit(ctx.robots[0],'leg-1-lower',2);
  hit(ctx.robots[2],'head',100);hit(ctx.robots[3],'head',100);step(1/60);
  assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,1);assert.equal(env.s.phase,'settled');
  assert.deepEqual(env.s.garage[0],build);assert.equal(env.s.garage[1].wins,1);
  assert.deepEqual(env.s.players.map(p=>p.balance),[980,967]);assert.equal(env.s.jackpot,3);
  const receipt=structuredClone(env.s.lastResult);step(1/60);assert.deepEqual(env.s.lastResult,receipt);
  bettingSave();assert.ok(bettingLoad());
 }finally{env.close();}
});

test('patient trauma meter is compact, accessible, tracks half-points and resets with the patient',async()=>{
 const {paintTelemetry}=await import('../src/ui/paint-telemetry.js');
 const env=setup({threshold:24});try{
  const paintCard=()=>{ctx.telemetryDirty=true;paintTelemetry();};
  const r=ctx.robots[0],card=ctx.cardNodes[0];paintCard();
  assert.equal(card.traumaValue.textContent,'0 / 24');assert.equal(card.traumaTrack.getAttribute('aria-valuemax'),'24');
  assert.equal(card.card.querySelectorAll('.patient-skills>div').length,3);
  assert.ok(card.trauma.closest('.patient-summary'));assert.equal(card.trauma.closest('.portrait-wrap'),null);
  hit(r,'head');paintCard();assert.equal(card.traumaValue.textContent,'1,5 / 24');assert.equal(card.traumaTrack.getAttribute('aria-valuenow'),'1.5');
  // Raise the injury total without sacrificing the head or crossing the limit.
  for(const side of [-1,1])for(const kind of ['arm','leg'])hit(r,`${kind}-${side}-lower`,2);
  hit(r,'spine-1',2);hit(r,'spine-2',2);paintCard();
  assert.equal(card.traumaValue.textContent,'13,5 / 24');assert.equal(card.trauma.dataset.severity,'warning');
  hit(r,'head',2);hit(r,'head');paintCard();assert.equal(card.trauma.dataset.severity,'critical');
  const {betRefund}=await import('../src/betting/ledger.js');betRefund(env.s);await resetRound();paintCard();
  assert.equal(ctx.cardNodes[0].traumaValue.textContent,'0 / 24');assert.equal(ctx.cardNodes[0].traumaFill.style.transform,'scaleX(0)');
 }finally{env.close();}
});

test('trauma meter caps overkill at its maximum, announces knockout and hides when disabled',async()=>{
 const {paintTelemetry}=await import('../src/ui/paint-telemetry.js');
 const env=setup({threshold:1});try{
  hit(ctx.robots[0],'arm-1-lower',2);ctx.telemetryDirty=true;paintTelemetry();
  const card=ctx.cardNodes[0];assert.equal(card.traumaValue.textContent,'1 / 1');assert.equal(card.traumaFill.style.transform,'scaleX(1)');
  assert.match(card.traumaTrack.getAttribute('aria-valuetext'),/без сознания/);assert.equal(card.action.textContent,'Без сознания');
  CONFIG.combat.trauma.enabled=false;ctx.telemetryDirty=true;paintTelemetry();assert.equal(card.trauma.hidden,true);
 }finally{env.close();}
});
