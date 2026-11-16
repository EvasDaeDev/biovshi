import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {playerBalanceMarkup,counterValue,trackPlayerBalances,COUNTER_DURATION_MS} from '../src/ui/currency-animation.js';

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
