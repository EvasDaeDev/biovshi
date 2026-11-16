import {CONFIG} from '../config.js';
import {wrap} from '../utils/math.js';
import {coreClearCircle} from '../systems/collision.js';
import {BOSS_CONFIG} from './config.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const direction=(a,b)=>Math.atan2(b.y-a.y,b.x-a.x);
const turn=(p,a)=>({x:p.x*Math.cos(a)-p.y*Math.sin(a),
 y:p.x*Math.sin(a)+p.y*Math.cos(a)});
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));

// Memories are per opponent and persist for the entire encounter. A turn,
// missed attack, or single evasive movement cannot reset accumulated evidence.
export function bossOpponentMemory(state,targetId){
 const byTarget=state.tacticsByTarget??={};
 return byTarget[targetId]??={
  targetId,lastAt:null,lastDistance:null,lastHeadHp:null,retreatPressure:0,
  stalledFor:0,headDanger:0,misses:0,side:1,sideUntil:0,
  strikeFailures:{},choice:null,plan:null,planUntil:0,planTarget:null
 };
}

export function observeBossOpponent(robot,target,memory,now){
 const cfg=BOSS_CONFIG.tactics,dist=distance(robot,target);
 const hp=robot.hp.get('head')??0;
 if(memory.lastHeadHp!==null&&hp<memory.lastHeadHp){
  memory.headDanger+=memory.lastHeadHp-hp;
  memory.planUntil=0; // immediately reconsider after a real head wound
 }
 if(memory.lastAt!==null&&now>memory.lastAt){
  const dt=Math.min(.3,now-memory.lastAt);
  const v=target.velocity??{x:0,y:0};
  const radial=((target.x-robot.x)*v.x+(target.y-robot.y)*v.y)/Math.max(1,dist);
  const retreating=dist>cfg.positionNearGap&&radial>cfg.retreatVelocityThreshold;
  memory.retreatPressure=clamp(memory.retreatPressure+(retreating?dt:-dt*.3),0,20);
  const madeProgress=dist<memory.lastDistance-2;
  memory.stalledFor=clamp(memory.stalledFor+(retreating&&!madeProgress?dt:-dt*.7),0,20);
 }
 memory.lastHeadHp=hp;memory.lastAt=now;memory.lastDistance=dist;
 return memory;
}

export function recordBossTacticalStrike(memory,source,landed,now){
 if(!source||source.kind==='head')return;
 if(landed){
  memory.strikeFailures[source.key]=0;memory.misses=0;
 }else{
  memory.strikeFailures[source.key]=Math.min(5,(memory.strikeFailures[source.key]??0)+1);
  memory.misses++;
  if(memory.misses>=2&&now>=memory.sideUntil){
   memory.side*=-1;memory.sideUntil=now+BOSS_CONFIG.tactics.positionCommitSec;
   memory.misses=0;memory.planUntil=0;
  }
 }
}

