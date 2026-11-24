import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {STARTING_CAPITAL,betNewSession,betAddPlayer,betTopUp} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';

function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://capital.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};ctx.arenaRenderer=null;
 initializeGame({entry:'setup'});
 return {dom,close(){ctx.root.__disposeTag();dom.window.close();}};
}

test('new games default to 2000 coins per player and later participants receive the same amount',()=>{
 assert.equal(STARTING_CAPITAL,2000);
 const s=betNewSession(['Первый','Второй']);assert.equal(s.capital,2000);assert.deepEqual(s.players.map(p=>p.balance),[2000,2000]);
 assert.equal(betAddPlayer(s,'Третий').balance,2000);assert.equal(s.topUps,0);
});

test('setup displays fixed capital and never uses a modified capital field',()=>{
 const f=setup();try{
  const doc=f.dom.window.document,output=doc.querySelector('#bet-capital');
  assert.equal(output.tagName,'OUTPUT');assert.equal(output.textContent,'2000');
  assert.equal(doc.querySelector('input#bet-capital'),null);
  // Reintroducing the former editable field cannot alter interactive game issuance.
  const injected=doc.createElement('input');injected.id='bet-capital';injected.value='999999';output.replaceWith(injected);
  doc.querySelector('#bet-setup-form').dispatchEvent(new f.dom.window.Event('submit',{cancelable:true}));
  assert.equal(ctx.betting.capital,2000);assert.ok(ctx.betting.players.every(p=>p.balance===2000));
  assert.equal(ctx.betting.topUps,0);assert.ok(bettingLoad());
 }finally{f.close();}
});

test('historical capitals and topups migrate only once while new manual topups are always rejected',()=>{
 const f=setup();try{
  const old=betNewSession(['Старый игрок'],100);old.players[0].balance=175;old.topUps=75;delete old.economyVersion;
  ctx.betting=old;bettingSave();const loaded=bettingLoad();
  assert.ok(loaded);assert.equal(loaded.capital,1000);assert.equal(loaded.players[0].balance,1750);assert.equal(loaded.topUps,750);
  assert.deepEqual(bettingLoad(),loaded);
  for(const phase of ['betting','running','settled']){
   loaded.phase=phase;const before=JSON.stringify(loaded);
   assert.throws(()=>betTopUp(loaded,0,100),/отключено/);assert.equal(JSON.stringify(loaded),before);
  }
 }finally{f.close();}
});
