import {settleTower} from '../tower/ui.js';
import {patientGarage} from '../game/patients.js';
import {critChance} from '../garage/model.js';
import {random} from '../utils/random.js';
import { clamp, wrap, smooth } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { sightClear, coreClearBone } from "./collision.js";
import { pointSegment } from "../utils/math.js";
import { note } from "../game/events.js";
import { activeOpponents } from "./ai.js";
import { bettingSettle } from "../betting/ui.js";
export
// Непрерывная кинематика удара. Урон возможен лишь в конце фазы выпада.
function strikeProgress(p) {
  const cfg = CONFIG.combat,
    age = Math.max(0, ctx.game.time - p.started);
  const wind = cfg.windupSec,
    thrust = cfg.thrustSec,
    recover = cfg.recoverSec;
  if (age < wind) return {
    reach: 0,
    wind: smooth(age / wind),
    phase: 'windup'
  };
  if (age < wind + thrust) return {
    reach: smooth((age - wind) / thrust),
    wind: 1,
    phase: 'thrust'
  };
  if (age < wind + thrust + recover) return {
    reach: 1 - smooth((age - wind - thrust) / recover),
    wind: 0,
    phase: 'recover'
  };
  return {
    reach: 0,
    wind: 0,
    phase: 'finished'
  };
}
// Legs strike away from the pelvis: their own side and a shared rear cone.
export function inStrikeSector(attacker, source, point) {
  const frame = source.kind === 'leg' ? attacker.actualPose.pelvis : attacker;
  const angle = wrap(Math.atan2(point.y-frame.y, point.x-frame.x)-frame.angle);
  if (source.kind !== 'leg') return Math.abs(angle) <= (source.kind === 'head' ? .48 : 1.28);
  // Own side from 60 degrees back; the rear 40-degree cone is shared.
  return Math.abs(angle) >= Math.PI*8/9 || angle*source.side >= Math.PI/3;
}
export function kickPathClear(attacker, pending) {
  const cfg=CONFIG.combat;
  // Check the knee and both bones throughout tuck, extension and return.
  const duration=cfg.windupSec+cfg.thrustSec+cfg.recoverSec;
  const ages=[cfg.windupSec,cfg.windupSec+cfg.thrustSec,
    ...Array.from({length:17},(_,i)=>duration*i/16)];
  for(const age of ages){
    const pose=attacker.attackPose({...pending,preview:false,started:ctx.game.time-age});
    if(!pose || !coreClearBone(pose.shoulder,pose.joint,6.8*ctx.scale)
      || pose.complete && !coreClearBone(pose.joint,pose.tip,5.8*ctx.scale))return false;
  }
  return true;
}
export function strikeCandidates(attacker, victim, source) {
  if (!attacker.attackSources.some(s => s.key === source.key)) return [];
  const facing = attacker.angle;
  if (!inStrikeSector(attacker,source,source.kind==='leg'?victim.center:victim)) return [];
  if (!sightClear(attacker.center, victim.center)) return [];
  return victim.capsules.filter(c => c.segment && victim.isDamageable(c.segment)).map(c => {
    const dx = c.b.x - c.a.x,
      dy = c.b.y - c.a.y;
    const q = clamp(((source.point.x - c.a.x) * dx + (source.point.y - c.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const aim = {
      x: c.a.x + dx * q,
      y: c.a.y + dy * q
    };
    if (source.kind==='leg' && !inStrikeSector(attacker,source,aim)) return null;
    const dist = pointSegment(source.point, c.a, c.b) - c.r;
    if(dist>(CONFIG.combat.strikeReachCm+(source.kind==='head'?9:17.25))*(source.reachFactor||1))return null;
    // An unseen rear opponent is sensed only near the attacking foot/stump.
    if(source.kind==='leg' && !attacker.canSee(victim.center)
      && dist>CONFIG.combat.contactSenseCm)return null;
    const towards = Math.atan2(aim.y - attacker.y, aim.x - attacker.x);
    const off = Math.abs(wrap(towards - facing));
    const maybe = {
      source: source.key,
      aim,
      started: ctx.game.time,
      preview: true
    };
    const physical = attacker.attackPose(maybe);
    if (!physical) return null;
    // Проверяем реальную досягаемость плеча/головы вместо «магической» дистанции.
    const gap = pointSegment(physical.tip, c.a, c.b) - c.r;
    if(source.kind==='leg' && (gap>3.5 || !kickPathClear(attacker,maybe)))return null;
    const score = dist + off * 15 + Math.max(0, gap) * 3 + (c.segment.startsWith('spine') ? 2 : 0);
    return {
      victim,
      segment: c.segment,
      source,
      dist,
      score,
      aim,
      gap
    };
  }).filter(c => c && c.dist <= (CONFIG.combat.strikeReachCm + (source.kind === 'head' ? 9 : 17.25)) * (source.reachFactor || 1) && c.gap <= 3.5).sort(compareStrikeCandidates);
}
export function struckSegment(attacker, victim, p) {
  const pose = attacker.attackPose(p);
  if (!pose) return null;
  if (pose.kind==='leg' && !kickPathClear(attacker,p)) return null;
  if (!sightClear(attacker.center, victim.center)) return null;
  const rest = attacker.attackPose({...p,
    started:ctx.game.time-(pose.kind==='leg'?CONFIG.combat.windupSec:0),preview:false});
  if (!rest) return null;
  const capsules = victim.capsules.filter(c=>c.segment && victim.isDamageable(c.segment));
  // Sweep along the actual limb/head thrust rather than teleporting the hit
  // directly to the aimed segment. The earliest physical collision wins.
  for (let step=0;step<=12;step++) {
    const t=step/12;
    const point={
      x:rest.tip.x+(pose.tip.x-rest.tip.x)*t,
      y:rest.tip.y+(pose.tip.y-rest.tip.y)*t
    };
    let first=null;
    for (const c of capsules) {
      const gap=pointSegment(point,c.a,c.b)-c.r;
      if (gap<=2.2 && (!first || gap<first.gap)) first={segment:c.segment,gap};
    }
    if (first) return first.segment;
  }
  return null;
}
export function strikePriority(candidate) {
  return candidate.score + (candidate.source.kind === 'head' ? 1000
    : candidate.source.kind === 'leg' ? 4 : 0);
}
export function compareStrikeCandidates(a,b,{moving=false}={}) {
  if(moving){const rank=c=>c.source.kind==='arm'?0:c.source.kind==='head'?1:2;const preference=rank(a)-rank(b);if(preference)return preference;}
  // Rank only physically reachable targets; never reposition to seek a limb.
  // Other damageable parts (including the tail) share the torso tier.
  const tier=c=>/^(arm|leg)-/.test(c.segment)?0:c.segment==='head'?2:1;
  return tier(a)-tier(b) || strikePriority(a)-strikePriority(b);
}
// Every opportunity is considered once, not every frame: otherwise 20%
// would become effectively certain over a few seconds.
export function pounceOpportunity(attacker,victim) {
  const cfg=CONFIG.attack;
  const distance=Math.hypot(attacker.x-victim.x,attacker.y-victim.y);
  return attacker.hasHead && attacker.movementLimbs>=2
    && victim.mobile && victim.visible
    && distance>=cfg.combatPounceMinCm && distance<=cfg.combatPounceMaxCm
    && attacker.canSee(victim.center)
    && sightClear(attacker.center,victim.center)
    && coreClearBone(attacker.center,victim.center,9);
}
export function pounceContactSegment(from,to,capsules,isDamageable=()=>true,headRadius=13.5) {
  if(!from||!to)return null;
  // Sweep the head between physics ticks; even a fast jump cannot tunnel
  // through a victim. Only the actual contacted body segment is damaged.
  for(let i=0;i<=12;i++){
    const t=i/12,point={x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};
    let closest=null;
    for(const c of capsules){
      if(!c.segment||!isDamageable(c.segment))continue;
      const gap=pointSegment(point,c.a,c.b)-c.r;
      // Head collision has a 13 cm solid radius; collision avoidance
      // prevents centres getting any closer. The attack must use the
      // same contact envelope or a blocked jump can never damage.
      if(gap<=headRadius && (!closest || gap<closest.gap))
        closest={segment:c.segment,gap};
    }
    if(closest)return closest.segment;
  }
  return null;
}
function resolvePounceImpacts() {
  for(const attacker of ctx.robots){
    const leap=attacker.actualPose.leap;
    if(!leap?.launched||leap.kind!=='combat-pounce'||leap.impactDone)continue;
    const current={...attacker.eye};
    const previous=leap.lastHead??current;
    leap.lastHead=current;
    // Shifting the body back over planted feet is preparation, not impact.
    if(!leap.soundStarted)continue;
    const victim=ctx.robots[leap.victim];
    if(!victim?.mobile||!victim.visible||!attacker.hasHead)return;
    const touched=pounceContactSegment(previous,current,victim.capsules,
      segment=>victim.isDamageable(segment),13*ctx.scale+.5);
    if(!touched)return;
    leap.impactDone=true;
    const id=attacker.id;
    if(victim.damage(touched,id,CONFIG.attack.combatPounceDamage)){
      if(victim.mobile)victim.reactToHit(attacker,touched);
      ctx.combat.hits++;
      ctx.combat.fighterHits[id]++;
      ctx.combat.fighterTaken[victim.id]++;
      ctx.combat.lastHitTime=ctx.game.time;
      ctx.agentAI[id].lastHitAt=ctx.game.time;
      ctx.agentAI[victim.id].lastHitAt=ctx.game.time;
      note('combat-strike',{from:id,to:victim.id,
        source:'head',segment:touched,pounce:true});
      if(victim.mobile&&victim.movementLimbs<4){
        ctx.combat.retreatUntil[victim.id]=ctx.game.time+CONFIG.combat.retreatSec;
        ctx.combat.retreatFrom[victim.id]=id;
      }
    }
  }
}
function initiateCombatPounces() {
  for(const attacker of ctx.robots){
    const id=attacker.id,ai=ctx.agentAI[id];
    if(!attacker.visible||!attacker.mobile||!attacker.hasHead||
       attacker.actualPose.leap||attacker.actualPose.scene||
       ctx.combat.pending[id]||ctx.game.time<ctx.combat.nextStrike[id]||
       ctx.game.time<attacker.combatRecoverUntil||
       ctx.game.time<(ai.nextPounceDecisionAt??0))continue;
    // A reachable side/rear kick takes precedence over turning around for a leap.
    if(activeOpponents(id).some(v=>attacker.attackSources.some(source=>
      source.kind==='leg' && strikeCandidates(attacker,v,source).length>0)))continue;
    const target=activeOpponents(id)
      .filter(v=>pounceOpportunity(attacker,v))
      .filter(v=>ctx.mode!=='tower'||id!==0||Math.abs(wrap(Math.atan2(v.center.y-attacker.y,v.center.x-attacker.x)-attacker.actualPose.chest.angle))<=CONFIG.attack.pounceAlignDeg*Math.PI/180)
      .sort((a,b)=>Math.hypot(a.x-attacker.x,a.y-attacker.y)
        -Math.hypot(b.x-attacker.x,b.y-attacker.y))[0];
    if(!target)continue;
    ai.nextPounceDecisionAt=ctx.game.time+CONFIG.attack.combatPounceDecisionSec;
    if(random()>=CONFIG.attack.combatPounceChance)continue;
    if(attacker.pounce(target.center,{victimId:target.id})){
      // A successful leap suspends ONLY subsequent leap decisions, not
      // ordinary attacks after the 0.4 s recovery.
      ai.nextPounceDecisionAt=ctx.game.time+CONFIG.attack.pounceCooldownSec;
      ctx.combat.fighterSwings[id]++;
      ctx.combat.strikes++;
    }
  }
}
export function finishingPounceInProgress(robot,time) {
  const kind=robot?.actualPose?.leap?.kind;
  return kind==='combat-pounce'||kind==='combat-retreat'
    || time<(robot?.combatRecoverUntil??0);
}
export function combatAttacks() {
  if (ctx.combat.finished) return;
  resolvePounceImpacts();
  // Один реальный удар: замах -> движение -> касание -> возврат в опору.
  for (const attacker of ctx.robots) {
    const id = attacker.id,
      pending = ctx.combat.pending[id];
    if (!pending) continue;
    if (!pending.resolved && ctx.game.time >= pending.impactAt) {
      pending.resolved = true;
      const victim = ctx.robots[pending.victim];
      const src = attacker.attackSources.find(s => s.key === pending.source);
      if (attacker.visible && src && victim?.visible && victim.hasHead && victim.segmentCount > 0) {
        const touched = struckSegment(attacker, victim, pending);
        const damage=touched&&random()<critChance(patientGarage()?.[id]?.stats[1]??3)?2:1;
        if (touched && victim.damage(touched, id, damage)) {
          if (victim.mobile) victim.reactToHit(attacker, touched);
          ctx.combat.hits++;
          ctx.combat.fighterHits[id]++;
          ctx.combat.fighterTaken[victim.id]++;
          ctx.combat.lastHitTime = ctx.game.time;
          ctx.agentAI[id].lastHitAt = ctx.game.time;
          ctx.agentAI[victim.id].lastHitAt = ctx.game.time;
          note('combat-strike', {
            from: id,
            to: victim.id,
            source: pending.source,
            segment: touched
          });
          if (victim.mobile && victim.movementLimbs < 4) {
            ctx.combat.retreatUntil[victim.id] = ctx.game.time + CONFIG.combat.retreatSec;
            ctx.combat.retreatFrom[victim.id] = id;
          }
        } else note('combat-miss', {
          from: id,
          to: victim.id,
          source: pending.source
        });
      }
    }
    if (ctx.game.time >= pending.endsAt) ctx.combat.pending[id] = null;
  }
  initiateCombatPounces();
  // Удары отдаются по одному каждому бойцу, не автоматически обоим при контакте.
  for (const attacker of ctx.robots) {
    const id = attacker.id;
    if (!attacker.visible || !attacker.mobile || ctx.game.time < ctx.combat.nextStrike[id] || ctx.combat.pending[id] || attacker.actualPose.leap || ctx.game.time < attacker.combatRecoverUntil) continue;
    // Reach is measured from each attacking limb, including the rear pelvis.
    const preferredVictims = activeOpponents(id);
    const moving=Math.hypot(attacker.velocity?.x??0,attacker.velocity?.y??0)>5||ctx.intents[id]?.speed>5;
    let best = null;
    for (const v of preferredVictims) for (const source of attacker.attackSources) {
      // Head strikes remain possible even when other limbs are intact.
      for (const c of strikeCandidates(attacker, v, source)) {
        // Prefer hands on the move, then retain target tiers and geometry scores.
        if (!best || compareStrikeCandidates(c,best,{moving})<0) best = c;
      }
    }
    if (best) {
      ctx.combat.pending[id] = {
        victim: best.victim.id,
        segment: best.segment,
        source: best.source.key,
        aim: {
          ...best.aim
        },
        started: ctx.game.time,
        impactAt: ctx.game.time + CONFIG.combat.windupSec + CONFIG.combat.thrustSec,
        endsAt: ctx.game.time + CONFIG.combat.windupSec + CONFIG.combat.thrustSec + CONFIG.combat.recoverSec,
        at: ctx.game.time + CONFIG.combat.windupSec,
        resolved: false
      };
      ctx.combat.strikes++;
      ctx.combat.fighterSwings[id]++;
      ctx.combat.nextStrike[id] = ctx.game.time + CONFIG.combat.attackCooldownSec * (1 + .16 * (4 - attacker.spineCount));
      note('combat-windup', {
        from: id,
        to: best.victim.id,
        source: best.source.key
      });
    }
  }
  const mobile = ctx.robots.filter(r => r.mobile && r.visible && r.segmentCount > 0);
  // A headbutt that wins the fight must still complete its backward hop
  // and landing recovery before switching to the victory animation.
  if ((mobile.length <= 1 || ctx.mode==='tower'&&!ctx.robots[0].mobile) && ctx.robots.every(r => r.visible)
      && !mobile.some(r=>finishingPounceInProgress(r,ctx.game.time))) {
    ctx.combat.finished = true;
    ctx.combat.winner = ctx.mode==='tower'&&!ctx.robots[0].mobile?null:mobile.length === 1 ? mobile[0].id : null;
    ctx.combat.finishedAt = ctx.game.time;
    ctx.combat.pending.fill(null); // Замахи больше не рисуются после финального удара.
    if(mobile.length===1&&ctx.combat.winner!==null)mobile[0].celebrateVictory();
    if(ctx.mode==='tower')settleTower(ctx.combat.winner);else bettingSettle(ctx.combat.winner);
    note('combat-end', {
      winner: ctx.combat.winner
    });
    // Итоги будут показаны после трёх секунд работы существующего игрового цикла.
  }
}
