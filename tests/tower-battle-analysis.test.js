import test from 'node:test';
import assert from 'node:assert/strict';
import {captureTowerBattleSample,diagnoseLongTowerFight} from '../scripts/tower-battle-analysis.mjs';

function sample(time,patch={}){
 return {time,hits:0,strikes:0,playerSwings:0,playerHits:0,
  playerAlive:true,playerArmed:true,playerNearestCm:70,
  aliveEnemies:2,armedEnemies:2,immobileEnemies:0,searchingEnemies:0,
  fleeingEnemies:0,...patch};
}
test('tower battle sampling counts surviving, disarmed and searching patients',()=>{
 const robots=[
  {id:0,x:0,y:0,visible:true,mobile:true,segmentCount:8,attackSources:[{}],movementLimbs:4},
  {id:1,x:35,y:0,visible:true,mobile:true,segmentCount:8,attackSources:[{}],movementLimbs:2},
  {id:2,x:200,y:0,visible:true,mobile:true,segmentCount:8,attackSources:[],movementLimbs:0},
  {id:3,x:10,y:0,visible:true,mobile:false,segmentCount:0,attackSources:[],movementLimbs:0}
 ];
 const state={robots,intents:[{},{mode:'ищет врага'},{mode:'убегает без оружия'}],
  round:{elapsedSec:12.3},combat:{hits:5,strikes:11,fighterSwings:[3],fighterHits:[2]}};
 assert.deepEqual(captureTowerBattleSample(state),{
  time:12.3,hits:5,strikes:11,playerSwings:3,playerHits:2,
  playerAlive:true,playerArmed:true,playerNearestCm:35,
  aliveEnemies:2,armedEnemies:1,immobileEnemies:1,searchingEnemies:1,fleeingEnemies:1
 });
});
test('long fights distinguish orbiting bot from active combat and disarmed survivors',()=>{
 const orbit=Array.from({length:12},(_,i)=>sample(i,{playerNearestCm:92}));
 assert.equal(diagnoseLongTowerFight(orbit).reason,'autopilot-keeps-distance');
 const fighting=Array.from({length:12},(_,i)=>sample(i,{hits:i*2,strikes:i*3,playerSwings:i}));
 assert.equal(diagnoseLongTowerFight(fighting).reason,'active-combat');
 const disarmed=Array.from({length:12},(_,i)=>sample(i,{armedEnemies:0}));
 assert.equal(diagnoseLongTowerFight(disarmed).reason,'disarmed-survivors');
 assert.equal(diagnoseLongTowerFight(orbit,true).reason,'completed');
});
test('long fight analysis reports missing observations and extended searches',()=>{
 assert.equal(diagnoseLongTowerFight([]).reason,'no-samples');
 const search=Array.from({length:14},(_,i)=>sample(i,{playerNearestCm:35,searchingEnemies:2}));
 assert.equal(diagnoseLongTowerFight(search).reason,'search-or-perception');
 const missed=Array.from({length:14},(_,i)=>sample(i,{playerNearestCm:35,strikes:i}));
 assert.equal(diagnoseLongTowerFight(missed).reason,'attacks-without-hits');
});
