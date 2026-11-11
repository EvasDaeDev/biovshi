import test from 'node:test';
import assert from 'node:assert/strict';
import { betNewSession, betCommit, betResolve, betRefund } from '../src/betting/ledger.js';

const total = s => s.players.reduce((n,p)=>n+p.balance,0)+s.jackpot+(s.phase==='running'?s.lockedJackpot+s.bets.reduce((n,b)=>n+b.amount,0):0);
const bets = (amounts, robots) => amounts.map((amount,player)=>({player,amount,robot:robots[player]}));

test('payouts conserve chips, rounding becomes a jackpot, settlement happens once', () => {
  const s = betNewSession(['А','Б','В'],100);
  betCommit(s,bets([1,2,1],[0,0,1]));
  assert.equal(total(s),300);
  const result = betResolve(s,0);
  assert.deepEqual(result.rows.map(r=>r.payout),[1,2,0]);
  assert.equal(s.jackpot,1);
  assert.equal(total(s),300);
  const settled = JSON.stringify(s);
  assert.equal(betResolve(s,0),null);
  assert.equal(JSON.stringify(s),settled);
});

test('unbacked winner carries the bank; cancellation restores stakes and the previous jackpot', () => {
  const s = betNewSession(['А','Б'],100);
  betCommit(s,bets([10,20],[0,1]));
  betResolve(s,3);
  assert.equal(s.jackpot,30);
  s.phase='betting';s.round++;
  betCommit(s,bets([5,5],[0,1]));
  assert.equal(total(s),200);
  assert.equal(betRefund(s),true);
  assert.deepEqual(s.players.map(p=>p.balance),[90,80]);
  assert.equal(s.jackpot,30);
  assert.equal(betRefund(s),false);
  assert.equal(total(s),200);
});

test('draw returns stakes; invalid bets do not change balances', () => {
  const s = betNewSession(['А','Б'],100);
  const before=JSON.stringify(s);
  assert.throws(()=>betCommit(s,bets([101,10],[0,1])));
  assert.equal(JSON.stringify(s),before);
  assert.throws(()=>betCommit(s,bets([1.5,10],[0,1])));
  betCommit(s,bets([10,20],[0,1]));
  betResolve(s,null);
  assert.deepEqual(s.players.map(p=>p.balance),[100,100]);
  assert.equal(total(s),200);
});

test('four equal bets pay 355 and add 45 without touching an existing jackpot', () => {
  const s=betNewSession(['А','Б','В','Г'],200);
  for(const p of s.players)p.balance-=50;
  s.jackpot=200;
  betCommit(s,bets([100,100,100,100],[0,1,2,3]));
  assert.equal(s.jackpot,200);assert.equal(s.lockedJackpot,0);
  const result=betResolve(s,0);
  assert.deepEqual(result.rows.map(r=>r.payout),[355,0,0,0]);
  assert.equal(result.bank,400);assert.equal(result.jackpotAdded,45);
  assert.equal(s.jackpot,245);assert.equal(total(s),800);
});

test('everyone backing the winner gets exactly their own stake back', () => {
  const s=betNewSession(['А','Б','В'],100);
  s.players[0].balance-=20;s.jackpot=20;
  betCommit(s,bets([20,50,100],[0,0,0]));
  const r=betResolve(s,0);
  assert.deepEqual(r.rows.map(r=>r.payout),[20,50,100]);
  assert.equal(r.jackpotAdded,0);assert.equal(s.jackpot,20);assert.equal(total(s),300);
});

test('multiple winners split only 85 percent of losing stakes and retain rounding', () => {
  const s=betNewSession(['А','Б','В'],100);
  betCommit(s,bets([10,20,100],[0,0,1]));
  const r=betResolve(s,0);
  assert.deepEqual(r.rows.map(r=>r.payout),[38,76,0]);
  assert.equal(r.jackpotAdded,16);assert.equal(total(s),300);
});

test('a lone player cannot claim the jackpot; zero bets and draws preserve it', () => {
  const s=betNewSession(['А'],100);s.players[0].balance=60;s.jackpot=40;
  for(const [amount,winner] of [[20,0],[0,1],[20,null]]){
    s.phase='betting';betCommit(s,bets([amount],[0]));
    const r=betResolve(s,winner);
    assert.equal(r.rows[0].payout,amount);assert.equal(s.jackpot,40);assert.equal(total(s),100);
  }
});

test('all credits remain accounted for across many rounds at the maximum chip supply', () => {
  const s=betNewSession(Array.from({length:16},(_,i)=>String(i)),1000000);
  for(let round=0;round<200;round++){
    s.phase='betting';
    const draft=s.players.map(p=>({player:p.id,amount:Math.floor(p.balance*((round+p.id)%5)/4),robot:(p.id+round)%4}));
    const before=s.jackpot;
    betCommit(s,draft);assert.equal(total(s),16000000);
    const r=betResolve(s,round%7===0?null:round%4);
    assert.equal(total(s),16000000);assert.ok(s.jackpot>=before);
    assert.ok(r.rows.reduce((sum,r)=>sum+r.payout,0)<=r.stakes);
    for(const row of r.rows){assert.ok(Number.isSafeInteger(row.payout));if(row.robot===r.winner)assert.ok(row.payout>=row.stake);}
  }
});
