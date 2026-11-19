import test from 'node:test';
import assert from 'node:assert/strict';
import {wilson,physicalEconomyReport,physicalEconomyMarkdown,H5_POLICIES} from '../scripts/report-tower-physical-economy.mjs';
function batch(policy,cycleTactics){
 return {policyKey:policy,cycleTactics,runs:[0,1].map(i=>({
  floor:(cycleTactics?30:0)+(i?5:3),seed:142+i,kind:i?'boss':'normal',
  errors:[],nonFinite:0,friendlyHits:0,coins:i?100:15,
  personalEliminations:i+1,completed:i===0,winner:i===0?0:null,
  patientHitsOnBoss:0
 }))};
}
const fixture=()=>H5_POLICIES.flatMap(p=>[false,true].map(c=>batch(p,c)));
test('Wilson intervals reflect sample uncertainty and reject invalid counts',()=>{
 assert.deepEqual(wilson(0,20),[0,.16]);
 assert.deepEqual(wilson(20,20),[.84,1]);
 assert.throws(()=>wilson(1,0));
});
test('physical data compares policies on matching floors and seeds without treating timeouts as losses',()=>{
 const result=physicalEconomyReport(fixture());
 assert.equal(result.fightCount,12);
 const row=result.groups.find(g=>g.policy==='orbit'&&g.scope==='first'&&g.kind==='all');
 assert.equal(row.finished,1);assert.equal(row.timedOut,1);assert.equal(row.won,1);
 assert.equal(row.coinsMedian,15);assert.equal(row.killsPerFight,1.5);
 assert.match(physicalEconomyMarkdown(result),/НЕ статистика людей/);
 const noWinner=fixture();noWinner[0].runs[0].winner=null;
 const settled=physicalEconomyReport(noWinner);
 const cohort=settled.groups.find(g=>g.policy==='approach'&&g.scope==='first'&&g.kind==='all');
 assert.equal(cohort.finished,1);
 assert.equal(cohort.won,0);
 assert.equal(cohort.withoutWinner,1,'finished patient-defeat without a winner is valid');
});
test('reject duplicate, inconsistent or incomplete physical evidence',()=>{
 let b=fixture();b[0].runs[0].coins=-1;
 assert.throws(()=>physicalEconomyReport(b),/Invalid rewards/);
 b=fixture();b[2].runs[0].seed=999;
 assert.throws(()=>physicalEconomyReport(b),/Mismatch/);
 b=fixture();b[1].runs[0].friendlyHits=1;
 assert.throws(()=>physicalEconomyReport(b),/Physics failed/);
 b=fixture();b[0].runs.push({...b[0].runs[0]});
 assert.throws(()=>physicalEconomyReport(b),/Duplicated/);
});
