import test from 'node:test';
import assert from 'node:assert/strict';
import {towerRarityScenario} from '../src/tower/rarity-scenarios.js';
import {towerMutationSnapshot,towerMutationCombatBonus,towerMutationBonus} from '../src/tower/mutations.js';
import {patientCombatStats} from '../src/game/patients.js';
import {towerFighterCombatBonus} from '../src/systems/combat.js';
import {ctx} from '../src/game/state.js';
import {H8_LOADOUTS,H8_FLOORS,H8_STEPS,compareH8,h8Markdown} from '../scripts/report-tower-rarity-physics.mjs';

test('temporary H8 rarity affects only the test patient and preserves normal gameplay',()=>{
 const saved={mode:ctx.mode,towerGarage:ctx.towerGarage,robots:ctx.robots};
 const types=H8_LOADOUTS.neural;
 const patient={stats:[3,3,3],mutations:[...types],surgeries:[],prosthetics:[]};
 try{
  ctx.mode='tower';ctx.towerGarage=[patient];ctx.robots=[];
  const normal=patientCombatStats(0,null);
  const normalCombat=towerFighterCombatBonus(0);
  assert.deepEqual(normal.mutationBonus,towerMutationBonus(types));
  assert.deepEqual(normalCombat,towerMutationCombatBonus(types));
  const proposal=towerRarityScenario(types.map(type=>({type,rarity:5})),.12);
  patient.rarityPhysics={effective:proposal.effective,crit:proposal.crit,cooldownMultiplier:proposal.cooldownMultiplier};
  const boosted=patientCombatStats(0,null);
  assert.deepEqual(boosted.mutationBonus,proposal.effective);
  assert.deepEqual(towerFighterCombatBonus(0),{
   crit:proposal.crit,cooldownMultiplier:proposal.cooldownMultiplier
  });
  assert.deepEqual(patient.stats,[3,3,3]);
  delete patient.rarityPhysics;
  assert.deepEqual(patientCombatStats(0,null),normal);
  assert.deepEqual(towerFighterCombatBonus(0),normalCombat);
 }finally{
  for(const [key,val] of Object.entries(saved)){
   if(val===undefined)delete ctx[key];else ctx[key]=val;
  }
 }
});
function fixture(step){
 const runs=H8_FLOORS.flatMap(floor=>Object.keys(H8_LOADOUTS).flatMap(preset=>[1,2].map(seed=>{
  const types=H8_LOADOUTS[preset],rank=Math.min(5,Math.floor((floor-1)/30));
  const live={effective:towerMutationBonus(types),...towerMutationCombatBonus(types)};
  const p=step===0?live:towerRarityScenario(types.map(type=>({type,rarity:rank})),step);
  const compared={effective:p.effective,crit:p.crit,cooldownMultiplier:p.cooldownMultiplier};
  return {floor,seed,kind:'normal',errors:[],nonFinite:0,friendlyHits:0,
   initialPenetrations:0,initialOverlaps:0,maxBodyOverlapCm:.3,
   completed:false,winner:null,playerAlive:true,playerHits:2,playerSwings:5,
   personalEliminations:1,coins:15,
   rarityCompare:{step,preset,rank,live,proposed:compared,actual:compared}
  };
 })));
 return {rarityCompare:true,rarityStep:step,policy:'orbit',seconds:65,runs};
}
test('H8 physical report checks 48 actual paired scenario results',()=>{
 const report=compareH8(H8_STEPS.map(fixture));
 assert.equal(report.totalFights,48);
 assert.equal(report.pairedCases,12);
 assert.deepEqual(report.totals.map(t=>t.playerHits),[24,24,24,24]);
 assert.equal(report.groups.length,24);
 assert.match(h8Markdown(report),/48 парных физических/);
});
test('H8 physics report rejects missing pairs, invalid bonus application and ally damage',()=>{
 const copies=()=>H8_STEPS.map(fixture);
 let x=copies();x[1].runs[0].seed=99;
 assert.throws(()=>compareH8(x),/Unpaired/);
 x=copies();x[2].runs[0].rarityCompare.actual.crit=.444;
 assert.throws(()=>compareH8(x),/not physically applied/);
 x=copies();x[3].runs[0].friendlyHits=1;
 assert.throws(()=>compareH8(x),/Physical safety regression/);
 x=copies();x[1].runs.push({...x[1].runs[0]});
 assert.throws(()=>compareH8(x),/twelve fights/);
});
