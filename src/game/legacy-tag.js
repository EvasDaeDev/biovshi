import { ctx } from "./state.js";
import { CONFIG } from "../config.js";
import { eligible, setTarget } from "../systems/ai.js";
import { note } from "./events.js";
import { sightClear, touchGap } from "../systems/collision.js";
import { burst } from "../render/effects.js";
export
// Неудачная атака не должна немедленно возобновляться от того же касания лап.

// Выполняется после движения: охотник доводит прыжок к актуальному положению жертвы.
function releaseFailedApproach(attacker, victim, reason) {
  attacker.cancelCover();
  ctx.game.ceremony = null;
  ctx.game.bans[attacker.id][victim.id] = ctx.game.time + CONFIG.attack.missedTargetCooldownSec;
  setTarget(null);
  ctx.game.lastSeen = null;
  ctx.game.lostFor = 0;
  const ai = ctx.agentAI[attacker.id];
  ai.yieldFrom = {
    x: victim.x,
    y: victim.y
  };
  ai.yieldUntil = ctx.game.time + CONFIG.attack.missedAttackRetreatSec;
  ai.goal = null;
  ai.nextChoice = 0;
  // Не сбрасываем освобождение лап жертвы: теперь охотник даёт ей закончить манёвр.
  const runner = ctx.agentAI[victim.id];
  runner.nextChoice = 0;
  runner.goal = null;
  ctx.intents = [];
  ctx.brainDebt = .1;
  note('capture-missed', {
    from: attacker.id,
    to: victim.id,
    reason,
    retryAfter: ctx.game.bans[attacker.id][victim.id]
  });
}
export function tagIfTouched() {
  if (ctx.game.ceremony || ctx.game.time < ctx.game.readyAt) return;
  const hunter = ctx.robots[ctx.game.hunter];
  for (const other of ctx.robots) if (eligible(other.id) && touchGap(hunter, other) < 2.8) {
    if (!hunter.canCover(other)) {
      releaseFailedApproach(hunter, other, 'blocked-before-jump');
      return;
    }
    // Касание начинает доведение прыжка; жертва ещё свободна, очко не начислено.
    ctx.game.ceremony = {
      from: hunter.id,
      to: other.id,
      approachStarted: ctx.game.time,
      started: ctx.game.time,
      landingAt: ctx.game.time + CONFIG.attack.coverApproachSec,
      landed: false,
      ends: Infinity
    };
    hunter.beginApproach(other);
    if (['startle', 'scratch', 'stretch', 'hops'].includes(other.state)) other.endScene();
    const ai = ctx.agentAI[other.id];
    ai.threat = {
      x: hunter.x,
      y: hunter.y
    };
    ai.threatUntil = ctx.game.time + ctx.FLEE_MEMORY;
    ai.seeingHunter = true;
    ai.seenHunterId = hunter.id;
    ai.goal = null;
    ai.nextChoice = 0;
    note('capture-approach', {
      from: hunter.id,
      to: other.id
    });
    ctx.intents = [];
    return;
  }
}
export function landAttackIfReady() {
  const c = ctx.game.ceremony;
  if (!c || c.landed) return;
  const attacker = ctx.robots[c.from],
    victim = ctx.robots[c.to];
  attacker.trackCover(victim);
  if (ctx.game.time + 1e-9 < c.landingAt) return;
  // Если препятствие помешало накрыть жертву, захват и очко не засчитываются.
  if (attacker.coverGap(victim) > CONFIG.attack.coverCenterGapCm + 4 || !sightClear(attacker.center, victim.center)) {
    releaseFailedApproach(attacker, victim, 'blocked-at-landing');
    return;
  }
  c.landed = true;
  c.started = ctx.game.time;
  c.ends = ctx.game.time + CONFIG.attack.eatSec;
  ctx.game.tags++;
  ctx.game.scores[c.from]++;
  ctx.game.target = null;
  ctx.game.lastSeen = null;
  ctx.game.lostFor = 0;
  attacker.beginScene('eat', CONFIG.attack.eatSec);
  victim.beginScene('caught', CONFIG.attack.eatSec);
  ctx.game.immune[c.from] = c.ends + CONFIG.attack.previousHunterShieldSec;
  const p = {
    x: (attacker.eye.x + attacker.actualPose.offset.x + victim.eye.x) / 2,
    y: (attacker.eye.y + attacker.actualPose.offset.y + victim.eye.y) / 2
  };
  burst(p.x, p.y);
  ctx.pulses.push({
    ...p,
    time: ctx.game.time
  });
  if (ctx.pulses.length > 6) ctx.pulses.shift();
  note('tag', {
    from: c.from,
    to: c.to,
    gap: touchGap(attacker, victim)
  });
  note('attack-land', {
    from: c.from,
    to: c.to
  });
  ctx.intents = [];
  ctx.brainDebt = .1;
}
export function finishCeremony() {
  const c = ctx.game.ceremony;
  if (!c || ctx.game.time < c.ends) return;
  for (const id of [c.from, c.to]) ctx.robots[id].endScene();
  ctx.robots[c.from].reboundFrom(ctx.robots[c.to]);
  ctx.game.hunter = c.to;
  ctx.game.readyAt = ctx.game.time + CONFIG.attack.newHunterDelaySec;
  ctx.game.immune[c.from] = ctx.game.time + CONFIG.attack.previousHunterShieldSec;
  ctx.game.bans[c.to][c.from] = ctx.game.time + CONFIG.attack.previousHunterShieldSec;
  ctx.agentAI[c.from].threat = {
    x: ctx.robots[c.to].x,
    y: ctx.robots[c.to].y
  };
  ctx.agentAI[c.from].threatUntil = ctx.game.time + ctx.FLEE_MEMORY;
  for (const ai of ctx.agentAI) {
    ai.goal = null;
    ai.nextChoice = 0;
    ai.yieldUntil = 0;
    ai.seeingHunter = false;
  }
  ctx.game.ceremony = null;
  ctx.intents = [];
  note('role-change', {
    from: c.from,
    to: c.to
  });
}
// Тактический бой: каждый удар имеет источник (рука или голова), цель и время замаха.
