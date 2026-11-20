import test from 'node:test';
import assert from 'node:assert/strict';
import {towerRarityScenario,TOWER_RARITY_SCENARIO_STEPS} from '../src/tower/rarity-scenarios.js';
import {towerMutationBonus,towerMutationCombatBonus,towerRarityMultiplier} from '../src/tower/mutations.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8);
test('proposed 8/10/12% steps stay linear and cap at rank five',()=>{
 assert.deepEqual(TOWER_RARITY_SCENARIO_STEPS,[.08,.1,.12]);
 for(const s of TOWER_RARITY_SCENARIO_STEPS){
  near(towerRarityMultiplier(0,s),1);
  near(towerRarityMultiplier(5,s),1+5*s);
  near(towerRarityMultiplier(200,s),1+5*s);
 }
});
test('base rarity matches current live modifiers without enabling rarity combat',()=>{
 const types=['turbo','piston','optic','synapse','quiet','metronome'];
 const original=towerMutationBonus(types),attack=towerMutationCombatBonus(types);
 const x=towerRarityScenario(types.map(type=>({type,rarity:0})),.12);
 original.forEach((n,i)=>near(n,x.effective[i]));
 near(x.crit,attack.crit);near(x.cooldownMultiplier,attack.cooldownMultiplier);
});
test('family synergies are not rarity-scaled and duplicate types never stack',()=>{
 const values=['turbo','piston'].map(type=>({type,rarity:5}));
 const a=towerRarityScenario(values,.08),b=towerRarityScenario(values,.12);
 assert.deepEqual(a.synergy,[.2,0,.2]);assert.deepEqual(b.synergy,a.synergy);
 near(a.direct[0],.55*1.4);near(b.direct[0],.55*1.6);
 const alone=towerRarityScenario([{type:'piston',rarity:5}],.12);
 const repeated=towerRarityScenario([{type:'piston',rarity:0},{type:'piston',rarity:5}],.12);
 assert.deepEqual(alone,repeated);
 assert.throws(()=>towerRarityScenario([{type:'piston',rarity:6}],.12));
});
test('crit and attack-cooldown hard limits remain intact',()=>{
 const types=['optic','focus','quiet','flywheel','metronome','synapse'];
 const x=towerRarityScenario(types.map(type=>({type,rarity:5})),.12);
 near(x.crit,.10);assert.equal(x.critAtCap,true);
 assert.ok(x.cooldownMultiplier>=.75);
});
