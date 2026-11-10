import {critChance} from '../garage/model.js';
import {random} from '../utils/random.js';
import { clamp, wrap, smooth } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { sightClear } from "./collision.js";
import { pointSegment } from "../utils/math.js";
import { note } from "../game/events.js";
import { activeOpponents } from "./ai.js";
import { arenaAnnounce } from "../ui/announcements.js";
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
export function strikeCandidates(attacker, victim, source) {
  if (!attacker.attackSources.some(s => s.key === source.key)) return [];
  const facing = attacker.angle;
  const forwardAngle = Math.atan2(victim.y - attacker.y, victim.x - attacker.x);
  const arc = source.kind === 'head' ? .48 : 1.28;
  if (Math.abs(wrap(forwardAngle - facing)) > arc) return [];
  if (!sightClear(attacker.center, victim.center)) return [];
  return victim.capsules.filter(c => c.segment && victim.isDamageable(c.segment)).map(c => {
    const dx = c.b.x - c.a.x,
      dy = c.b.y - c.a.y;
    const q = clamp(((source.point.x - c.a.x) * dx + (source.point.y - c.a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const aim = {
      x: c.a.x + dx * q,
      y: c.a.y + dy * q
    };
    const dist = pointSegment(source.point, c.a, c.b) - c.r;
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
    const maxDistance = source.kind === 'head' ? 12 : source.reachFactor === .5 ? 14 : 28;
    const gap = pointSegment(physical.tip, c.a, c.b) - c.r;
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
  }).filter(c => c && c.dist <= (CONFIG.combat.strikeReachCm + (source.kind === 'head' ? 9 : 17.25)) * (source.reachFactor || 1) && c.gap <= 3.5).sort((a, b) => a.score - b.score);
}
export function struckSegment(attacker, victim, p) {
  const pose = attacker.attackPose(p);
  if (!pose) return null;
  if (!sightClear(attacker.center, victim.center)) return null;
  const rest = attacker.attackPose({...p, started:ctx.game.time, preview:false});
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
export function combatAttacks() {
  if (ctx.combat.finished) return;
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
        const damage=touched&&random()<critChance(ctx.betting?.garage?.[id]?.stats[1]??3)?2:1;
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
  // Удары отдаются по одному каждому бойцу, не автоматически обоим при контакте.
  for (const attacker of ctx.robots) {
    const id = attacker.id;
    if (!attacker.visible || !attacker.mobile || ctx.game.time < ctx.combat.nextStrike[id] || ctx.combat.pending[id]) continue;
    const preferredVictims = activeOpponents(id).filter(v => Math.hypot(v.x - attacker.x, v.y - attacker.y) < CONFIG.combat.attackRangeCm + 56.25);
    let best = null;
    for (const v of preferredVictims) for (const source of attacker.attackSources) {
      // Head strikes remain possible even when other limbs are intact.
      for (const c of strikeCandidates(attacker, v, source)) {
        if (!best || c.score < best.score) best = c;
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
  if (ctx.robots.every(r => r.visible)) {
    if (mobile.length === 2 && ctx.arenaAccent.lastActive > 2) arenaAnnounce('ОСТАЛИСЬ', 'ДВОЕ', 4, 2.3);
    ctx.arenaAccent.lastActive = mobile.length;
  }
  if (mobile.length <= 1 && ctx.robots.every(r => r.visible)) {
    ctx.combat.finished = true;
    ctx.combat.winner = mobile.length === 1 ? mobile[0].id : null;
    ctx.combat.finishedAt = ctx.game.time;
    ctx.combat.pending.fill(null); // Замахи больше не рисуются после финального удара.
    if(mobile.length===1)mobile[0].celebrateVictory();
    bettingSettle(ctx.combat.winner);
    note('combat-end', {
      winner: ctx.combat.winner
    });
    // Итоги будут показаны после трёх секунд работы существующего игрового цикла.
  }
}
