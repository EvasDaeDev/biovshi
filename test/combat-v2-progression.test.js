import test from 'node:test';
import assert from 'node:assert/strict';
import {earnedStats,validStats,newGarage,patientVictory,patientDeath,statMultiplier,critChance,setPatientStats} from '../src/garage/model.js';

test('victories increase strength, speed, then maneuverability',()=>{
  const p=newGarage()[0];
  const expected=[[3,4,3],[4,4,3],[4,4,4],[4,5,4],[5,5,4],[5,5,5],[5,6,5],[6,6,5],[6,6,6]];
  for(const stats of expected){patientVictory(p);assert.deepEqual(p.stats,stats);}
  assert.equal(p.wins,9);
});

test('garage may move one point, but cannot mint points or stack transfers',()=>{
  assert.equal(validStats([4,2,3]),true);
  assert.equal(validStats([5,1,3]),false);
  assert.equal(validStats([4,4,1]),false);
  assert.equal(validStats([6,5,5],6),false);
  assert.equal(validStats([6,4,5],6),true);
  const s={phase:'betting',garage:newGarage(),players:[{id:0}]};
  setPatientStats(s,0,0,[4,2,3]);
  assert.deepEqual(s.garage[0].stats,[4,2,3]);
  assert.throws(()=>setPatientStats(s,0,0,[5,1,3]));
});

test('earned stat point preserves existing one-point garage shift',()=>{
  const p=newGarage()[0];
  p.stats=[4,2,3];
  patientVictory(p);
  assert.deepEqual(p.stats,[4,3,3]);
  assert.deepEqual(earnedStats(1),[3,4,3]);
  assert.equal(validStats(p.stats,p.wins),true);
});

test('death resets progression and cosmetics; unconsciousness does not',()=>{
  const p=newGarage()[0];
  p.head={hat:1,price:10,player:0};
  patientVictory(p);
  patientDeath(p);
  assert.deepEqual(p.stats,[3,3,3]);
  assert.equal(p.wins,0);
  assert.equal(p.head,null);
});

test('multipliers and crit chances follow the agreed diminishing returns table',()=>{
  const speed=[.8,1,1.2,1.35,1.5,1.6,1.7,1.8];
  const crit=[0,.15,.30,.38,.45,.50,.55,.60];
  for(let points=2;points<=9;points++){
    assert.ok(Math.abs(statMultiplier(points)-speed[points-2])<1e-9);
    assert.ok(Math.abs(critChance(points)-crit[points-2])<1e-9);
  }
});
