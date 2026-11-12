import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession,betCommit,betResolve,betOdds} from '../src/betting/ledger.js';
import {bettingOpen,bettingPreview,bettingHud,bettingResults} from '../src/betting/ui.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';

function setup(){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://betting.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  initializeGame({entry:'setup'});
  ctx.betting=betNewSession(['А','Б'],100);
  ctx.betting.players[0].balance-=20;ctx.betting.jackpot=20;
  return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
const draft=[{player:0,robot:0,amount:20},{player:1,robot:1,amount:40}];

test('preview, fight HUD and results keep the jackpot separate from stakes and odds',()=>{
  const dom=setup();try{
    bettingOpen();
    for(const bet of draft){const row=ctx.betContent.querySelector(`[data-bet-player="${bet.player}"]`);row.querySelector('input').value=bet.amount;row.querySelector('select').value=bet.robot;}
    bettingPreview();
    assert.equal(ctx.betContent.querySelector('#bet-bank').textContent.replace(/\D/g,''),'60');
    assert.equal(ctx.betContent.querySelector('#bet-odds-0').textContent,'×2,70');
    assert.equal(ctx.betContent.querySelector('#bet-odds-1').textContent,'×1,43');
    assert.equal(ctx.betContent.querySelector('#bet-odds-2').textContent,'нет ставок');
    betCommit(ctx.betting,draft);bettingHud();
    assert.match(ctx.betHud.querySelector('.bet-hud-bank').textContent,/Ставки раунда: 60.*Джекпот: 20/);
    betResolve(ctx.betting,0);bettingHud();bettingResults();
    assert.match(ctx.betHud.querySelector('.bet-hud-bank').textContent,/Ставки раунда: 60.*Джекпот: 26/);
    assert.match(document.querySelector('#bet-result-summary').textContent,/В джекпот за раунд: \+6/);
    assert.equal(betOdds(100,100),1);assert.equal(betOdds(0,0),null);
  }finally{close(dom);}
});

test('old and new running saves refund stakes and preserve the jackpot on reload exactly once',()=>{
  const dom=setup();try{
    for(const legacy of [false,true]){
      ctx.betting=betNewSession(['А','Б'],100);ctx.betting.players[0].balance=80;ctx.betting.jackpot=20;
      betCommit(ctx.betting,draft);
      if(legacy){ctx.betting.lockedJackpot=ctx.betting.jackpot;ctx.betting.jackpot=0;}
      bettingSave();ctx.betting=bettingLoad();assert.ok(ctx.betting);
      assert.equal(ctx.betting.phase,'betting');assert.deepEqual(ctx.betting.players.map(p=>p.balance),[80,100]);
      assert.equal(ctx.betting.jackpot,20);assert.equal(ctx.betting.lockedJackpot,0);
      bettingSave();assert.deepEqual(bettingLoad(),ctx.betting);
    }
  }finally{close(dom);}
});

test('settled version-1 history remains readable and does not issue a second payout',()=>{
  const dom=setup();try{
    betCommit(ctx.betting,draft);betResolve(ctx.betting,0);
    // Old receipts included the carried jackpot in bank and had no jackpotAdded.
    ctx.betting.players[0].balance=140;ctx.betting.jackpot=0;
    const receipt=ctx.betting.lastResult;
    receipt.bank=80;receipt.jackpot=0;receipt.rows[0].balance=140;receipt.rows[0].payout=80;
    receipt.message='Банк распределён пропорционально ставкам на победителя.';
    delete receipt.jackpotAdded;
    bettingSave();ctx.betting=bettingLoad();assert.ok(ctx.betting);
    const balances=ctx.betting.players.map(p=>p.balance);
    bettingResults();assert.match(document.querySelector('#bet-result-summary').textContent,/СТАВКИ РАУНДА 60/);
    assert.doesNotMatch(document.querySelector('#bet-result-summary').textContent,/undefined|NaN/);
    assert.equal(betResolve(ctx.betting,0),null);bettingOpen();
    assert.deepEqual(ctx.betting.players.map(p=>p.balance),balances);assert.equal(ctx.betting.round,2);
    assert.ok(bettingLoad());
  }finally{close(dom);}
});

test('jackpot progress and bonus receipts survive reload, and malformed rollback snapshots are rejected',()=>{
 const dom=setup();try{
  ctx.betting.jackpotRounds=4;
  betCommit(ctx.betting,draft);betResolve(ctx.betting,0);bettingSave();
  ctx.betting=bettingLoad();assert.ok(ctx.betting);
  assert.equal(ctx.betting.jackpotRounds,0);assert.equal(ctx.betting.lastResult.jackpotPaid,5);
  bettingResults();assert.match(document.querySelector('#bet-result-summary').textContent,/Выплачено из джекпота: 5/);
  bettingOpen();assert.match(ctx.betContent.querySelector('[data-jackpot-status]').textContent,/через 5/);
  betCommit(ctx.betting,draft);
  ctx.betting.roundSnapshot.garage[0].investments={'99':10};bettingSave();
  assert.equal(bettingLoad(),null);
 }finally{close(dom);}
});
