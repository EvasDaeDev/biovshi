import test from 'node:test';
import assert from 'node:assert/strict';
import {BOSS_ANATOMY_SEQUENCE,bossVariantForFloor} from '../src/boss/config.js';
import {bossAnatomy} from '../src/boss/anatomy.js';
import {ensureBossEncounter} from '../src/boss/encounter.js';
import {BOSS_FLOOR_INTERVAL} from '../src/build-channel.js';
import {newTower,towerEnemyCount,towerEnemyReward,validTower,towerFor} from '../src/tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor,selectTowerFloor,validTowerFloorPlan,TOWER_ARENA_CAPACITY,TOWER_DANGER_STYLES,towerStandardSpecialistRate,towerStandardSpecialist} from '../src/tower/floors.js';
import {towerTacticalProfile,TOWER_TACTICAL_BIASES} from '../src/tower/tactics.js';
import {fighterTacticalProfile} from '../src/systems/ai.js';
import {ctx} from '../src/game/state.js';
import {TOWER_ENEMY_PROFILES,towerEnemyProfile,towerProfileEffect,towerProfileDifference} from '../src/tower/profiles.js';
import {betNewSession} from '../src/betting/ledger.js';
import {purchaseInsurance,validInsurance} from '../src/tower/insurance.js';

test('ordinary difficulty has 30 percent fewer specialists and 50 percent fewer strong enemies',()=>{
 for(const floor of [1,2,4,6,9,10,20,30]){
  const original=Math.min(.55,.12+floor*.045);
  const newRate=towerStandardSpecialistRate(floor);
  assert.ok(Math.abs(newRate-original*.7)<1e-12,'total specialist likelihood falls 30 percent: floor '+floor);
  // A profile had 1/3 of the old specialist probability. New strong
  // conditional share = 5/21, so the overall occurrence is exactly half.
  const newStrong=newRate*5/21;
  assert.ok(Math.abs(newStrong-original/6)<1e-12,'strong occurrence falls 50 percent: floor '+floor);
 }
 assert.equal(towerStandardSpecialist(()=>0),'fast');
 assert.equal(towerStandardSpecialist(()=>8/21),'strong');
 assert.equal(towerStandardSpecialist(()=>13/21),'agile');
 // Exact deterministic sampling verifies all three conditional weights.
 const counts={fast:0,strong:0,agile:0};
 for(let i=0;i<21000;i++)counts[towerStandardSpecialist(()=>(i+.5)/21000)]++;
 assert.deepEqual(counts,{fast:8000,strong:5000,agile:8000});
});

test('four specialist profiles have distinct atlases and the intended voice groups',()=>{
 assert.deepEqual(TOWER_ENEMY_PROFILES.fast.stats,[7,2,3]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.strong.stats,[2,7,3]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.agile.stats,[3,2,7]);
 assert.deepEqual(TOWER_ENEMY_PROFILES.elite.stats,[5,5,5]);
 assert.deepEqual(towerProfileEffect('basic'),{speed:100,critical:15,maneuver:100});
 assert.deepEqual(towerProfileEffect('fast'),{speed:160,critical:0,maneuver:100});
 assert.deepEqual(towerProfileEffect('strong'),{speed:80,critical:50,maneuver:100});
 assert.deepEqual(towerProfileEffect('agile'),{speed:100,critical:0,maneuver:160});
 assert.deepEqual(towerProfileEffect('elite'),{speed:135,critical:38,maneuver:135});
 assert.match(towerProfileDifference('strong'),/50%/);
 for(const [id,key,voice] of [['fast','robotEnemy1','male'],['strong','robotEnemy2','male'],['agile','robotEnemy3','female'],['elite','robotEnemy4','female']]){
  assert.equal(towerEnemyProfile(id).skinKey,key);
  assert.equal(towerEnemyProfile(id).voice,voice);
 }
 assert.equal(towerEnemyProfile('basic').skinKey,null);
 assert.equal(towerEnemyProfile('basic').voice,null);
});

