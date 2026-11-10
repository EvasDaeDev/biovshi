import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession,betAddPlayer,betTopUp,betCommit,betResolve} from '../src/betting/ledger.js';
import {bettingOpen} from '../src/betting/ui.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';

function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://biovshi.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});
 ctx.betting=betNewSession(['Один','Два'],100);bettingOpen();
 return dom;
}
async function answerDialog(value) {
 const dialog=document.querySelector('.betting-input-dialog');
 assert.ok(dialog,'expected a betting input dialog');
 if(value===null){dialog.querySelector('[data-cancel]').click();}
 else {
  dialog.querySelector('input').value=value;
  dialog.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 }
 await Promise.resolve();
}
const total=s=>s.players.reduce((sum,p)=>sum+p.balance,0)+s.jackpot+s.shopSpent+(s.phase==='running'?s.lockedJackpot+s.bets.reduce((sum,b)=>sum+b.amount,0):0);

test('joining a later round preserves existing money and history, survives reload and pays proportional winnings',()=>{
 const dom=setup();try{
  const s=ctx.betting;
  betTopUp(s,0,20);betCommit(s,[{player:0,robot:0,amount:20},{player:1,robot:1,amount:30}]);
  betResolve(s,2);assert.equal(s.jackpot,50);
  const previous=structuredClone(s);bettingOpen();
  const player=betAddPlayer(s,'  Третий  ');
  assert.deepEqual(player,{id:2,name:'Третий',balance:100});
  assert.deepEqual(s.players.slice(0,2),previous.players);assert.deepEqual(s.history,previous.history);
  assert.equal(s.jackpot,previous.jackpot);assert.deepEqual(s.garage,previous.garage);
  assert.equal(total(s),s.players.length*s.capital+s.topUps);
  bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.deepEqual(loaded,s);
  betCommit(loaded,[{player:0,robot:0,amount:10},{player:1,robot:1,amount:10},{player:2,robot:0,amount:20}]);
  const result=betResolve(loaded,0);
  assert.equal(result.rows[0].payout,30);assert.equal(result.rows[2].payout,60);
  assert.equal(total(loaded),loaded.players.length*loaded.capital+loaded.topUps);
 }finally{dom.window.close();}
});

test('adding a player preserves actual draft fields and arena choice, escapes the name and binds the new row',async()=>{
 const dom=setup();try{
  const rows=ctx.betContent.querySelectorAll('[data-bet-player]');
  rows[0].querySelector('input').value='23';rows[0].querySelector('select').value='3';
  rows[1].querySelector('input').value='';ctx.selectedArenaId='ring';
  ctx.betContent.querySelector('#bet-add-player').click();
  await answerDialog('<img src=x onerror=alert(1)>');
  assert.equal(ctx.betting.players.length,3);
  assert.equal(ctx.betContent.querySelectorAll('[data-bet-player]')[0],rows[0]);
  assert.equal(rows[0].querySelector('input').value,'23');assert.equal(rows[0].querySelector('select').value,'3');
  assert.equal(rows[1].querySelector('input').value,'');assert.equal(ctx.selectedArenaId,'ring');
  const row=ctx.betContent.querySelector('[data-bet-player="2"]');
  assert.equal(row.querySelector('td').textContent,'<img src=x onerror=alert(1)>');assert.equal(row.querySelector('img'),null);
  assert.equal(row.querySelector('input').value,'0');assert.equal(row.querySelector('input').max,'100');
  row.querySelector('[data-top-up]').click();await answerDialog('25');
  assert.equal(ctx.betting.players[2].balance,125);assert.equal(row.querySelector('input').max,'125');
  assert.ok(bettingLoad());
 }finally{dom.window.close();}
});

test('cancelled and invalid names leave the session untouched; the UI stops at 16 players',async()=>{
 const dom=setup();try{
  const before=JSON.stringify(ctx.betting),button=ctx.betContent.querySelector('#bet-add-player');
  for(const value of [null,'   ','x'.repeat(33)]){
   button.click();await answerDialog(value);assert.equal(JSON.stringify(ctx.betting),before);
  }
  while(ctx.betting.players.length<16){button.click();await answerDialog('Новый '+ctx.betting.players.length);}
  assert.equal(button.disabled,true);button.click();assert.equal(ctx.betting.players.length,16);
 }finally{dom.window.close();}
});

test('join rejects closed rounds, invalid names and chip emission overflow without mutation',()=>{
 const s=betNewSession(['Один'],100);
 for(const name of ['',null,'x'.repeat(33)])assert.throws(()=>betAddPlayer(s,name));
 s.phase='running';assert.throws(()=>betAddPlayer(s,'Два'));s.phase='settled';assert.throws(()=>betAddPlayer(s,'Два'));
 s.phase='betting';s.topUps=15999900;const before=JSON.stringify(s);
 assert.throws(()=>betAddPlayer(s,'Два'));assert.equal(JSON.stringify(s),before);
});
