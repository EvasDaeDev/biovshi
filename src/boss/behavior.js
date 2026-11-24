import {patientCombatStats} from '../game/patients.js';
import {ctx} from '../game/state.js';
import {CONFIG} from '../config.js';
import {random} from '../utils/random.js';
import {wrap} from '../utils/math.js';
import {note} from '../game/events.js';
import {activeOpponents,fighterIntent} from '../systems/ai.js';
import {sightClear} from '../systems/collision.js';
import {strikeCandidates,movingStrikeContact,compareStrikeCandidates,prioritizeAdditionalArm,isAdditionalAttackArm,queueCombatHit} from '../systems/combat.js';
import {pendingStrikes,setPendingStrikes} from '../systems/strikes.js';
import {BOSS_CONFIG} from './config.js';
import {sweepPathClear,sweepContacts,chargePlan,bossDamage,poseClear,poseAt} from './attacks.js';
import {bossOpponentMemory,observeBossOpponent,recordBossTacticalStrike,bossPositionIntent,bossNeedsShortRange,isBossStump} from './positioning.js';
const root=key=>key.replace(/-(upper|lower)$/,'');
const duration=t=>t.windupSec+t.thrustSec+t.recoverSec;
export function updateBossPhase(robot,state){
 if(state.phase===2||!robot.mobile)return state.phase;
 let hp=0;for(const [key,value] of robot.hp)if(robot.isDamageable(key))hp+=Math.max(0,value);
 const cfg=BOSS_CONFIG.tactics;
 if(hp/robot.damageableHpTotal<=cfg.phaseHealth||1-robot.movementLimbs/robot.movementLimbTotal>=cfg.phaseLimbLoss){
  state.phase=2;note('boss-phase',{robot:robot.id,phase:2});
 }
 return state.phase;
}
function ordinaryCandidates(robot,target){
 const priority=segment=>segment==='head'?0:segment.startsWith('spine-')?1:2;
 const available=robot.attackSources.flatMap(source=>strikeCandidates(robot,target,source))
  .sort((a,b)=>priority(a.segment)-priority(b.segment)||compareStrikeCandidates(a,b));
 return prioritizeAdditionalArm(available,robot.body?.behavior?.state?.lastAttackSource);
}
function rearKickCandidate(robot,excludeTarget){
 const legs=robot.attackSources.filter(source=>source.kind==='leg');
 if(!legs.length)return null;
 const candidates=activeOpponents(robot.id)
  .filter(target=>target.id!==excludeTarget)
  .flatMap(target=>legs.map(source=>strikeCandidates(robot,target,source)[0]).filter(Boolean));
 return candidates.sort(compareStrikeCandidates)[0]??null;
}
function wideCandidate(robot,target,timing,exclude){
 if(!sightClear(robot.center,target.center)||Math.abs(wrap(Math.atan2(target.y-robot.y,target.x-robot.x)-robot.angle))>1.25)return null;
 const candidates=robot.attackSources.filter(s=>s.kind==='arm'&&root(s.key)!==exclude);
 const last=robot.body?.behavior?.state?.lastAttackSource;
 if(last&&!isAdditionalAttackArm(last)){
  const idx=candidates.findIndex(s=>isAdditionalAttackArm(s.key));
  if(idx>0)candidates.unshift(candidates.splice(idx,1)[0]);
 }
 for(const source of candidates){
  const p={source:source.key,aim:{...target.center},direction:robot.angle,style:'sweep',timing,started:ctx.game.time};
  if(sweepPathClear(robot,p)&&sweepContacts(robot,[target],p,timing.windupSec,timing.windupSec+timing.thrustSec)?.length)return {victim:target,source,p};
 }
 return null;
}
function applyHit(robot,victim,p,source,segment){
 // All contacts from one swing share its damage roll.
 const damage=p.damage??=bossDamage(random(),patientCombatStats(robot.id,robot).effective[1]);
 // Boss jabs and sweeps share the same physical-tick damage commit as ordinary
 // strikes. Their hit decisions are made before any same-tick incapacitation.
 queueCombatHit(robot,victim,segment,damage,applied=>{
  if(!applied){
   if(!p.sweepHits)note('combat-miss',{from:robot.id,to:victim.id,source:p.source,bossStyle:p.style});
   return;
  }
  if(victim.mobile)victim.reactToHit(robot,segment);
  ctx.combat.hits++;ctx.combat.fighterHits[robot.id]++;ctx.combat.fighterTaken[victim.id]++;ctx.combat.lastHitTime=ctx.game.time;
  ctx.agentAI[robot.id].lastHitAt=ctx.game.time;ctx.agentAI[victim.id].lastHitAt=ctx.game.time;
  if(!p.sweepLanded?.has(victim.id)){
   p.sweepLanded?.add(victim.id);
   recordBossTacticalStrike(bossOpponentMemory(robot.body.behavior.state,victim.id),source,true,ctx.game.time);
  }
  note('combat-strike',{from:robot.id,to:victim.id,source:p.source,segment,bossStyle:p.style??'jab'});
 });
}