test('tower tactics adjust existing preferences only for specialist profiles',()=>{
 const base={flankMin:67,flankMax:170,flankAngle:.7,flankQuietSec:6,closeRange:36,approachStallSec:6,guardTriggerCm:135};
 assert.equal(towerTacticalProfile(base,'basic'),base);
 assert.equal(towerTacticalProfile(base,undefined),base);
 for(const id of ['fast','strong','agile','elite']){
  const tactical=towerTacticalProfile(base,id);
  assert.deepEqual(tactical,{...base,...TOWER_TACTICAL_BIASES[id]});
  assert.notEqual(tactical,base);
  assert.ok(tactical.closeRange>0&&tactical.flankMax>tactical.closeRange);
 }
 assert.ok(towerTacticalProfile(base,'fast').flankMax<base.flankMax,'fast fighters pursue directly');
 assert.ok(towerTacticalProfile(base,'strong').closeRange>base.closeRange,'strong fighters stay nearer');
 assert.ok(towerTacticalProfile(base,'agile').flankMax>base.flankMax,'agile fighters favor wider flanks');
 assert.deepEqual(base,{flankMin:67,flankMax:170,flankAngle:.7,flankQuietSec:6,closeRange:36,approachStallSec:6,guardTriggerCm:135},'base profile remains unmodified');
});

test('tower enemy tactical initialization is scoped away from player, boss and betting',()=>{
 const mode=ctx.mode,garage=ctx.towerGarage;
 try{
  ctx.mode='tower';
  ctx.towerGarage=[{profileId:null},{profileId:'agile'},{profileId:'strong'}];
  assert.equal(fighterTacticalProfile({id:1,isBoss:false}).flankMax,195);
  assert.equal(fighterTacticalProfile({id:2,isBoss:false}).closeRange,53);
  assert.ok(fighterTacticalProfile({id:0,isBoss:false}).flankMax<195,'player retains default random profile');
  assert.ok(fighterTacticalProfile({id:1,isBoss:true}).flankMax<195,'boss remains unchanged');
  ctx.mode='spectator';
  assert.ok(fighterTacticalProfile({id:1,isBoss:false}).flankMax<195,'normal patients remain unchanged');
 }finally{
  ctx.mode=mode;
  ctx.towerGarage=garage;
 }
});

test('risk floors offer saved selection, crowd and mixed compositions',()=>{
 for(const [seed,style] of [[.01,'trial'],[.45,'crowd'],[.85,'mixed']]){
  const t=newTower(0);t.level=6;t.wins=5;
  const plan=ensureTowerFloorPlan(t,()=>seed);
  const [standard,danger]=plan.options;
  assert.equal(danger.style,style);
  assert.equal(danger.arenaId,standard.arenaId);
  assert.ok(danger.profiles.length>=standard.profiles.length,'danger never has fewer opponents');
  assert.equal(validTowerFloorPlan(plan,t.level),true);
  assert.ok(TOWER_DANGER_STYLES[style].description);
  if(style==='trial'){
   assert.equal(danger.profiles.length,standard.profiles.length,'trial keeps standard opponent count');
   assert.ok(danger.profiles.every(p=>p!=='basic'));
  }
  if(style==='crowd')assert.equal(danger.profiles.length,standard.profiles.length+1,'crowd really adds an opponent');
  if(style==='mixed')assert.ok(new Set(danger.profiles.filter(p=>p!=='basic')).size>=2);
  assert.equal(ensureTowerFloorPlan(t,()=>1),plan,'existing plan must not reroll');
 }
 const late=newTower(0);late.level=19;late.wins=18;
 const latePlan=ensureTowerFloorPlan(late,()=>.45);
 assert.equal(latePlan.options[1].style,'mixed','overcrowding switches to mixed composition when room is full');
 assert.ok(latePlan.options.every(o=>o.profiles.length<=9));
 const old=newTower(0);old.level=6;
 old.floorPlan={floor:6,selected:1,options:[
   {arenaId:'ward',kind:'standard',profiles:['basic']},
   {arenaId:'ward',kind:'danger',profiles:['fast']}
 ]};
 assert.equal(validTowerFloorPlan(old.floorPlan,6),true,'older saved plans do not require style');
 assert.equal(ensureTowerFloorPlan(old).options[1].style,undefined);
});

