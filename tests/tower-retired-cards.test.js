import test from 'node:test';
import assert from 'node:assert/strict';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';

const order=()=>[...ctx.roles.children].map(node=>ctx.cardNodes.findIndex(card=>card.card===node));
const allVisible=()=>assert.ok(ctx.cardNodes.every(({card})=>!card.hidden&&card.getAttribute('aria-hidden')!=='true'));

test('Tower keeps the player first and moves eliminated enemies below all active patients',()=>{
 const f=startBossScenario({variant:'brute',arena:'ring',ordinary:true});
 try{
  const [player,dying,dead,alive]=ctx.robots;
  assert.ok(alive);
  const cards=[...ctx.cardNodes];
  const original=order();
  for(const kind of ['arm','leg'])for(const side of [-1,1])dying.damage(`${kind}-${side}-upper`,0,100);
  ctx.combat.unarmedDeadline[dying.id]=ctx.game.time+5;
  dead.damage('head',0,100);
  paintTelemetry();
  assert.equal(dying.mobile,true);
  assert.match(cards[dying.id].action.textContent,/Теряет сознание/);
  assert.equal(cards[dead.id].action.textContent,'Погиб');
  assert.deepEqual(order(),[...original.filter(id=>id!==dead.id),dead.id]);
  allVisible();

  dying.failFromOilLoss();
  player.damage('head',alive.id,100);
  paintTelemetry();
  assert.equal(cards[dying.id].action.textContent,'Без сознания');
  assert.deepEqual(order(),[0,...original.filter(id=>![0,dying.id,dead.id].includes(id)),dying.id,dead.id]);
  assert.deepEqual(ctx.cardNodes,cards,'telemetry still looks up cards by robot id');
  assert.equal(cards[0].card.classList.contains('tower-card-retired'),false);
  for(const r of [dying,dead])assert.equal(cards[r.id].card.classList.contains('tower-card-retired'),true);
  allVisible();

  const observer=new f.dom.window.MutationObserver(()=>{});
  observer.observe(ctx.roles,{childList:true});
  ctx.telemetryDirty=true;paintTelemetry();
  assert.deepEqual(observer.takeRecords(),[]);
  observer.disconnect();
 }finally{f.close();}
});

test('spectator cards retain their original order after a patient is eliminated',()=>{
 const f=startBossScenario({variant:'brute',arena:'ring',ordinary:true});
 try{
  ctx.mode='spectator';
  const original=order();
  ctx.robots[1].damage('head',0,100);
  paintTelemetry();
  assert.deepEqual(order(),original);
  assert.equal(ctx.roles.querySelector('.tower-card-retired'),null);
  allVisible();
 }finally{f.close();}
});
