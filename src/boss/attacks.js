import {critChance} from '../garage/model.js';
import {ctx} from '../game/state.js';
import {ik,segmentDistance,wrap} from '../utils/math.js';
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
 if(!complete){
  const dx=tip.x-shoulder.x,dy=tip.y-shoulder.y;
  const angle=Math.hypot(dx,dy)>1e-9?Math.atan2(dy,dx):p.direction;
  tip={x:shoulder.x+Math.cos(angle)*upper,y:shoulder.y+Math.sin(angle)*upper};
  return {kind:limb.kind,limb,shoulder,joint:tip,tip,base,complete,progress};
 }
 const solved=ik(shoulder,tip,upper,lower,limb.kind==='arm'?side:-side);
 return {kind:limb.kind,limb,shoulder,joint:solved.joint,tip:solved.end,base,complete,progress};
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
export function sweepContacts(robot,victims,p,fromAge,toAge){
 const t=p.timing,lo=Math.max(t.windupSec,fromAge),hi=Math.min(t.windupSec+t.thrustSec,toAge);
 if(hi<lo)return [];
 const steps=Math.max(1,Math.ceil((hi-lo)/t.thrustSec*48));
 const contacts=new Map();
 let previous=null;
 for(let i=0;i<=steps;i++){
  const pose=poseAt(robot,p,lo+(hi-lo)*i/steps);
  if(!poseClear(robot,pose))return null;
  const start=pose.complete?pose.joint:pose.shoulder;
  for(const victim of victims){
   for(const capsule of victim.capsules){
    const segment=capsule.segment;
    if(!segment||!victim.isDamageable(segment))continue;
    const key=victim.id+':'+segment;
    if(contacts.has(key)||p.sweepHits?.has(key))continue;
    const radius=capsule.r+2.2;
    const contact=segmentDistance(start,pose.tip,capsule.a,capsule.b)<=radius;
    const sweptTip=previous&&segmentDistance(previous,pose.tip,capsule.a,capsule.b)<=radius;
    if(contact||sweptTip)contacts.set(key,{key,victim,segment});
   }
  }
  previous=pose.tip;
 }
 return [...contacts.values()];
}
// Trace the WHOLE current rig. The regular locomotion solver still validates
// every actual step and stops the boss if another fighter enters its route.
// Plan a straight-line dash BEFORE takeoff. Candidate endpoints are offset to
// expose a surviving arm/leg instead of running the boss's head into the enemy.
// This is only a reach estimate; every real strike is checked by strikeCandidates.
export function chargePlan(robot,target,{history=[],diagnostics=null}={}){
 const reject=key=>{if(diagnostics)diagnostics[key]=(diagnostics[key]??0)+1;};
 if(robot.movementLimbs<2){reject('fewLimbs');return null;}
 const cfg=BOSS_CONFIG.tactics,dx=target.x-robot.x,dy=target.y-robot.y,d=Math.hypot(dx,dy);
 if(d<cfg.chargeMinGap||d>cfg.chargeMaxGap){reject('distance');return null;}
 const unit={x:dx/d,y:dy/d},perp={x:-unit.y,y:unit.x};
 const sources=robot.attackSources.filter(s=>s.kind==='arm'||s.kind==='leg');
 if(!sources.length){reject('noWeapons');return null;}
 const candidates=[];
 for(const [approach,offset] of [['direct',0],['left',cfg.chargeSideOffset],['right',-cfg.chargeSideOffset]]){
  const desired={x:target.x-unit.x*cfg.chargeTerminalGap+perp.x*offset,
   y:target.y-unit.y*cfg.chargeTerminalGap+perp.y*offset};
  const vx=desired.x-robot.x,vy=desired.y-robot.y,length=Math.hypot(vx,vy);
  if(length<18){reject('shortPath');continue;}
  const direction=Math.atan2(vy,vx),turn=wrap(direction-robot.angle);
  if(Math.abs(turn)>cfg.chargeSteerLimit){reject('turn');continue;}
  const forward={x:vx/length,y:vy/length};
  const distance=Math.min(cfg.chargeDistance,length),goal={x:robot.x+forward.x*distance,y:robot.y+forward.y*distance};
  // Check the rotated full rig at every translation step. The locomotion
  // solver still performs the authoritative contact validation per tick.
  const c=Math.cos(turn),s=Math.sin(turn),steps=Math.ceil(distance/2);
  let clear=true;
  for(let i=0;i<=steps&&clear;i++){
   const shift={x:forward.x*distance*i/steps,y:forward.y*distance*i/steps};
   for(const capsule of robot.capsules){
    const rotate=p=>({x:robot.x+(p.x-robot.x)*c-(p.y-robot.y)*s+shift.x,
     y:robot.y+(p.x-robot.x)*s+(p.y-robot.y)*c+shift.y});
    if(!coreClearBone(rotate(capsule.a),rotate(capsule.b),capsule.r+1)){clear=false;break;}
   }
  }
  if(!clear){reject('rigBlocked');continue;}
  const bearing=wrap(Math.atan2(target.y-goal.y,target.x-goal.x)-direction);
  let reachPenalty=Infinity;
  for(const source of sources){
   const sector=source.kind==='arm'?Math.abs(bearing)<=1.28:
    Math.abs(bearing)>=Math.PI*8/9||bearing*source.side>=Math.PI/3;
   if(!sector)continue;
   const px=source.point.x-robot.x,py=source.point.y-robot.y;
   const tip={x:goal.x+px*c-py*s,y:goal.y+px*s+py*c};
   const gap=Math.hypot(target.x-tip.x,target.y-tip.y);
   const reach=(18+17.25)*(source.reachFactor??1)*(robot.body?.scaleMultiplier??1);
   reachPenalty=Math.min(reachPenalty,Math.max(0,gap-reach));
  }
  if(!Number.isFinite(reachPenalty)){reject('noSector');continue;}
  // Persistent outcome feedback: an approach that repeatedly exposes the
  // head without landing a strike becomes less attractive on future dashes.
  const punished=history.filter(h=>h.approach===approach&&h.headDamage>0&&!h.landed).length;
  const worked=history.filter(h=>h.approach===approach&&h.landed).length;
  const score=reachPenalty+punished*28-worked*6+
   (approach==='direct'?sources.some(s=>s.kind==='arm')?9:14:2)+Math.abs(turn)*5;
  candidates.push({direction,distance,origin:{x:robot.x,y:robot.y},goal,approach,score});
 }
 candidates.sort((a,b)=>a.score-b.score||a.distance-b.distance);
 if(!candidates.length){reject('noCandidate');return null;}
 reject('candidate');
 const {score,...plan}=candidates[0];
 return plan;
}
export function bossDamage(roll,strength=3){return roll<Math.max(BOSS_CONFIG.criticalChance,critChance(strength))?2:1;}