test('saved unstarted trials are normalized without changing arena, selection or a running fight',()=>{
 const run=newTower(0);run.level=6;run.wins=5;run.preparing=true;
 const floorPlan={floor:6,selected:1,options:[
  {arenaId:'ward',kind:'standard',profiles:['basic','fast','basic','basic']},
  {arenaId:'ward',kind:'danger',style:'trial',profiles:['fast','strong','agile']}
 ]};
 run.floorPlan=floorPlan;
 assert.equal(ensureTowerFloorPlan(run,()=>.5),floorPlan);
 assert.equal(floorPlan.selected,1);
 assert.equal(floorPlan.options[1].arenaId,'ward');
 assert.equal(floorPlan.options[1].profiles.length,4);
 assert.ok(floorPlan.options[1].profiles.every(id=>id!=='basic'));
 assert.equal(validTowerFloorPlan(floorPlan,6),true);
 const running=newTower(0);running.level=6;running.wins=5;running.preparing=false;
 running.floorPlan={floor:6,selected:1,options:[
  {arenaId:'ward',kind:'standard',profiles:['basic','fast','basic','basic']},
  {arenaId:'ward',kind:'danger',style:'trial',profiles:['fast','strong','agile']}
 ]};
 assert.equal(ensureTowerFloorPlan(running).options[1].profiles.length,3,'never change an active encounter');
});

test('every enemy profile description is safe during robot card creation',()=>{
 for(const id of ['basic','fast','strong','agile','elite']){
  const description=towerProfileDifference(id);
  assert.equal(typeof description,'string');
  assert.ok(description.length>0);
  if(id!=='basic')assert.ok(description.includes(towerEnemyProfile(id).focus),
   'specialist description includes its tactical focus: '+id);
 }
 assert.match(towerProfileDifference('fast'),/160%/);
 assert.match(towerProfileDifference('strong'),/50%/);
 assert.match(towerProfileDifference('agile'),/160%/);
 assert.match(towerProfileDifference('elite'),/135%/);
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
  const [normal,danger]=first.options;
  assert.ok(danger.profiles.length>=normal.profiles.length,'danger must not have fewer enemies');
  if(danger.style==='trial'){
   assert.equal(danger.profiles.length,normal.profiles.length,'selection keeps numbers and raises specialization');
   assert.ok(danger.profiles.every(id=>id!=='basic'),'selection contains specialists only');
  }else if(danger.style==='crowd'){
   assert.equal(danger.profiles.length,normal.profiles.length+1,'crowd adds exactly one enemy');
  }else{
   assert.equal(danger.profiles.length,normal.profiles.length,'mixed changes the composition, not the roster size');
   assert.ok(new Set(danger.profiles.filter(id=>id!=='basic')).size>=2,'mixed has distinct specialists');
  }
  assert.equal(ensureTowerFloorPlan(run,()=>.99),first,'no reroll');
  assert.equal(validTowerFloorPlan(first,floor),true);
  assert.equal(selectTowerFloor(run,1),true);
  const chosen=selectedTowerFloor(run);
  assert.equal(chosen.kind,'danger');
  assert.equal(towerEnemyCount(run),chosen.profiles.length);
  assert.ok(chosen.profiles.length+1<=10);
  assert.ok(chosen.profiles.length+1<=TOWER_ARENA_CAPACITY[chosen.arenaId]);
  assert.ok(chosen.profiles.some(id=>id!=='basic'),'danger must include a specialist');
  assert.equal(towerEnemyReward(run),150);
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
 assert.equal(s.players[0].balance,200);
 selectTowerFloor(t,0);
 assert.deepEqual(t.insurance.checkpoint.floorPlan,before,'later choices cannot mutate checkpoint');
});
