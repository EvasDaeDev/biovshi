import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_ANATOMY_SEQUENCE,bossVariantForFloor} from '../src/boss/config.js';
import {bossAnatomy} from '../src/boss/anatomy.js';
import {ensureBossEncounter} from '../src/boss/encounter.js';
import {BOSS_FLOOR_INTERVAL} from '../src/build-channel.js';
import {newTower,towerEnemyCount,towerEnemyReward,validTower,towerFor} from '../src/tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor,selectTowerFloor,validTowerFloorPlan,TOWER_ARENA_CAPACITY} from '../src/tower/floors.js';
import {TOWER_ENEMY_PROFILES,towerEnemyProfile,towerProfileEffect,towerProfileDifference} from '../src/tower/profiles.js';
import {betNewSession} from '../src/betting/ledger.js';
import {purchaseInsurance,validInsurance} from '../src/tower/insurance.js';

test('four specialist profiles have distinct atlases and the intended voice groups',()=>{
 assert.deepEqual(TOWER_ENEMY_PROFILES.fast.stats,[5,2,3]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.strong.stats,[2,5,3]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.agile.stats,[3,2,5]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.elite.stats,[4,4,4]);
 for(const [id,key,voice] of [['fast','robotEnemy1','male'],['strong','robotEnemy2','male'],['agile','robotEnemy3','female'],['elite','robotEnemy4','female']]){
  assert.equal(towerEnemyProfile(id).skinKey,key);
  assert.equal(towerEnemyProfile(id).voice,voice);
 }
 assert.equal(towerEnemyProfile('basic').skinKey,null);
 assert.equal(towerEnemyProfile('basic').voice,null);
});

test('chosen floor and composition persist, with at most ten combatants including player',()=>{
 for(const floor of [1,2,4,6,8,16,40,100]){
  if(floor%BOSS_FLOOR_INTERVAL===0)continue;
  const run=newTower(0);
  run.level=floor;run.wins=floor-1;
  const random=()=>.49;
  const first=ensureTowerFloorPlan(run,random);
  assert.equal(first.options.length,2);
  assert.equal(first.options[0].arenaId,first.options[1].arenaId,'risk options must use the same arena');
  assert.ok(first.options[1].profiles.length>=first.options[0].profiles.length,'danger never has fewer opponents');
  assert.equal(ensureTowerFloorPlan(run,()=>.99),first,'no reroll');
  assert.equal(validTowerFloorPlan(first,floor),true);
  assert.equal(selectTowerFloor(run,1),true);
  const chosen=selectedTowerFloor(run);
  assert.equal(chosen.kind,'danger');
  assert.equal(towerEnemyCount(run),chosen.profiles.length);
  assert.ok(chosen.profiles.length+1<=10);
  assert.ok(chosen.profiles.length+1<=TOWER_ARENA_CAPACITY[chosen.arenaId]);
  assert.ok(chosen.profiles.some(id=>id!=='basic'),'danger must include a specialist');
  assert.equal(towerEnemyReward(run),15);
  assert.equal(selectTowerFloor(run,99),false);
  run.rewarded=[1];
  assert.equal(selectTowerFloor(run,0),false,'cannot change difficulty after a paid knockout');
  assert.equal(validTowerFloorPlan(JSON.parse(JSON.stringify(first)),floor),true);
 }
});

test('legacy runs with credited kills or legacy opponent counts keep their historical rules',()=>{
 const t=newTower(0);
 t.level=40;t.wins=39;t.rewarded=[1];
 assert.equal(ensureTowerFloorPlan(t,()=>.1),null);
 assert.equal(t.floorPlan,undefined);
 t.rewarded=[];t.legacyEnemyCount=40;
 assert.equal(ensureTowerFloorPlan(t,()=>.1),null);
 assert.equal(towerEnemyCount(t),40);
});

test('six boss anatomies are fixed by ordinal, with extended limbs on bosses five and six',()=>{
 assert.deepEqual(BOSS_ANATOMY_SEQUENCE,['brute','long','legs','arms','long_legs','long_arms']);
 for(let ordinal=1;ordinal<=12;ordinal++){
  const floor=ordinal*BOSS_FLOOR_INTERVAL;
  const t=newTower(0);t.level=floor;t.wins=floor-1;
  const e=ensureBossEncounter(t,()=>.99);
  assert.equal(e.variant,BOSS_ANATOMY_SEQUENCE[(ordinal-1)%6]);
  assert.equal(e,ensureBossEncounter(t,()=>0),'persisted encounter should not be rerolled');
  const a=bossAnatomy(e.variant);
  if(ordinal===5||ordinal===6){
   assert.equal(a.spineSegments,8);
   assert.equal(a.limbs.length,6);
   assert.ok(a.limbs.filter(l=>l.anchor!==undefined).every(l=>l.anchor<a.spineSegments));
  }
 }
 const legacy=newTower(0);
 legacy.level=5;legacy.bossEncounter={floor:5,variant:'arms',texture:'assets/textures/robots/boss/b_01.png'};
 assert.equal(ensureBossEncounter(legacy,()=>0).variant,'arms','saved old anatomy must be respected');
});

test('DMS snapshots and validates the chosen encounter without rewriting coins or progress',()=>{
 const s=betNewSession(['Игрок'],500);
 const t=towerFor(s,0);
 ensureTowerFloorPlan(t,()=>.37);
 selectTowerFloor(t,1);
 assert.equal(validTower(t),true);
 const before=structuredClone(t.floorPlan);
 purchaseInsurance(s,0,t);
 assert.deepEqual(t.insurance.checkpoint.floorPlan,before);
 assert.equal(validInsurance(t.insurance,t.record),true);
 assert.equal(s.players[0].balance,450);
 selectTowerFloor(t,0);
 assert.deepEqual(t.insurance.checkpoint.floorPlan,before,'later choices cannot mutate checkpoint');
});