export function createBossBehavior(){
 const state={phase:1,cycles:0,lastAttackSource:null,followup:null,charge:null,quickStrike:null,chargeOutcome:null,chargeHistory:[],tacticsByTarget:{},nextChargeAt:6,lastSeen:null,lastSeenAt:-Infinity,status:''};
 const hold=(robot,point,mode='атакует')=>({goal:{x:robot.x,y:robot.y},speed:0,mode,lookPoint:point??null,brake:true});
 const targetFor=robot=>activeOpponents(robot.id).sort((a,b)=>Math.hypot(a.x-robot.x,a.y-robot.y)-Math.hypot(b.x-robot.x,b.y-robot.y))[0];
 function updateChargeMemory(robot,now){
  const result=state.chargeOutcome;
  if(!result||now<result.reviewAt)return;
  state.chargeHistory.push({approach:result.approach,
   headDamage:Math.max(0,result.headHp-(robot.hp.get('head')??0)),
   landed:(ctx.combat.fighterHits[robot.id]??0)>result.hits});
  state.chargeHistory.splice(0,Math.max(0,state.chargeHistory.length-BOSS_CONFIG.tactics.chargeMemorySize));
  state.chargeOutcome=null;
 }
 function intent(robot){
  updateBossPhase(robot,state);
  if(!robot.mobile||ctx.combat.finished)return hold(robot,null);
  const now=ctx.game.time,cfg=BOSS_CONFIG.tactics,target=targetFor(robot);
  updateChargeMemory(robot,now);
  if(!target)return hold(robot,null);
  const memory=bossOpponentMemory(state,target.id);
  if(robot.canSee(target.center)&&sightClear(robot.center,target.center))observeBossOpponent(robot,target,memory,now);
  if(robot.movementLimbs===0){state.charge=null;return hold(robot,target.center);}
  if(state.charge&&robot.movementLimbs<2){
   state.charge=null;state.chargeOutcome=null;
   ctx.combat.nextStrike[robot.id]=Math.max(ctx.combat.nextStrike[robot.id],now+.4);
  }
  if(state.charge){
   const charge=state.charge,age=now-charge.started,victim=ctx.robots[charge.victim];
   if(age<cfg.chargeWindup){state.status='Готовит рывок';return {...hold(robot,charge.goal),heading:charge.direction};}
   if(!charge.launched){
    // A warning is not a guaranteed dash. If the enemy has already escaped,
    // or the body cannot face the committed ray, abandon BEFORE moving.
    if(!victim?.mobile||!victim.visible||
       Math.abs(wrap(robot.angle-charge.direction))>cfg.chargeAlignTolerance||
       Math.hypot(victim.center.x-charge.goal.x,victim.center.y-charge.goal.y)>cfg.chargeAbandonGap){
     state.charge=null;state.nextChargeAt=now+cfg.chargeAbortCooldown;
     state.status='Отменяет рывок';return hold(robot,victim?.center??target.center);
    }
    charge.launched=true;
    state.chargeOutcome={approach:charge.approach,headHp:robot.hp.get('head')??0,
     hits:ctx.combat.fighterHits[robot.id]??0,reviewAt:Infinity};
   }
   if(age<cfg.chargeWindup+cfg.chargeDuration&&Math.hypot(robot.x-charge.origin.x,robot.y-charge.origin.y)<charge.distance-2){
    state.status='Рывок';return {goal:charge.goal,heading:charge.direction,speed:CONFIG.movement.chaseSpeedCm*cfg.chargeSpeed,manual:true,mode:'boss-charge',lookPoint:charge.goal};
   }
   if(!charge.finishedAt){
    charge.finishedAt=now;
    state.chargeOutcome.reviewAt=now+cfg.chargeOutcomeWindow;
    // Only a REAL, currently reachable limb attack earns a quick follow-up.
    // No damage is attached to the dash itself.
    const candidate=victim?.mobile&&victim.visible?ordinaryCandidates(robot,victim).find(c=>c.source.kind!=='head'):null;
    if(candidate){
     state.quickStrike={victim:victim.id,source:candidate.source.key,until:now+cfg.chargeQuickAttackWindow};
     state.charge=null;state.status='Атака после рывка';
     return hold(robot,victim.center);
    }
   }
   charge.recoverAt??=now;state.status='Восстанавливается';
   if(now-charge.recoverAt<cfg.chargeRecovery)return hold(robot,charge.goal);
   state.charge=null;
  }
  const pending=pendingStrikes(robot.id)[0];
  if(pending){
   state.status=pending.rearKick?'Бьёт ногой':pending.style==='sweep'?'Широкий удар':pending.comboIndex?`Серия · ${pending.comboIndex}/2`:'Наносит удар';
   return hold(robot,pending.rearKick?null:pending.aim);
  }
  if(state.followup){state.status='Продолжает серию';return hold(robot,target.center);}
  if(now<ctx.combat.nextStrike[robot.id]){
   const dx=robot.x-target.center.x,dy=robot.y-target.center.y,d=Math.hypot(dx,dy)||1;
   if(!bossNeedsShortRange(robot)&&d<cfg.spacingDistance&&sightClear(robot.center,target.center)){
    state.status='Держит дистанцию атаки';return {goal:{x:robot.x+dx/d*12,y:robot.y+dy/d*12},speed:CONFIG.movement.chaseSpeedCm,manual:true,mode:'атакует',lookPoint:target.center,retreat:{x:dx/d,y:dy/d}};
   }
   if(bossNeedsShortRange(robot)){
    const approach=bossPositionIntent(robot,target,memory,now);
    if(approach){state.status=approach.mode;return approach;}
   }
   state.status='Восстанавливается';return hold(robot,target.center);
  }
  if(ctx.combat.escapeUntil[robot.id]>now&&ctx.combat.escapeGoal[robot.id]){
   state.status='Обходит препятствие';return {goal:ctx.combat.escapeGoal[robot.id],speed:CONFIG.movement.chaseSpeedCm,mode:'обходит препятствие',lookPoint:target.center};
  }
  const seen=robot.canSee(target.center)&&sightClear(robot.center,target.center);
  if(seen){state.lastSeen={...target.center};state.lastSeenAt=now;}
  if(!seen&&now-state.lastSeenAt>3){state.status='Ищет противника';return fighterIntent(robot);}
  if(seen&&now>=state.nextChargeAt&&Math.abs(wrap(Math.atan2(target.y-robot.y,target.x-robot.x)-robot.angle))<.35){
   const plan=chargePlan(robot,target.center,{history:state.chargeHistory});
   if(plan){state.charge={...plan,started:now,victim:target.id};state.nextChargeAt=now+cfg.chargeCooldown*(state.phase===2?.8:1);state.status='Готовит рывок';note('boss-charge',{robot:robot.id,goal:plan.goal});return {...hold(robot,plan.goal),heading:plan.direction};}
   state.nextChargeAt=now+1;
  }
  const armSources=robot.attackSources.filter(s=>s.kind==='arm');
  const noFrontArms=!armSources.some(s=>s.key.endsWith('-lower')&&!s.key.includes('pair2'));
  const candidates=ordinaryCandidates(robot,target).filter(c=>seen||c.source.kind==='leg');
  // A headbutt is not a substitute for the missing front arms: it exposes
  // the exact critical segment a kiting player is aiming at.
  const usable=noFrontArms?candidates.filter(c=>c.source.kind!=='head'):candidates;
  if(usable.length){
   state.status='Выбирает удар';return hold(robot,target.center);
  }
  // For a rear kick, use only a recently SEEN position (or actual foot-range
  // sensing). Do not grant the boss knowledge of a hidden player's position.
  const recent=!seen&&state.lastSeen&&now-state.lastSeenAt<=3;
  const lastKnown=recent?{...target,x:state.lastSeen.x,y:state.lastSeen.y,
   center:{...state.lastSeen},velocity:{x:0,y:0}}:target;
  if(seen||recent){
   const position=bossPositionIntent(robot,lastKnown,memory,now);
   if(position){state.status=position.mode;return position;}
  }
  state.status='Теснит противника';return {goal:seen?{...target.center}:state.lastSeen,speed:CONFIG.movement.chaseSpeedCm,mode:'преследует',lookPoint:seen?target.center:state.lastSeen};
 }
 function resolveCombat(robot){
  updateBossPhase(robot,state);
  if(!robot.mobile||ctx.combat.finished){state.followup=state.charge=state.quickStrike=state.chargeOutcome=null;setPendingStrikes(robot.id,[]);return;}
  const strikes=pendingStrikes(robot.id);
  if(!strikes.length)return;
  const now=ctx.game.time;
  const remaining=strikes.filter(p=>{
   const victim=ctx.robots[p.victim],source=robot.attackSources.find(s=>s.key===p.source);
   const sweep=p.style==='sweep',committed=sweep&&now>=p.at;
   const cancel=()=>{
    if(!p.rearKick){state.followup=null;ctx.combat.nextStrike[robot.id]=now+.4;}
    return false;
   };
   if(!source||(!committed&&(!victim?.mobile||!victim.visible))
    ||sweep&&!poseClear(robot,poseAt(robot,p,now-p.started)))return cancel();
   if(!p.resolved&&now>=p.at){
    if(sweep){
     const opponents=activeOpponents(robot.id).filter(target=>sightClear(robot.center,target.center));
     const age=now-p.started;
     const contacts=sweepContacts(robot,opponents,p,p.lastAge??0,age);p.lastAge=age;
     if(!contacts)return cancel();
     for(const contact of contacts){
      p.sweepHits.add(contact.key);
      applyHit(robot,contact.victim,p,source,contact.segment);
     }
    }else{
     const segment=movingStrikeContact(robot,victim,p);
     if(segment){p.resolved=true;applyHit(robot,victim,p,source,segment);}
    }
    if(!p.resolved&&now>=p.impactAt){
     p.resolved=true;
     if(!p.sweepHits?.size){
      recordBossTacticalStrike(bossOpponentMemory(state,p.victim),source,false,now);
      note('combat-miss',{from:robot.id,to:p.victim,source:p.source,bossStyle:p.style});
     }
    }
   }
   if(now<p.endsAt)return true;
   if(p.rearKick)return false;
   if(p.comboIndex===1&&robot.attackSources.some(s=>s.kind!=='head'&&root(s.key)!==root(p.source))){
    state.followup={victim:p.victim,exclude:root(p.source),at:now+BOSS_CONFIG.tactics.followupDelay};
   }else{state.followup=null;ctx.combat.nextStrike[robot.id]=now+BOSS_CONFIG.tactics.seriesRest;}
   return false;
  });
  if(remaining.length!==strikes.length)setPendingStrikes(robot.id,remaining);
 }
 function begin(robot,candidate,timing,{style='jab',comboIndex,rearKick=false}={}){
  const target=candidate.victim,source=candidate.source;
  const p={victim:target.id,segment:candidate.segment,source:source.key,aim:{...(candidate.aim??target.center)},direction:robot.angle,style,comboIndex,timing,
   started:ctx.game.time,impactAt:ctx.game.time+timing.windupSec+timing.thrustSec,endsAt:ctx.game.time+duration(timing),at:ctx.game.time+timing.windupSec,resolved:false};
  if(style==='sweep'){p.sweepHits=new Set();p.sweepLanded=new Set();}
  if(rearKick){
   const [primary]=pendingStrikes(robot.id);
   primary.rearKickStarted=true;
   p.rearKick=true;
   setPendingStrikes(robot.id,[primary,p]);
  }else{
   setPendingStrikes(robot.id,[p]);ctx.combat.nextStrike[robot.id]=p.endsAt;
   state.lastAttackSource=source.key;
  }
  ctx.combat.strikes++;ctx.combat.fighterSwings[robot.id]++;
  note('combat-windup',{from:robot.id,to:target.id,source:source.key,bossStyle:style,comboIndex});
 }
 function planCombat(robot){
  if(!robot.visible||!robot.mobile||ctx.combat.finished||state.charge||robot.actualPose.leap||ctx.game.time<robot.combatRecoverUntil)return;
  const cfg=BOSS_CONFIG.tactics,now=ctx.game.time;
  const [primary,secondary]=pendingStrikes(robot.id);
  if(primary){
   // Keep the front attack committed, but let a spare leg react to an
   // opponent that comes within its real reach during the swing.
   if(!secondary&&!primary.rearKick&&!primary.rearKickStarted&&!primary.source.startsWith('leg-')){
    const kick=rearKickCandidate(robot,primary.victim);
    if(kick)begin(robot,kick,cfg.first,{style:'kick',rearKick:true});
   }
   return;
  }
  if(state.quickStrike){
   const quick=state.quickStrike;state.quickStrike=null;
   const victim=ctx.robots[quick.victim];
   if(now<=quick.until&&victim?.mobile&&victim.visible&&robot.canSee(victim.center)){
    const candidate=ordinaryCandidates(robot,victim).find(c=>c.source.key===quick.source&&c.source.kind!=='head');
    if(candidate){
     begin(robot,candidate,{...cfg.first,windupSec:cfg.chargeAttackWindup});
     return;
    }
   }
   ctx.combat.nextStrike[robot.id]=Math.max(ctx.combat.nextStrike[robot.id],now+cfg.chargeRecovery);
   return;
  }
  if(state.followup){
   const follow=state.followup;if(now<follow.at)return;
   const victim=ctx.robots[follow.victim];state.followup=null;
   if(victim?.mobile&&victim.visible){
    const wide=state.phase===2?wideCandidate(robot,victim,cfg.sweep,follow.exclude):null;
    const jab=ordinaryCandidates(robot,victim).find(c=>c.source.kind!=='head'&&root(c.source.key)!==follow.exclude);
    if(wide){begin(robot,wide,cfg.sweep,{style:'sweep',comboIndex:2});return;}
    if(jab){begin(robot,jab,cfg.second,{comboIndex:2});return;}
   }
   ctx.combat.nextStrike[robot.id]=now+cfg.seriesRest;return;
  }
  if(now<ctx.combat.nextStrike[robot.id])return;
  const target=targetFor(robot);if(!target)return;
  const seen=robot.canSee(target.center);
  const noFrontArms=!robot.attackSources.some(s=>s.kind==='arm'&&s.key.endsWith('-lower')&&!s.key.includes('pair2'));
  const options=ordinaryCandidates(robot,target).filter(c=>(seen||c.source.kind==='leg')&&(!noFrontArms||c.source.kind!=='head'));
  const wantsWide=state.cycles%(state.phase===2?2:3)===(state.phase===2?1:2);
  const wide=wantsWide&&(seen||options.length)?wideCandidate(robot,target,cfg.sweep):null;
  if(wide){state.cycles++;begin(robot,wide,cfg.sweep,{style:'sweep'});return;}
  const preferred=noFrontArms?(options.find(c=>c.source.kind==='leg')??options.find(c=>isBossStump(c.source))??options[0]):options[0];
  const candidate=preferred??rearKickCandidate(robot,target.id);if(!candidate)return;
  state.cycles++;begin(robot,candidate,candidate.source.kind==='head'?BOSS_CONFIG.combat:cfg.first,{comboIndex:candidate.source.kind==='head'?undefined:1});
 }
 return {state,intent,resolveCombat,planCombat};
}
