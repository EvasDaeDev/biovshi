import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCapsules} from '../src/robot/collision.js';
import {ctx} from '../src/game/state.js';

function fixture(source='arm-1-lower'){
  const limb={kind:'arm',side:1,key:'arm-1',massScale:1};
  const strike={source,started:0,aim:{x:25,y:10}};
  const pose={kind:'arm',limb,shoulder:{x:0,y:0},joint:{x:10,y:10},
    tip:{x:18,y:10},base:{x:10,y:0},complete:true};
  const robot={
    id:0,mode:'combat',body:{},scale:1,spine:[],tail:[],headMotion:0,
    chest:{x:0,y:0},pelvis:{x:0,y:0},headFrame:{x:0,y:0,angle:0},
    arms:[limb],legs:[],mobile:()=>true,hasHead:()=>true,healthy:()=>true,
    local:(frame,a,b)=>({x:frame.x+a,y:frame.y+b}),
    origin:()=>({x:0,y:0}),lengths:()=>[12,12],
    handEnd:()=>({x:12,y:0}),attackPose:()=>pose
  };
  ctx.scale=1;
  ctx.game={time:.42};
  ctx.combat={pending:[strike]};
  return {robot,strike,pose,limb};
}

test('striking arm capsules follow the rendered joint and tip, not the resting hand',()=>{
  const {robot,pose}=fixture();
  const capsules=makeCapsules(robot);
  const upper=capsules.find(c=>c.segment==='arm-1-upper');
  const lower=capsules.find(c=>c.segment==='arm-1-lower'&&c.a.x!==c.b.x);
  assert.deepEqual(upper.b,pose.joint);
  assert.deepEqual(lower.a,pose.joint);
  assert.deepEqual(lower.b,pose.tip);
  assert.notDeepEqual(lower.b,robot.handEnd());
});

test('head damage capsules follow the rendered headbutt offset',()=>{
  const {robot,strike}=fixture('head');
  const base={x:25,y:0};
  robot.attackPose=()=>({kind:'head',base,tip:{x:34,y:7}});
  const capsules=makeCapsules(robot).filter(c=>c.segment==='head');
  assert.equal(capsules.length,2);
  assert.deepEqual(capsules[0].a,{x:34,y:7});
  assert.deepEqual(capsules[1].a,{x:48,y:7});
  ctx.combat.pending[0]=null;
  const idle=makeCapsules(robot).filter(c=>c.segment==='head');
  assert.deepEqual(idle[0].a,base);
  assert.deepEqual(idle[1].a,{x:39,y:0});
});

test('resting limb capsules remain on their own inverse-kinematics pose',()=>{
  const {robot}=fixture();
  ctx.combat.pending[0]=null;
  const caps=makeCapsules(robot);
  const lower=caps.find(c=>c.segment==='arm-1-lower'&&c.a.x!==c.b.x);
  assert.ok(lower);
  assert.deepEqual(lower.b,{x:12,y:0});
});
