import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession,betAddPlayer,betCommit,betResolve} from '../src/betting/ledger.js';
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
  if(dialog.isConnected){assert.equal(dialog.querySelector('input').checkValidity(),false);dialog.querySelector('[data-cancel]').click();}
 }
 await Promise.resolve();
}
const total=s=>s.players.reduce((sum,p)=>sum+p.balance,0)+s.jackpot+s.shopSpent+(s.phase==='running'?s.lockedJackpot+s.bets.reduce((sum,b)=>sum+b.amount,0):0);

test('joining a later round preserves existing money and history, survives reload and pays proportional winnings',()=>{
 const dom=setup();try{
  const s=ctx.betting;
  // Legacy session with a historical free top-up.
  s.players[0].balance+=20;s.topUps=20;betCommit(s,[{player:0,robot:0,amount:20},{player:1,robot:1,amount:30}]);
  betResolve(s,2);assert.equal(s.jackpot,50);
  const previous=structuredClone(s);bettingOpen();
  const player=betAddPlayer(s,'  Третий  ');
  const {archiveNotes,unreadArchiveNoteIds,...details}=player;
  assert.deepEqual(details,{id:2,name:'Третий',balance:100,floorKey:'2',towerBattles:0,towerKnockouts:0});
  assert.equal(archiveNotes.length,1);
  assert.deepEqual(unreadArchiveNoteIds,archiveNotes);
  assert.ok(archiveNotes[0]>=1&&archiveNotes[0]<=52);
  assert.deepEqual(s.players.slice(0,2),previous.players);assert.deepEqual(s.history,previous.history);
  assert.equal(s.jackpot,previous.jackpot);assert.deepEqual(s.garage,previous.garage);
  assert.equal(total(s),s.players.length*s.capital+s.topUps);
  bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.deepEqual(loaded,s);
  betCommit(loaded,[{player:0,robot:0,amount:10},{player:1,robot:1,amount:10},{player:2,robot:0,amount:20}]);
  const result=betResolve(loaded,0);
  assert.equal(result.rows[0].payout,12);assert.equal(result.rows[2].payout,25);
  assert.equal(loaded.jackpot,53);
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
  assert.equal(row.querySelector('td').textContent,'<img src=x onerror=alert(1)>');assert.equal(row.firstElementChild.querySelector('img'),null);
  assert.equal(row.querySelector('input').value,'0');assert.equal(row.querySelector('input').max,'100');
  assert.equal(row.querySelector('[data-top-up]'),null);
  row.querySelector('[data-share="0.5"]').click();assert.equal(row.querySelector('input').value,'50');
  assert.equal(ctx.betting.players[2].balance,100);
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
 s.phase='betting';s.topUps=159999900;const before=JSON.stringify(s);
 assert.throws(()=>betAddPlayer(s,'Два'));assert.equal(JSON.stringify(s),before);
});

test('removing a profile keeps the other Tower run, its floor key, and the shared ledger on reload',async()=>{
 const {removeProfile}=await import('../src/betting/profiles.js');
 const {towerFor,completeTower,rewardTower,buyTowerInsurance}=await import('../src/tower/model.js');
 const {buyHat}=await import('../src/garage/model.js');
 const dom=setup();
 try{
  const session=ctx.betting=betNewSession(['Первый','Второй']);
  const second=towerFor(session,1);
  rewardTower(session,1,1,0);
  completeTower(session,1,true,()=>.99);
  buyTowerInsurance(session,1);
  buyHat(session,0,0,1,100);
  buyHat(session,1,1,2,100);
  session.towerPlayerId=1;
  const balance=session.players[1].balance;
  const archive=[...session.players[1].archiveNotes];
  removeProfile(session,0);
  assert.equal(session.towerPlayerId,0);
  assert.equal(session.garage[0].head.player,null);
  assert.equal(session.garage[1].head.player,0);
  assert.equal(session.garage[1].patron,0);
  assert.equal(session.towers[0],second);
  const newcomer=betAddPlayer(session,'Третий');
  assert.equal(newcomer.id,1);
  assert.equal(newcomer.floorKey,'2');
  bettingSave();const saved=bettingLoad();
  assert.ok(saved);
  assert.equal(saved.players[0].floorKey,'1');
  assert.equal(saved.players[0].balance,balance);
  assert.deepEqual(saved.players[0].archiveNotes,archive);
  assert.equal(saved.players[0].towerBattles,1);
  assert.equal(saved.players[0].towerKnockouts,1);
  assert.equal(saved.towers[0].insurance.checkpoint.level,2);
 }finally{ctx.root.__disposeTag();dom.window.close();}
});
