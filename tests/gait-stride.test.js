import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {contacts,stepLandingTarget,fastGaitFactor} from '../src/robot/locomotion.js';

// Isolate the replant decision; real combat/arena physics are covered by the
// existing movement, contact, boss and headless-fight regression suites.
function gaitRig(kind,side,error){
 const limb={
  kind,side,key:kind+'-'+side,phase:1,
  foot:{x:0,y:side*20},from:{x:0,y:side*20},to:{x:0,y:side*20},
  stall:0
 };
 const state={
  gait:0,scale:1,mode:'walk',behavior:'follow',x:0,y:0,
  target:{x:300,y:0},currentIntent:{mode:'chase',lookPoint:null},
  allLimbs:()=>[limb],lifted:()=>false,hasGoal:()=>false,
  currentTargetVisible:()=>false,
  origin:()=>({x:0,y:side*20}),
  rest:()=>({x:error,y:side*20}),
  validContact:()=>true,limbClear:()=>true,rigClear:()=>true,
  limbFrame:()=>({x:0,y:0,angle:0}),
  local:(frame,x,y)=>({x:frame.x+x,y:frame.y+y}),
  lengths:()=>[40,40],savePose:()=>({}),
  mixPose:()=>{}
 };
 return {state,limb};
}
test('both hands and feet stay planted until a slightly longer stride is needed',()=>{
 assert.equal(CONFIG.movement.stepReplantErrorCm,15);
 assert.equal(CONFIG.movement.stepCycleDistanceCm,8.4);
 assert.equal(CONFIG.movement.stepSwingRate,4.5);
 for(const [kind,side] of [['arm',1],['leg',-1]]){
  const near=gaitRig(kind,side,14.5);
  contacts(near.state,0,{});
  assert.equal(near.limb.phase,1,kind+' should not flutter during small body movements');
  assert.equal(near.limb.to.x,0);
  const long=gaitRig(kind,side,17);
  contacts(long.state,0,{});
  assert.ok(long.limb.phase<1,kind+' should start its step after enough travel');
  assert.equal(long.limb.to.x,17,kind+' should relocate further, not merely speed up');
 }
});
test('the longer default hand can remain planted at its forward rest point',()=>{
 const {state,limb}=gaitRig('arm',1,50);
 limb.foot=state.rest(limb);
 contacts(state,0,{});
 assert.equal(limb.phase,1);
});
test('support emergencies remain independent of ordinary step rhythm',()=>{
 const {state,limb}=gaitRig('leg',-1,5);
 state.validContact=()=>false;
 contacts(state,0,{});
 assert.equal(limb.phase,0,'unsafe support must be lifted even below regular stride threshold');
});

test('running hand and foot steps land ahead of the body rest point, not where it was at lift-off',()=>{
 for(const [kind,side] of [['arm',1],['leg',-1]]){
  const calm=gaitRig(kind,side,17);
  calm.state.vx=0;calm.state.vy=0;
  contacts(calm.state,0,{});
  assert.equal(calm.limb.to.x,17,'standing and slow animation do not change');

  const walk=gaitRig(kind,side,17);
  walk.state.vx=36;walk.state.vy=0;
  contacts(walk.state,0,{});

  const run=gaitRig(kind,side,17);
  run.state.vx=65;run.state.vy=0;
  const projected=stepLandingTarget(run.state,run.limb);
  assert.ok(projected.x>25,'a fast stride plans a forward landing point');
  assert.equal(run.limb.foot.x,0,'landing projection must not move a planted support');
  contacts(run.state,0,{});
  assert.ok(run.limb.to.x>walk.limb.to.x+6,kind+' must extend stride at speed');
  assert.ok(run.limb.to.x>calm.limb.to.x+8,kind+' gains forward reach');
  assert.equal(run.limb.from.x,0,'foot records its previous world-space position for the swing');
 }
});
test('high speed steps respect diagonal velocity and shorten if blocked',()=>{
 const {state,limb}=gaitRig('arm',1,17);
 state.vx=45;state.vy=45;
 const target=stepLandingTarget(state,limb);
 assert.ok(target.x>17&&target.y>20,'support leads in the actual travel direction');
 assert.equal(limb.foot.x,0);
 assert.equal(limb.foot.y,20);
 state.vx=65;state.vy=0;
 state.validContact=l=>l.foot.x<=20;
 const safe=stepLandingTarget(state,limb);
 assert.ok(safe.x>17&&safe.x<=20,'stride is shortened instead of passing a reach boundary');
 state.validContact=()=>false;
 assert.deepEqual(stepLandingTarget(state,limb),state.rest(limb),'no safe projection leaves the old target');
 assert.equal(fastGaitFactor({...state,vx:0,vy:0}),0);
 assert.equal(fastGaitFactor({...state,vx:75,vy:0}),1);
});
