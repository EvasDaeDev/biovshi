import test from 'node:test';
import assert from 'node:assert/strict';
import {H8_STEPS,H8_FLOORS,H8_LOADOUTS} from '../scripts/report-tower-rarity-physics.mjs';
import {H8_EXT_POLICIES,summarizeExtendedH8,extendedH8Markdown} from '../scripts/report-tower-h8-extended.mjs';
import {towerRarityScenario} from '../src/tower/rarity-scenarios.js';
import {towerMutationBonus,towerMutationCombatBonus} from '../src/tower/mutations.js';

function batch(policy,step){
 const runs=H8_FLOORS.flatMap(floor=>Object.entries(H8_LOADOUTS).flatMap(([preset,types])=>
  Array.from({length:4},(_,seed)=>{
   const rarity=Math.min(5,Math.floor((floor-1)/30)),live={
    effective:towerMutationBonus(types),...towerMutationCombatBonus(types)
   };
   const value=step===0?live:towerRarityScenario(types.map(type=>({type,rarity})),step);
   const props={effective:[...value.effective],crit:value.crit,cooldownMultiplier:value.cooldownMultiplier};
   return {floor,kind:'normal',seed:seed+1579,arena:'columns',errors:[],
    nonFinite:0,friendlyHits:0,initialPenetrations:0,initialOverlaps:0,maxBodyOverlapCm:.6,
    duration:seed===0?23:60,completed:seed===0,winner:seed===0?null:null,playerAlive:seed!==0,
    playerHits:step===.12?3:2,playerSwings:6,personalEliminations:1,
    coins:step===.12?30:15,
    rarityCompare:{preset,step,rank:rarity,live,proposed:props,actual:{...props}}
   };
  })));
 return {policyKey:policy,rarityCompare:true,rarityStep:step,seconds:60,seeds:4,runs};
}
const data=()=>H8_EXT_POLICIES.flatMap(policy=>H8_STEPS.map(step=>batch(policy,step)));
test('extended H8 compares 288 real-physics shape records with 24 shared contexts',()=>{
 const result=summarizeExtendedH8(data());
 assert.equal(result.numberOfPhysicalFights,288);
 assert.equal(result.pairedContexts,24);
 assert.equal(result.seedsPerFloorAndLoadout,4);
 assert.equal(result.perPolicy.length,12);
 assert.equal(result.perRank.length,36);
 assert.equal(result.perLoadout.length,24);
 const base=result.perPolicy.find(r=>r.policy==='approach'&&r.step===0);
 const boost=result.perPolicy.find(r=>r.policy==='approach'&&r.step===.12);
 assert.equal(base.bouts,24);
 assert.equal(base.finished,6);
 assert.equal(base.censored,18);
 assert.equal(base.playerWins,0);
 assert.equal(base.playerAliveAtCutoff,18);
 assert.equal(base.hits,48);
 assert.equal(boost.hits,72);
 assert.equal(boost.pairedHitDifferenceAverage,1);
 assert.deepEqual([boost.moreHits,boost.fewerHits,boost.equalHits],[24,0,0]);
 assert.equal(boost.pairedCoinDifferenceAverage,15);
 assert.match(extendedH8Markdown(result),/288 отдельных боёв/);
});
test('H8 extended preserves rank-five cap and checks actual boost applied',()=>{
 const result=summarizeExtendedH8(data());
 assert.ok(result.perRank.some(r=>r.floor===181&&r.rank===5));
 let batches=data();
 const chosen=batches.find(r=>r.policyKey==='orbit'&&r.rarityStep===.1);
 chosen.runs[0].rarityCompare.actual.crit=.789;
 assert.throws(()=>summarizeExtendedH8(batches),/actual fighter bonus differs/);
});
test('H8 extended detects unpaired seeds, duplicates and missing samples',()=>{
 let b=data();b.find(r=>r.policyKey==='evade'&&r.rarityStep===.08).runs[0].seed=123456;
 assert.throws(()=>summarizeExtendedH8(b),/seed\/floor\/loadout pairing differs|Missing seeds/);
 b=data();b[0].runs[1].seed=b[0].runs[0].seed;
 assert.throws(()=>summarizeExtendedH8(b),/Duplicate/);
 b=data();b[2].runs.pop();
 assert.throws(()=>summarizeExtendedH8(b),/exactly 24 physical fights/);
});
test('H8 extended rejects invalid physics and protects timed-out fights from defeat labels',()=>{
 let b=data();
 b[0].runs[0].friendlyHits=1;
 assert.throws(()=>summarizeExtendedH8(b),/physics safety regression/);
 b=data();b[0].runs[0].playerHits=99;
 assert.throws(()=>summarizeExtendedH8(b),/Missing or inconsistent/);
 b=data();b[1].runs[1].winner=1;
 assert.throws(()=>summarizeExtendedH8(b),/Winner in unfinished fight/);
});
