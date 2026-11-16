import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {playerBalanceMarkup,counterValue,trackPlayerBalances,replayPlayerBalanceChanges,COUNTER_DURATION_MS} from '../src/ui/currency-animation.js';

test('counter easing is bounded, fast and stops at the exact integer amount',()=>{
 assert.equal(counterValue(1000,800,0),1000);
 assert.equal(counterValue(1000,800,1),800);
 assert.ok(counterValue(1000,800,.5)<900);
 assert.equal(counterValue(800,1113,1),1113);
 assert.equal(counterValue(0,200,-1),0);
 assert.equal(counterValue(0,200,2),200);
 assert.equal(COUNTER_DURATION_MS,650);
});
test('all player windows reflect independent credits and debits without changing real money',()=>{
 const dom=new JSDOM('<main id="root"></main>',{url:'https://balance-ui.test/',pretendToBeVisual:true});
 const priorRAF=globalThis.requestAnimationFrame,priorCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 try{
  const root=dom.window.document.querySelector('#root');
  const session={players:[{id:0,name:'Игрок 1',balance:1000},{id:1,name:'Игрок 2',balance:1200}]};
  root.innerHTML='<div id="tower">'+playerBalanceMarkup(0,1000)+'</div><div id="betting">'+playerBalanceMarkup(0,1000)+'</div><div id="garage">'+playerBalanceMarkup(1,1200)+'</div>';
  trackPlayerBalances(session,root);
  assert.equal(root.querySelector('[data-player-balance="0"]').dataset.balanceTarget,'1000');
  assert.equal(root.querySelector('.is-credit'),null);
  session.players[0].balance=850;trackPlayerBalances(session,root);
  const first=[...root.querySelectorAll('[data-player-balance="0"]')];
  assert.equal(first.length,2);
  assert.ok(first.every(el=>el.classList.contains('is-debit')&&el.dataset.balanceTarget==='850'));
  assert.equal(session.players[0].balance,850);
  session.players[1].balance=1513;trackPlayerBalances(session,root);
  assert.ok(root.querySelector('[data-player-balance="1"]').classList.contains('is-credit'));
  root.querySelector('#tower').innerHTML=playerBalanceMarkup(0,850);
  assert.ok(root.querySelector('#tower .currency-counter').classList.contains('is-debit'),
    'new wallets immediately inherit the active debit without a microtask');
  trackPlayerBalances(session,root);
  assert.ok(root.querySelector('#tower .currency-counter').classList.contains('is-debit'));
  const fresh={players:[{id:0,name:'Игрок 1',balance:450}]};
  trackPlayerBalances(fresh,root);
  assert.equal(root.querySelector('.is-debit'),null);
  assert.equal(root.querySelector('[data-player-balance="0"]').dataset.balanceTarget,'450');
 }finally{
  globalThis.requestAnimationFrame=priorRAF;globalThis.cancelAnimationFrame=priorCancel;dom.window.close();
 }
});

test('late results can replay credits without changing session balances',()=>{
 const dom=new JSDOM('<main id="root"></main>',{url:'https://late-receipt.test/',pretendToBeVisual:true});
 const priorRAF=globalThis.requestAnimationFrame,priorCancel=globalThis.cancelAnimationFrame;
 const priorNow=Date.now;let now=1000;
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 Date.now=()=>now;
 try{
  const root=dom.window.document.querySelector('#root');
  const session={players:[{id:0,name:'Первый',balance:80},{id:1,name:'Второй',balance:60}]};
  root.innerHTML=playerBalanceMarkup(0,80)+playerBalanceMarkup(1,60);
  trackPlayerBalances(session,root);
  session.players[0].balance=125;trackPlayerBalances(session,root);
  now+=4000;
  root.innerHTML=playerBalanceMarkup(0,125)+playerBalanceMarkup(1,60);
  assert.equal(root.querySelector('[data-player-balance="0"]').classList.contains('is-credit'),false);
  replayPlayerBalanceChanges(session,[{id:0,from:80,to:125}],root);
  assert.equal(root.querySelector('[data-player-balance="0"]').classList.contains('is-credit'),true);
  assert.equal(root.querySelector('[data-player-balance="1"]').classList.contains('is-credit'),false);
  assert.deepEqual(session.players.map(p=>p.balance),[125,60]);
 }finally{
  Date.now=priorNow;globalThis.requestAnimationFrame=priorRAF;
  globalThis.cancelAnimationFrame=priorCancel;dom.window.close();
 }
});

test('queued result credit waits for target window visibility despite elapsed time',async()=>{
 const dom=new JSDOM('<main id="root"><section id="arena" hidden><span class="currency-counter" data-player-balance="0"><span class="currency-counter-value">50</span></span></section><section id="results" hidden><span class="currency-counter" data-player-balance="0"><span class="currency-counter-value">50</span></span></section></main>',{url:'https://screen-gated.test/',pretendToBeVisual:true});
 const prevRAF=globalThis.requestAnimationFrame,prevCancel=globalThis.cancelAnimationFrame,prevNow=Date.now;
 let now=1000;
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};Date.now=()=>now;
 try{
  const root=dom.window.document.querySelector('#root'),s={players:[{id:0,name:'Игрок',balance:50}]};
  trackPlayerBalances(s,root);
  s.players[0].balance=70;
  replayPlayerBalanceChanges(s,[{id:0,from:50,to:70}],root,'#results');
  assert.equal(root.querySelector('.is-credit'),null);
  now+=5000;
  root.querySelector('#arena').hidden=false;await Promise.resolve();
  assert.equal(root.querySelector('.is-credit'),null,'opening another window cannot consume queued credit');
  root.querySelector('#results').hidden=false;await Promise.resolve();
  const result=root.querySelector('#results [data-player-balance]');
  assert.equal(result.classList.contains('is-credit'),true);
  assert.equal(result.querySelector('.currency-counter-value').textContent,'50');
  assert.equal(root.querySelector('#arena .is-credit'),null);
  assert.equal(s.players[0].balance,70);
 }finally{
  Date.now=prevNow;globalThis.requestAnimationFrame=prevRAF;
  globalThis.cancelAnimationFrame=prevCancel;dom.window.close();
 }
});
test('automatically tracked balance changes do not animate concealed widgets',()=>{
 const dom=new JSDOM('<main id="root"><section id="visible"><span class="currency-counter" data-player-balance="0"><span class="currency-counter-value">100</span></span></section><section id="hidden" hidden><span class="currency-counter" data-player-balance="0"><span class="currency-counter-value">100</span></span></section></main>',{url:'https://screen-gated.test/',pretendToBeVisual:true});
 const prevRAF=globalThis.requestAnimationFrame,prevCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 try{
  const root=dom.window.document.querySelector('#root'),s={players:[{id:0,balance:100}]};
  trackPlayerBalances(s,root);s.players[0].balance=80;trackPlayerBalances(s,root);
  assert.equal(root.querySelector('#visible .currency-counter').classList.contains('is-debit'),true);
  assert.equal(root.querySelector('#hidden .currency-counter').classList.contains('is-debit'),false);
  assert.equal(root.querySelector('#hidden [data-player-balance]').dataset.balanceTarget,'80');
 }finally{globalThis.requestAnimationFrame=prevRAF;globalThis.cancelAnimationFrame=prevCancel;dom.window.close();}
});
