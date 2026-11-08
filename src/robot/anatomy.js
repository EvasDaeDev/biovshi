import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { CONFIG } from "../config.js";
import { ik } from "../utils/math.js";
import { burst, createOilDrop, flashSeveredParts } from "../render/effects.js";
import { note } from "../game/events.js";
import { random } from "../utils/random.js";
import { snapshotRobotSkin } from '../render/robot-skin.js';
import { createInertia } from '../render/inertia.js';
import { spawnHitEffect } from '../render/hit-effects.js';
export
// Children of a severed node detach with it, regardless of remaining HP.
function descendants(robotState, root) {
  const result = [],
    queue = [root];
  while (queue.length) {
    const branch = queue.shift();
    for (const [part, holder] of robotState.parent) if (holder === branch) {
      result.push(part);
      queue.push(part);
    }
  }
  return result;
}
export function segmentGeometry(robotState, key) {
  if (key === 'head') return {
    kind: 'head',
    x: robotState.api.eye.x,
    y: robotState.api.eye.y,
    r: 10 * ctx.scale
  };
  if (key.startsWith('spine-')) {
    const i = Number(key.slice(6));
    if (i >= 0 && i < 4) return {
      kind: 'bone',
      a: {
        ...robotState.spine[i]
      },
      b: {
        ...robotState.spine[i + 1]
      },
      w: CONFIG.robot.vertebraBaseCm * ctx.scale
    };
  }
  const m = /^(arm|leg)-(-?1)-(upper|lower)$/.exec(key);
  if (!m) return null;
  const limb = (m[1] === 'arm' ? robotState.arms : robotState.legs).find(l => l.side === Number(m[2]));
  if (!limb) return null;
  const a = robotState.origin(limb),
    pose = ik(a, robotState.handEnd(limb), ...robotState.lengths(limb), limb.kind === 'arm' ? limb.side : -limb.side);
  return m[3] === 'upper' ? {
    kind: 'bone',
    a: {
      ...a
    },
    b: {
      ...pose.joint
    },
    w: 3 * ctx.scale
  } : {
    kind: 'bone',
    a: {
      ...pose.joint
    },
    b: {
      ...pose.end
    },
    w: 3 * ctx.scale
  };
}
export function leakOrigin(robotState, key) {
  if (key === 'head') return robotState.local(robotState.headFrame, 18 + robotState.headMotion, 0);
  if (key.startsWith('spine-')) {
    const i = Math.max(0, Math.min(3, Number(key.split('-')[1]) || 0));
    return {
      x: (robotState.spine[i].x + robotState.spine[i + 1].x) / 2,
      y: (robotState.spine[i].y + robotState.spine[i + 1].y) / 2
    };
  }
  const parts = key.split('-');
  if (parts.length >= 3) {
    const kind = parts[0],
      side = Number(parts[1]),
      part = parts[2];
    const pool = kind === 'arm' ? robotState.arms : kind === 'leg' ? robotState.legs : [];
    const limb = pool.find(l => l.side === side);
    if (limb) {
      const a = robotState.origin(limb),
        solved = ik(a, robotState.handEnd(limb), ...robotState.lengths(limb), limb.kind === 'arm' ? limb.side : -limb.side);
      if (part === 'upper') return {
        x: (a.x + solved.joint.x) / 2,
        y: (a.y + solved.joint.y) / 2
      };
      return {
        x: solved.joint.x,
        y: solved.joint.y
      };
    }
  }
  return {
    x: robotState.x,
    y: robotState.y
  };
}
export function finishMobility(robotState, reason, impact = robotState.lastImpact) {
  if(impact)robotState.corpseInertia=createInertia(impact.direction,robotState.api.capsules);
  ctx.combat.oilLeaks = ctx.combat.oilLeaks.filter(leak => leak.robot !== robotState.id);
  const center = robotState.api.center;
  createOilDrop(robotState.id, center.x, center.y, 15);
  robotState.leap = null;
  if (robotState.scene) robotState.api.endScene();
  robotState.vx = robotState.vy = 0;
  robotState.recoilX = robotState.recoilY = 0;
  robotState.hitReaction = null;
  ctx.combat.pending[robotState.id] = null;
  ctx.combat.unarmedDeadline[robotState.id] = null;
  for (let i = 0; i < ctx.ROBOT_COUNT; i++) {
    if (ctx.combat.focus[i] === robotState.id) {
      ctx.combat.focus[i] = -1;
      ctx.combat.focusUntil[i] = 0;
    }
    if (ctx.combat.pending[i]?.victim === robotState.id) ctx.combat.pending[i] = null;
    if (ctx.combat.retreatFrom[i] === robotState.id) {
      ctx.combat.retreatUntil[i] = 0;
      ctx.combat.retreatFrom[i] = -1;
    }
    if (ctx.agentAI[i].threat === robotState.id) {
      ctx.agentAI[i].threat = null;
      ctx.agentAI[i].threatUntil = 0;
      ctx.agentAI[i].goal = null;
    }
    ctx.combat.escapeUntil[i] = 0;
    ctx.combat.escapeGoal[i] = null;
  }
  ctx.intents = [];
  ctx.brainDebt = .1;
  note('robot-immobilized', {
    robot: robotState.id,
    reason
  });
}
export function reactToHit(robotState, attacker, segment) {
  if (!robotState.mobile()) return;
  const source = attacker || {
    x: robotState.x - Math.cos(robotState.angle),
    y: robotState.y - Math.sin(robotState.angle)
  };
  let dx = robotState.x - source.x,
    dy = robotState.y - source.y;
  const dist = Math.hypot(dx, dy) || 1;
  dx /= dist;
  dy /= dist;
  const lateral = Math.sin(robotState.angle) * dx - Math.cos(robotState.angle) * dy;
  // Larger torso/head impact, smaller limb hit. 35-50 cm/s initial impulse.
  const strength = segment === 'head' || segment.startsWith('spine-') ? 49 : 34;
  robotState.recoilX = dx * strength;
  robotState.recoilY = dy * strength;
  robotState.hitReaction = {
    start: ctx.game.time,
    duration: .52,
    twist: clamp(lateral * 11, -11, 11),
    previousVelocity: {
      x: robotState.vx,
      y: robotState.vy
    }
  };
  if (robotState.scene && robotState.idleKinds.includes(robotState.mode)) robotState.api.endScene();
  robotState.nextIdleAt = Math.max(robotState.nextIdleAt, ctx.game.time + .75);
  note('impact-reaction', {
    robot: robotState.id,
    from: attacker?.id,
    segment
  });
}
export function robotFailFromOilLoss(robotState) {
  if (!robotState.mobile() || robotState.api.attackSources.length > 0) return false;
  robotState.bledOut = true;
  robotState.finishMobility('истёк маслом');
  robotState.api.capsules = robotState.makeCapsules();
  return true;
}
export function robotDamage(robotState, key, by) {
  if (!key || !robotState.isDamageable(key) || !robotState.hp.has(key) || robotState.broken.has(key) || ctx.game.time - (robotState.hitAt.get(key) ?? -99) < CONFIG.combat.damageInvulnerabilitySec) return false;
  robotState.hitAt.set(key, ctx.game.time);
  robotState.hp.set(key, robotState.hp.get(key) - 1);
  const caps = robotState.api.capsules.filter(c => c.segment === key);
  const pivot = caps.length ? {
    x: (caps[0].a.x + caps[0].b.x) / 2,
    y: (caps[0].a.y + caps[0].b.y) / 2
  } : {
    x: robotState.x,
    y: robotState.y
  };
  burst(pivot.x, pivot.y);
  const attacker=ctx.robots[by];
  const direction=attacker&&attacker.id!==robotState.id?
    Math.atan2(pivot.y-attacker.y,pivot.x-attacker.x):robotState.angle;
  robotState.lastImpact={direction,point:{...pivot}};
  spawnHitEffect(pivot.x,pivot.y,direction,robotState.hp.get(key)<=0);
  ctx.pulses.push({
    ...pivot,
    time: ctx.game.time
  });
  if (ctx.pulses.length > 6) ctx.pulses.shift();
  if (robotState.hp.get(key) <= 0) {
    const wasMobile = robotState.mobile();
    const attached = robotState.descendants(key).filter(part => robotState.healthy(part));
    flashSeveredParts([key, ...attached].map(part => robotState.segmentGeometry(part)).filter(Boolean));
    // Preserve the detached geometry in world coordinates, as a visible wreck.
    const wreckKeys=[key,...attached];
    const wreckPieces = wreckKeys.map(part => ({
      key: part,
      geometry: robotState.segmentGeometry(part),
      skin: snapshotRobotSkin(robotState,part)
    })).filter(p => p.geometry);
    if (wreckPieces.length) ctx.combat.detached.push({
      id: robotState.id,
      time: ctx.game.time,
      cause: key,
      inertia:createInertia(direction,robotState.api.capsules.filter(c=>[key,...attached].includes(c.segment))),
      pieces: wreckPieces
    });
    for (const part of [key, ...attached]) {
      robotState.broken.add(part);
      robotState.hp.set(part, 0);
      robotState.hitAt.set(part, ctx.game.time);
    }
    ctx.combat.debris.push({
      x: pivot.x,
      y: pivot.y,
      angle: random() * 6.28,
      key,
      id: robotState.id,
      time: ctx.game.time
    });
    if (ctx.combat.debris.length > 120) ctx.combat.debris.shift();
    // Detached fragments no longer bleed from their former moving positions.
    const severed = new Set([key, ...attached]);
    ctx.combat.oilLeaks = ctx.combat.oilLeaks.filter(leak => leak.robot !== robotState.id || !severed.has(leak.key));
    if (robotState.mobile()) ctx.combat.oilLeaks.push({
      robot: robotState.id,
      key,
      nextAt: ctx.game.time + CONFIG.oil.minIntervalSec + random() * (CONFIG.oil.maxIntervalSec - CONFIG.oil.minIntervalSec)
    });
    if (key === 'head') robotState.currentIntent.lookPoint = null;
    if (wasMobile && !robotState.mobile()) robotState.finishMobility('потерял конечности');
    note('segment-broken', {
      robot: robotState.id,
      segment: key,
      detached: attached,
      by
    });
  } else note('hit', {
    robot: robotState.id,
    segment: key,
    hp: robotState.hp.get(key),
    by
  });
  robotState.api.capsules = robotState.makeCapsules();
  return true;
}
