import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCapsules} from '../src/robot/collision.js';
import {strikeProgress,struckSegment,queueCombatHit,flushCombatHits} from '../src/systems/combat.js';
import {CONFIG} from '../src/config.js';
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

test('windup releases smoothly and reaches full extension at the impact boundary',()=>{
  const timing=CONFIG.combat,wind=timing.windupSec,impact=wind+timing.thrustSec;
  ctx.game={time:wind};
  const start=strikeProgress({started:0,timing});
  assert.equal(start.phase,'thrust');
  assert.equal(start.wind,1);
  assert.equal(start.reach,0);
  ctx.game.time=impact-1e-7;
  const before=strikeProgress({started:0,timing});
  ctx.game.time=impact;
  const after=strikeProgress({started:0,timing});
  assert.ok(Math.abs(before.wind-after.wind)<1e-6,'no sudden rearward offset at impact');
  assert.ok(Math.abs(before.reach-after.reach)<1e-6,'no sudden reach extension at impact');
  assert.equal(after.wind,0);
  assert.equal(after.reach,1);
});

test('collision detection sees the visually extended enemy arm during a counterattack',()=>{
  const {robot}=fixture();
  const victim={
    capsules:makeCapsules(robot),
    center:{x:18,y:10},
    isDamageable:key=>key==='arm-1-lower'
  };
  const pending={source:'arm-1-lower',started:0,
    aim:{x:30,y:10},timing:CONFIG.combat};
  ctx.game.time=CONFIG.combat.windupSec+CONFIG.combat.thrustSec;
  ctx.obstacles=[];
  const attacker={
    center:{x:0,y:10},
    attackPose:p=>({
      kind:'arm',
      tip:{x:p.started===pending.started?30:0,y:10}
    })
  };
  assert.equal(struckSegment(attacker,victim,pending),'arm-1-lower');
});

test('both simultaneous strikes contribute distinct attack capsules',()=>{
  const {robot,limb,pose}=fixture();
  const second={kind:'leg',side:-1,key:'leg--1',massScale:1};
  const legPose={kind:'leg',limb:second,
    shoulder:{x:0,y:5},joint:{x:8,y:7},
    tip:{x:22,y:9},complete:true};
  robot.legs=[second];
  robot.origin=l=>l===second?legPose.shoulder:{x:0,y:0};
  robot.attackPose=p=>p.source==='leg--1-lower'?legPose:pose;
  ctx.combat.pending[0].secondary={
    source:'leg--1-lower',started:0,aim:{x:22,y:9}
  };
  const capsules=makeCapsules(robot);
  const arm=capsules.find(c=>c.segment==='arm-1-lower'&&c.a.x!==c.b.x);
  const leg=capsules.find(c=>c.segment==='leg--1-lower'&&c.a.x!==c.b.x);
  assert.deepEqual(arm.b,pose.tip);
  assert.deepEqual(leg.b,legPose.tip);
  assert.deepEqual(leg.a,legPose.joint);
});

test('reciprocal lethal impacts both commit after the contact snapshot',()=>{
  const alive=[true,true],damageLog=[],callbacks=[];
  const fighters=[0,1].map(id=>({id,damage(segment,attacker,amount,options){
    if(!alive[id]&&!options?.allowIncapacitated)return false;
    damageLog.push({victim:id,attacker,segment,amount});
    alive[id]=false;
    return true;
  }}));
  ctx.combat={hitBatch:[]};
  queueCombatHit(fighters[0],fighters[1],'head',2,applied=>callbacks.push([0,applied]));
  queueCombatHit(fighters[1],fighters[0],'head',2,applied=>callbacks.push([1,applied]));
  assert.deepEqual(alive,[true,true],'no lethal damage before commit');
  flushCombatHits();
  assert.deepEqual(alive,[false,false],'both fighters take their pre-existing strikes');
  assert.deepEqual(damageLog.map(hit=>hit.victim),[1,0]);
  assert.deepEqual(callbacks,[[0,true],[1,true]]);
  assert.equal(ctx.combat.hitBatch,null);
});

test('mixed boss and player hits share the same deferred damage batch',()=>{
  const applied=[];
  const boss={id:1},player={id:0};
  const target=(id)=>({id,damage(segment,from,amount,options){
    applied.push({id,segment,from,amount,allowIncapacitated:options?.allowIncapacitated});
    return true;
  }});
  ctx.combat={hitBatch:[]};
  queueCombatHit(player,target(1),'arm-1-lower',1,()=>{});
  queueCombatHit(boss,target(0),'head',2,()=>{});
  assert.equal(applied.length,0,'the boss must not apply damage early');
  flushCombatHits();
  assert.deepEqual(applied,[
    {id:1,segment:'arm-1-lower',from:0,amount:1,allowIncapacitated:true},
    {id:0,segment:'head',from:1,amount:2,allowIncapacitated:true}
  ]);
});
