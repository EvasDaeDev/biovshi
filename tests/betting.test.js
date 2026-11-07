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
