import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';
import {betCommit,betResolve,betTopUp} from '../src/betting/ledger.js';
import {bettingResults} from '../src/betting/ui.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://interface.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));document.querySelector('#garage-next').click();
 return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
test('patient card shows the three permanent skills and a bone count without mobility telemetry',()=>{
 const dom=setup();ctx.betting.garage[0].stats=[2,4,3];ctx.telemetryDirty=true;paintTelemetry();
 const card=ctx.cardNodes[0];assert.equal(card.strength.textContent,'4 · 30%');assert.equal(card.speed.textContent,'2 · 80%');assert.equal(card.maneuver.textContent,'3 · 100%');
 assert.equal(card.card.querySelector('.js-mobility'),null);assert.match(card.card.querySelector('.robot-card-score').textContent,/13\/13/);assert.match(card.card.querySelector('.robot-card-score img').src,/bone_01\.png$/);assert.equal(card.card.querySelectorAll('.patient-skills>div').length,3);close(dom);
});
test('manual top-up is absent and rejected without changing balances or draft bets',()=>{
 const dom=setup(),rows=[...document.querySelectorAll('[data-bet-player]')];
 try{
  rows[0].querySelector('input').value='20';rows[1].querySelector('input').value='30';rows[0].querySelector('select').value='2';
  assert.equal(document.querySelector('[data-top-up]'),null);
  const before=JSON.stringify(ctx.betting);
  for(const amount of [50,-10,2.5,0])assert.throws(()=>betTopUp(ctx.betting,0,amount),/отключено/);
  assert.equal(JSON.stringify(ctx.betting),before);assert.equal(rows[0].querySelector('input').value,'20');assert.equal(rows[1].querySelector('input').value,'30');assert.equal(rows[0].querySelector('select').value,'2');
  assert.equal(bettingLoad().players[0].balance,2000);
 }finally{close(dom);}
});
test('results colour income and losses, show profit and reconcile the actual balance',()=>{
 const dom=setup();betCommit(ctx.betting,[{player:0,robot:0,amount:10},{player:1,robot:1,amount:20}]);betResolve(ctx.betting,0);bettingResults();
 const root=document.querySelector('#bet-result-summary'),rows=root.querySelectorAll('tbody tr');assert.match(root.querySelector('thead').textContent,/Прибыль/);
 assert.equal(rows[0].children[2].textContent,'27 ');assert.ok(rows[0].children[2].querySelector('.chip-icon'));assert.ok([...root.querySelectorAll('img')].every(image=>image.classList.contains('chip-icon')));assert.ok(rows[0].children[2].classList.contains('bet-net-win'));assert.equal(rows[0].children[3].textContent,'+17 ');assert.equal(rows[0].children[4].querySelector('summary').textContent,'2 017 ');assert.match(rows[0].children[4].textContent,/2\s000  −10  \+27  = 2\s017 /);
 assert.equal(rows[1].children[3].textContent,'-20 ');assert.ok(rows[1].children[3].firstElementChild.classList.contains('bet-net-loss'));assert.equal(rows[1].children[4].querySelector('summary').textContent,'1 980 ');assert.match(rows[1].children[4].textContent,/2\s000  −20  = 1\s980 /);close(dom);
});
test('shared hints replace native titles, support keyboard focus and clean up on dispose',()=>{
 const dom=setup(),button=document.querySelector('#bet-add-player'),hint=document.querySelector('.biovshi-hint');
 button.dispatchEvent(new Event('pointerover',{bubbles:true}));assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Добавить игрока');assert.equal(button.hasAttribute('title'),false);assert.equal(button.getAttribute('aria-describedby'),'biovshi-hint');
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(hint.hidden,true);assert.equal(button.hasAttribute('aria-describedby'),false);
 button.dispatchEvent(new Event('focusin',{bubbles:true}));assert.equal(hint.hidden,false);ctx.root.__disposeTag();assert.equal(document.querySelector('.biovshi-hint'),null);assert.equal(button.title,'Добавить игрока');dom.window.close();
});

test('procedure preserves stakes and arena; hat selection never spends until explicit purchase',()=>{
 const dom=setup();
 try{
  const row=document.querySelector('[data-bet-player="0"]');row.querySelector('input').value='23';row.querySelector('select').value='3';
  document.querySelector('[data-arena="ring"]').click();document.querySelector('#bet-procedure').click();
  const player=document.querySelector('#procedure-editor');player.value='1';player.dispatchEvent(new Event('change'));
  let section=document.querySelector('[data-patient="0"]');
  section.querySelector('[data-price]').value='250';section.querySelector('[data-hat="2"]').click();
  assert.equal(ctx.betting.players[1].balance,2000);assert.equal(ctx.betting.garage[0].head,null);
  const speed=section.querySelector('[data-stat="0"]');speed.value='4';speed.dispatchEvent(new Event('change'));
  section=document.querySelector('[data-patient="0"]');
  assert.equal(document.querySelector('#procedure-editor').value,'1');assert.equal(section.querySelector('[data-price]').value,'250');
  assert.equal(section.querySelector('[data-hat="2"]').getAttribute('aria-pressed'),'true');
  assert.match(section.querySelector('[data-error]').textContent,/Скорость \+1/);
  section.querySelector('[data-buy]').click();assert.equal(ctx.betting.players[1].balance,1750);assert.equal(ctx.betting.garage[0].head.hat,2);
  assert.match(document.querySelector('[data-patient="0"] [data-error]').textContent,/Покровитель/);
  document.querySelector('#garage-next').click();
  assert.equal(document.querySelector('[data-bet-player="0"] input').value,'23');assert.equal(document.querySelector('[data-bet-player="0"] select').value,'3');assert.equal(ctx.selectedArenaId,'ring');
  document.querySelector('[data-bet-player="1"] [data-share="0.5"]').click();assert.equal(document.querySelector('[data-bet-player="1"] input').value,'875');
  assert.equal(ctx.cardNodes[0].card.querySelector('.robot-card-metrics'),null);
 }finally{close(dom);}
});

test('modal keyboard focus wraps within the sheet and restores background controls',async()=>{
 const dom=setup();
 try{
  document.querySelector('#launch-overlay').hidden=true;
  const {initializeModalFocus}=await import('../src/ui/modal-focus.js');initializeModalFocus();
  assert.equal(ctx.button.inert,true);
  assert.equal(Boolean(document.querySelector('#game-nav-settings').inert),false);
  const history=document.querySelector('#bet-fight');history.focus();
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}));
  assert.equal(document.activeElement.id,'game-nav-settings');
  document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(document.activeElement.id,'bet-fight');
  ctx.betOverlay.hidden=true;await Promise.resolve();assert.equal(ctx.button.inert,false);
  document.querySelector('#game-nav-settings').click();await Promise.resolve();
  document.querySelector('#arena-settings-close').click();await Promise.resolve();
  assert.equal(ctx.button.inert,false);
 }finally{close(dom);}
});

