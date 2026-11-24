import test from 'node:test';
import assert from 'node:assert/strict';
import {simulateTowerProgression,progressionMatrix,progressionMarkdown,
 PROGRESSION_POLICIES,PROGRESSION_PRICE_MODELS} from '../scripts/simulate-tower-progression.mjs';
import {COIN_SCALE} from '../src/betting/coins.js';
import {STARTING_CAPITAL} from '../src/betting/ledger.js';
import {towerMutationInstallPrice} from '../src/tower/mutations.js';
const base={seed:12,policy:PROGRESSION_POLICIES[1],model:PROGRESSION_PRICE_MODELS[1],rarityStep:.12,maxFights:80};
test('default price scenario equals current game installation formula',()=>{
 for(let n=0;n<6;n++)assert.equal(
  Math.ceil(PROGRESSION_PRICE_MODELS[1].first*PROGRESSION_PRICE_MODELS[1].growth**n)*COIN_SCALE,
  towerMutationInstallPrice({modInstallations:n}));
});
test('repeatable scenarios audit the ledger and preserve six-slot limit',()=>{
 const first=simulateTowerProgression(base);
 assert.deepEqual(first,simulateTowerProgression(base));
 assert.equal(first.bank+first.spent,STARTING_CAPITAL+first.earned);
 assert.ok(first.bank>=0&&first.installed<=6&&first.fights<=80);
 assert.ok(first.returns+first.resets<=first.losses);
});
test('without explicit policy decision DMS never charges or restores',()=>{
 const x=simulateTowerProgression({...base,policy:{...PROGRESSION_POLICIES[0],insurance:0}});
 assert.equal(x.insurancePurchases,0);
 assert.equal(x.insuranceRenewals,0);
 assert.equal(x.returns,0);
});
test('uninterrupted climb retains equipment through cycles A, B and C',()=>{
 const p={...PROGRESSION_POLICIES[1],win:2,kill:1,bossKill:1,insurance:0,reroll:0,surgery:0,replace:0,skills:0};
 const x=simulateTowerProgression({seed:2,policy:p,model:PROGRESSION_PRICE_MODELS[0],rarityStep:.08,maxFights:250});
 assert.equal(x.completed,true);
 assert.deepEqual(x.cycleEntry.map(e=>e.to),[31,61,91,121]);
 assert.ok(x.cycleEntry.every((e,i)=>e.installed<=6&&(!i||e.installed>=x.cycleEntry[i-1].installed)));
 assert.equal(x.bank+x.spent,STARTING_CAPITAL+x.earned);
});
test('report distinguishes assumptions from combat evidence',()=>{
 const x=progressionMatrix({seeds:3,maxFights:70});
 assert.equal(x.rows.length,4*3*3);
 assert.equal(x.rows[0].milestones.length,9);
 assert.ok(x.rows.every(r=>r.reach30>=0&&r.reach30<=1));
 assert.match(progressionMarkdown(x),/предположены/);
});