// A proposed stance has a REAL limb as its anchor, and a projected location
// of that limb after the boss rotates and walks. No attacks are authorized by
// this estimate: the existing IK and collision code decides what can hit.
export function chooseBossStance(robot,target,memory){
 const cfg=BOSS_CONFIG.tactics;
 const limbs=robot.attackSources.filter(s=>s.kind==='arm'||s.kind==='leg');
 if(!limbs.length)return null;
 const arms=limbs.filter(s=>s.kind==='arm');
 const bearing=direction(robot,target.center),v=target.velocity??{x:0,y:0};
 const horizon=cfg.positionPredictionSec;
 const lead={x:target.center.x+clamp(v.x*horizon,-12,12),
  y:target.center.y+clamp(v.y*horizon,-12,12)};
 const risky=memory.headDanger>0||memory.retreatPressure>cfg.retreatPressureTrigger;
 const options=[];
 for(const source of limbs){
  // A rear kick needs the target to stay BEHIND the pelvis; steering the
  // head toward the enemy prevents this sector from ever becoming available.
  for(const offset of source.kind==='leg'?[0,source.side*.25]:[0,source.side*.35]){
   const heading=wrap(bearing+(source.kind==='leg'?Math.PI:0)+offset);
   const rotation=wrap(heading-robot.angle);
   const currentLocal=turn({x:source.point.x-robot.x,y:source.point.y-robot.y},-robot.angle);
   const preferred=source.kind==='leg'?{x:-18,y:source.side*9}:{x:18,y:source.side*8};
   const contact=turn({x:currentLocal.x+preferred.x,y:currentLocal.y+preferred.y},heading);
   const goal={x:lead.x-contact.x,y:lead.y-contact.y};
   const travel=distance(robot,goal);
   if(travel>cfg.positionMaxTravel||!coreClearCircle(goal,cfg.positionClearance))continue;
   const head=robot.attackSources.find(s=>s.kind==='head');
   const headLocal=head?turn({x:head.point.x-robot.x,y:head.point.y-robot.y},-robot.angle):{x:23,y:0};
   const headPlace=turn(headLocal,heading);
   const headGap=Math.hypot(goal.x+headPlace.x-target.center.x,goal.y+headPlace.y-target.center.y);
   const side=Math.sign(Math.sin(bearing)*(goal.x-robot.x)-Math.cos(bearing)*(goal.y-robot.y));
   const failure=memory.strikeFailures[source.key]??0;
   const directRisk=risky&&Math.abs(side)<.5?15:0;
   const headRisk=Math.max(0,52-headGap)*(risky?1.3:.35);
   // Moving a giant body is expensive. Prefer viable short moves and modest
   // turns; choose a kick when the arms have genuinely been destroyed.
   const score=travel*.4+Math.abs(rotation)*18+headRisk+failure*12+directRisk+
    (source.kind==='leg'&&arms.length?42:0)+(side&&side!==memory.side?5:0);
   options.push({goal,heading,source:source.key,kind:source.kind,score,
    targetAt:{...target.center},side,travel});
  }
 }
 options.sort((a,b)=>a.score-b.score||a.source.localeCompare(b.source));
 return options[0]??null;
}

export function bossPositionIntent(robot,target,memory,now){
 const cfg=BOSS_CONFIG.tactics,dist=distance(robot,target);
 if(dist>cfg.positionMaxGap)return null;
 const available=robot.attackSources.filter(s=>s.kind==='arm'||s.kind==='leg');
 if(!available.length)return null;
 const hasArms=available.some(s=>s.kind==='arm');
 const valid=memory.plan&&available.some(s=>s.key===memory.plan.source);
 if(!valid||now>=memory.planUntil||
  distance(memory.planTarget??target.center,target.center)>cfg.positionTargetReplanCm){
  const chosen=chooseBossStance(robot,target,memory);
  memory.plan=chosen;memory.planTarget={...target.center};
  memory.planUntil=now+cfg.positionCommitSec;
 }
 const plan=memory.plan;if(!plan)return null;
 const gap=distance(robot,plan.goal),align=Math.abs(wrap(plan.heading-robot.angle));
 // Without arms, first turn the pelvis so a legal rear/side kick can occur.
 // Turning uses the normal damaged-body turning multiplier, never an instant
 // orientation or a mid-charge redirection.
 if(plan.kind==='leg'&&!hasArms&&align>cfg.positionAlignTolerance&&dist<cfg.positionPivotGap){
  return {goal:{x:robot.x,y:robot.y},speed:0,brake:true,
   heading:plan.heading,lookPoint:target.center,mode:'разворачивает ноги'};
 }
 if(gap<=cfg.positionStopGap){
  return {goal:{x:robot.x,y:robot.y},speed:0,brake:true,
   heading:plan.heading,lookPoint:target.center,mode:'готовит удар'};
 }
 // Once the feet face the attacker, a short backwards/sideways adjustment can
 // put a FOOT into range without presenting the head first. The physics solver
 // still validates every step and normal locomotion multipliers still apply.
 if(plan.kind==='leg'&&!hasArms&&align<cfg.positionAlignTolerance&&dist<cfg.positionPivotGap){
  const dx=plan.goal.x-robot.x,dy=plan.goal.y-robot.y,magnitude=Math.hypot(dx,dy);
  return {goal:plan.goal,heading:plan.heading,speed:CONFIG.movement.chaseSpeedCm,
   manual:true,retreat:{x:dx/magnitude,y:dy/magnitude},
   lookPoint:target.center,mode:'сближается для удара ногой'};
 }
 return {goal:plan.goal,speed:CONFIG.movement.chaseSpeedCm,mode:plan.kind==='leg'?
  'ищет сектор для удара ногой':'заходит к руке',lookPoint:target.center,navigate:true};
}
