import {ctx} from '../game/state.js';
import {ik,segmentDistance} from '../utils/math.js';
import {coreClearBone} from '../systems/collision.js';
import {BOSS_CONFIG} from './config.js';

// Called by the shared IK engine only for the boss's explicit sweep animation.
export function sweepPose(state,p,{limb,shoulder,upper,lower,maxReach,base,complete,progress}){
 const half=BOSS_CONFIG.tactics.sweepHalfAngle,side=limb.side;
 const point=t=>{const angle=p.direction+side*half*(1-2*t),radius=maxReach*.97;return {x:shoulder.x+Math.cos(angle)*radius,y:shoulder.y+Math.sin(angle)*radius};};
 const start=point(0),end=point(1);let tip;
 if(progress.phase==='windup')tip={x:base.x+(start.x-base.x)*progress.wind,y:base.y+(start.y-base.y)*progress.wind};
 else if(progress.phase==='thrust')tip=point(progress.reach);
 else tip={x:base.x+(end.x-base.x)*progress.reach,y:base.y+(end.y-base.y)*progress.reach};
 return {kind:limb.kind,limb,shoulder,joint:complete?ik(shoulder,tip,upper,lower,limb.kind==='arm'?side:-side).joint:tip,tip,base,complete,progress};
}
export function poseAt(robot,p,age){return robot.attackPose({...p,preview:false,started:ctx.game.time-age});}
export function poseClear(robot,pose){
 if(!pose)return false;const arm=pose.kind==='arm',scale=robot.scale;
 return coreClearBone(pose.shoulder,pose.joint,(arm?4.8:6.8)*scale)
  &&(!pose.complete||coreClearBone(pose.joint,pose.tip,(arm?4.8:5.8)*scale));
}
export function sweepPathClear(robot,p){
 const t=p.timing,duration=t.windupSec+t.thrustSec+t.recoverSec;
 for(let i=0;i<=32;i++)if(!poseClear(robot,poseAt(robot,p,duration*i/32)))return false;
 return true;
}
// Probe only the active arc; no damage during winding up or returning to support.
export function sweepContact(robot,victim,p,fromAge,toAge){
 const t=p.timing,lo=Math.max(t.windupSec,fromAge),hi=Math.min(t.windupSec+t.thrustSec,toAge);
 if(hi<lo||toAge<t.windupSec||fromAge>t.windupSec+t.thrustSec)return null;
 const steps=Math.max(1,Math.ceil((hi-lo)/t.thrustSec*48));
 let previous=null;
 for(let i=0;i<=steps;i++){
  const pose=poseAt(robot,p,lo+(hi-lo)*i/steps);
  if(!poseClear(robot,pose))return null;
  const start=pose.complete?pose.joint:pose.shoulder;
  for(const capsule of victim.capsules){
   if(!capsule.segment||!victim.isDamageable(capsule.segment))continue;
   const contact=segmentDistance(start,pose.tip,capsule.a,capsule.b)<=capsule.r+2.2;
   const sweptTip=previous&&segmentDistance(previous,pose.tip,capsule.a,capsule.b)<=capsule.r+2.2;
   if(contact||sweptTip)return capsule.segment;
  }
  previous=pose.tip;
 }
 return null;
}
// Trace the WHOLE current rig. The regular locomotion solver still validates
// every actual step and stops the boss if another fighter enters its route.
export function chargePlan(robot,target){
 if(robot.movementLimbs<2)return null;
 const cfg=BOSS_CONFIG.tactics,dx=target.x-robot.x,dy=target.y-robot.y,d=Math.hypot(dx,dy);
 if(d<cfg.chargeMinGap||d>cfg.chargeMaxGap)return null;
 const direction=Math.atan2(dy,dx),unit={x:dx/d,y:dy/d};
 for(let distance=Math.min(cfg.chargeDistance,d-42);distance>=18;distance-=8){
  let clear=true;const count=Math.ceil(distance/2);
  for(let i=0;i<=count&&clear;i++)for(const c of robot.capsules){
   const x=unit.x*distance*i/count,y=unit.y*distance*i/count;
   if(!coreClearBone({x:c.a.x+x,y:c.a.y+y},{x:c.b.x+x,y:c.b.y+y},c.r+1)){clear=false;break;}
  }
  if(clear)return {direction,distance,origin:{x:robot.x,y:robot.y},goal:{x:robot.x+unit.x*distance,y:robot.y+unit.y*distance}};
 }
 return null;
}
export function bossDamage(roll){return roll<BOSS_CONFIG.criticalChance?2:1;}
