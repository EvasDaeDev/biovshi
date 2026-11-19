import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {contacts} from '../src/robot/locomotion.js';

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
test('support emergencies remain independent of ordinary step rhythm',()=>{
 const {state,limb}=gaitRig('leg',-1,5);
 state.validContact=()=>false;
 contacts(state,0,{});
 assert.equal(limb.phase,0,'unsafe support must be lifted even below regular stride threshold');
});
