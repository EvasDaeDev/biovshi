import { clamp, wrap } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { random } from "../utils/random.js";
import { coreClearCircle, rectHit } from "./collision.js";
import { arenaClearance } from "../game/arena.js";
import { CONFIG } from "../config.js";
import { newestAudibleEvent, notices } from "./perception.js";
import { strikeCandidates } from "./combat.js";
export function eligible(id) {
  return id !== ctx.game.hunter && ctx.game.time >= ctx.game.immune[id] && ctx.game.time >= ctx.game.bans[ctx.game.hunter][id];
}
export function setTarget(id) {
  if (ctx.game.target !== id) {
    ctx.game.target = id;
    ctx.game.pursuitAt = ctx.game.time;
    ctx.game.pursuitDistance = id === null ? 0 : Math.hypot(ctx.robots[id].x - ctx.robots[ctx.game.hunter].x, ctx.robots[id].y - ctx.robots[ctx.game.hunter].y);
    if (id !== null) ctx.game.lastPursued[id] = ctx.game.time;
  }
}
export function patrol(r) {
  const ai = ctx.agentAI[r.id];
  if (!ai.goal || ctx.game.time > ai.goalUntil || Math.hypot(ai.goal.x - r.x, ai.goal.y - r.y) < 28) {
    const candidates = Array.from({
      length: 30
    }, () => ({
      x: ctx.arenaBoundary.left+60+random()*(ctx.arenaBoundary.right-ctx.arenaBoundary.left-120),
      y: ctx.arenaBoundary.top+60+random()*(ctx.arenaBoundary.bottom-ctx.arenaBoundary.top-120)
    })).filter(p => coreClearCircle(p, 38));
    ai.goal = candidates.sort((a, b) => Math.hypot(b.x - r.x, b.y - r.y) - Math.hypot(a.x - r.x, a.y - r.y))[0] || {
      x: r.x,
      y: r.y
    };
    ai.goalUntil = ctx.game.time + 5 + random() * 5;
  }
  return ai.goal;
}
export function tacticalEscape(r, foe) {
  const id = r.id,
    dist = Math.hypot(r.x - foe.x, r.y - foe.y) || 1;
  const nx = (r.x - foe.x) / dist,
    ny = (r.y - foe.y) / dist;
  const side = ctx.combat.escapeSide[id];
  // Choose a reachable direction instead of repeatedly requesting an obstructed point.
  const directions = [{
    x: -ny * side * .9 + nx * .42,
    y: nx * side * .9 + ny * .42
  }, {
    x: ny * side * .9 + nx * .42,
    y: -nx * side * .9 + ny * .42
  }, {
    x: nx,
    y: ny
  }, {
    x: -ny,
    y: nx
  }, {
    x: ny,
    y: -nx
  }, {
    x: -nx * .35 - ny * side,
    y: -ny * .35 + nx * side
  }];
  for (const dir of directions) {
    for (const length of [110, 75, 45]) {
      const goal = {
        x: clamp(r.x + dir.x * length, 32, 668),
        y: clamp(r.y + dir.y * length, 32, 668)
      };
      if (coreClearCircle(goal, 24) && Math.hypot(goal.x - r.x, goal.y - r.y) > 25 && !ctx.robots.some(o => o.id !== id && o.visible && Math.hypot(goal.x - o.x, goal.y - o.y) < 35)) return goal;
    }
  }
  return patrol(r);
}
export function fleeAllAttackers(r, threats) {
  // Score candidate escape positions against ALL armed opponents; avoid walls and
  // prefer a route that immediately increases the gap to the nearest threat.
  const distances = p => threats.map(o => Math.hypot(o.x - p.x, o.y - p.y));
  const starting = Math.min(...distances(r));
  const nearest = threats.slice().sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
  let best = null,
    bestScore = -Infinity;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12 + r.id % 3 * .07;
    for (const length of [75, 125, 170]) {
      const p = {
        x: clamp(r.x + Math.cos(a) * length, 32, 668),
        y: clamp(r.y + Math.sin(a) * length, 32, 668)
      };
      if (!coreClearCircle(p, 27) || Math.hypot(p.x - r.x, p.y - r.y) < 24) continue;
      const d = Math.min(...distances(p));
      const score = d - starting + Math.min(d, 200) * .2 - (rectHit({
        x: r.x,
        y: r.y
      }, p, null, 14) !== null ? 60 : 0) - Math.max(0, 45 - arenaClearance(p)) * .4;
      if (score > bestScore) {
        best = p;
        bestScore = score;
      }
    }
  }
  return best || tacticalEscape(r, nearest);
}
// Opponents still able to move are the only targets. Detached and immobilized
// bodies remain physical obstacles but no longer attract tactical attention.
export // Непрерывная кинематика удара. Урон возможен лишь в конце фазы выпада.
function activeOpponents(id) {
  return ctx.robots.filter(o => o.id !== id && o.visible && o.mobile && o.segmentCount > 0);
}
export function fighterIntent(r) {
  const here = {
    x: r.x,
    y: r.y
  };
  if (!r.mobile || ctx.combat.finished) return {
    goal: here,
    speed: 0,
    mode: r.mobile ? 'победитель' : 'обездвижен',
    lookPoint: null
  };
  const id = r.id,
    ai = ctx.agentAI[id],
    active = activeOpponents(id);
  if(r.movementLimbs===0){
    const threats=active.filter(o=>o.movementLimbs>0);
    const nearest=active.slice().sort((a,b)=>Math.hypot(a.x-r.x,a.y-r.y)-Math.hypot(b.x-r.x,b.y-r.y))[0];
    return {goal:threats.length?fleeAllAttackers(r,threats):here,speed:threats.length?CONFIG.movement.fleeSpeedCm:0,mode:'пытается спастись',lookPoint:nearest?.center??null};
  }
  if (!active.length) return {
    goal: here,
    speed: 0,
    mode: 'победитель',
    lookPoint: null
  };
  // A mobile fighter with no usable arm or head cannot attack. Flee armed enemies
  // continuously, choosing a safe waypoint rather than periodically turning back.
  if (r.attackSources.length === 0) {
    const threats = active.filter(o => o.attackSources.length > 0);
    if (threats.length) {
      const danger = threats.slice().sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
      if (!ai.disarmedGoal || ctx.game.time >= ai.disarmedGoalUntil || Math.hypot(ai.disarmedGoal.x - r.x, ai.disarmedGoal.y - r.y) < 22 || !coreClearCircle(ai.disarmedGoal, 24)) {
        ai.disarmedGoal = fleeAllAttackers(r, threats);
        ai.disarmedGoalUntil = ctx.game.time + 1.8;
      }
      ctx.combat.pending[id] = null;
      return {
        goal: ai.disarmedGoal,
        speed: CONFIG.movement.fleeSpeedCm,
        mode: 'убегает без оружия',
        lookPoint: r.hasHead ? danger.center : null
      };
    }
    return {
      goal: patrol(r),
      speed: CONFIG.movement.walkSpeedCm,
      mode: 'избегает боя',
      lookPoint: null
    };
  }

  // Do not keep escape manoeuvres once their underlying target has moved or been disabled.
  if (ctx.game.time < ctx.combat.escapeUntil[id] && ctx.combat.escapeGoal[id]) {
    const goal = ctx.combat.escapeGoal[id];
    if (Math.hypot(goal.x - r.x, goal.y - r.y) > 25) return {
      goal,
      speed: CONFIG.movement.fleeSpeedCm,
      mode: 'меняет позицию',
      lookPoint: null
    };
    ctx.combat.escapeUntil[id] = 0;
    ctx.combat.escapeGoal[id] = null;
  }
  const warning = ctx.combat.pending.findIndex(p => p?.victim === id && p.at > ctx.game.time && ctx.robots[p.victim]?.mobile);
  if (warning >= 0 && r.hasHead && r.movementLimbs >= 1) {
    const enemy = ctx.robots[warning];
    if (enemy.mobile && notices(r, enemy)) {
      const dx = r.x - enemy.x,
        dy = r.y - enemy.y,
        dist = Math.hypot(dx, dy) || 1;
      const side = (id + warning) % 2 ? 1 : -1;
      const goal = {
        x: clamp(r.x - dy / dist * side * 85 + dx / dist * 55, 40, 660),
        y: clamp(r.y + dx / dist * side * 85 + dy / dist * 55, 40, 660)
      };
      if (coreClearCircle(goal, 25)) return {
        goal,
        speed: CONFIG.movement.fleeSpeedCm * 1.10,
        mode: 'уклоняется',
        lookPoint: enemy.center
      };
    }
  }
  const visible = active.filter(o => r.hasHead ? notices(r, o) : Math.hypot(r.x - o.x, r.y - o.y) < CONFIG.combat.contactSenseCm);
  visible.sort((a, b) => {
    const rank = o => {const distance=Math.hypot(o.x-r.x,o.y-r.y);const stats=ctx.betting?.garage?.[o.id]?.stats??[3,3,3];const leader=stats.reduce((a,b)=>a+b,0)-9;const threat=o.attackSources.length;return distance*.40 - leader*11*.35 - threat*12*.25 - (ctx.combat.focus[id]===o.id&&ctx.game.time<ctx.combat.focusUntil[id]?50:0);};
    return rank(a) - rank(b);
  });
  const target = visible[0] || null;
  // Sight gives exact position only while contact remains visible.
  if (target) {
    ai.sensedPoint = {
      x: target.x,
      y: target.y
    };
    ai.sensedUntil = ctx.game.time + ctx.HEARING.memorySec;
    ai.sensedId = target.id;
    ai.sensedType = 'vision';
    ai.searchHoldUntil = 0;
    ctx.combat.focus[id] = target.id;
    ctx.combat.focusUntil[id] = ctx.game.time + 2.5;
  } else {
    const heard = newestAudibleEvent(r, active);
    if (heard && heard.time > ai.lastSoundAt) {
      // A sound preserves the point where the footstep happened; no future tracking.
      ai.lastSoundAt = heard.time;
      ai.sensedPoint = {
        x: heard.x,
        y: heard.y
      };
      ai.sensedUntil = ctx.game.time + ctx.HEARING.memorySec;
      ai.sensedId = heard.robot;
      ai.sensedType = 'sound';
    }
  }
  const memoryValid = ai.sensedPoint && ctx.game.time < ai.sensedUntil && active.some(o => o.id === ai.sensedId);
  if (!target && !memoryValid) {
    ai.sensedPoint = null;
    ai.sensedUntil = 0;
    ai.sensedId = null;
    ai.sensedType = null;
    return {
      goal: patrol(r),
      speed: CONFIG.movement.walkSpeedCm,
      mode: 'ищет врага',
      lookPoint: null
    };
  }
  const actuallySeen = !!target;
  const foe = target || active.find(o => o.id === ai.sensedId);
  if (!foe) return {
    goal: patrol(r),
    speed: CONFIG.movement.walkSpeedCm,
    mode: 'ищет врага',
    lookPoint: null
  };
  const sensed = actuallySeen ? {
    x: foe.x,
    y: foe.y
  } : {
    ...ai.sensedPoint
  };
  const dx = sensed.x - r.x,
    dy = sensed.y - r.y,
    d = Math.hypot(dx, dy) || 1;
  // Do not indefinitely circle a point where an old noise once happened.
  if (!actuallySeen && d < 35) {
    if (!ai.searchHoldUntil) ai.searchHoldUntil = ctx.game.time + ctx.HEARING.searchHoldSec;
    if (ctx.game.time >= ai.searchHoldUntil) {
      ai.sensedPoint = null;
      ai.sensedUntil = 0;
      ai.sensedId = null;
      ai.sensedType = null;
      ai.searchHoldUntil = 0;
      return {
        goal: patrol(r),
        speed: CONFIG.movement.walkSpeedCm,
        mode: 'ищет врага',
        lookPoint: null
      };
    }
    return {
      goal: {
        x: r.x,
        y: r.y
      },
      speed: 0,
      mode: 'осматривается',
      lookPoint: null
    };
  }
  const foeToUs = Math.atan2(-dy, -dx);
  const exposed = Math.abs(wrap(foeToUs - foe.angle)) < Math.PI * .43;
  // Retreat is time-limited and triggered by actual damage (combatAttacks),
  // not refreshed every AI tick. Otherwise injured fighters flee forever.
  if (ctx.game.time < ctx.combat.retreatUntil[id] && ctx.combat.retreatFrom[id] >= 0) {
    const threat = active.find(o => o.id === ctx.combat.retreatFrom[id]);
    if (!threat) {
      ctx.combat.retreatUntil[id] = 0;
      ctx.combat.retreatFrom[id] = -1;
    } else {
      const ax = r.x - threat.x,
        ay = r.y - threat.y,
        mag = Math.hypot(ax, ay) || 1;
      const side = id % 2 ? 1 : -1;
      const goal = {
        x: clamp(r.x + ax / mag * 125 - ay / mag * side * 45, 35, 665),
        y: clamp(r.y + ay / mag * 125 + ax / mag * side * 45, 35, 665)
      };
      if (coreClearCircle(goal, 28)) return {
        goal,
        speed: CONFIG.movement.fleeSpeedCm,
        mode: 'отступает',
        lookPoint: r.hasHead && actuallySeen ? foe.center : null
      };
    }
  }
  let goal = {
      x: sensed.x,
      y: sensed.y
    },
    mode = actuallySeen ? 'преследует' : ai.sensedType === 'sound' ? 'идёт на звук' : 'проверяет последнее место';
  // Far-away enemies should be approached before any flank manoeuvre.
  if (actuallySeen && d < 185) {
    const side = (id + foe.id) % 2 ? 1 : -1;
    const flank = Math.abs(wrap(Math.atan2(r.y - foe.y, r.x - foe.x) - foe.angle)) < 2.25;
    const theta = foe.angle + Math.PI + side * .72;
    const sideGoal = {
      x: foe.x + Math.cos(theta) * CONFIG.combat.flankRadiusCm,
      y: foe.y + Math.sin(theta) * CONFIG.combat.flankRadiusCm
    };
    if (flank && exposed && coreClearCircle(sideGoal, 26) && d > 65) {
      goal = sideGoal;
      mode = 'обходит с фланга';
    } else if (d < 36.75) {
      const canStrike = r.attackSources.some(source => strikeCandidates(r, foe, source).length > 0);
      if (canStrike && ctx.game.time - ctx.combat.lastHitTime < 5) {
        goal = here;
        mode = 'держит дистанцию';
      } else {
        goal = tacticalEscape(r, foe);
        mode = 'ищет угол атаки';
      }
    }
  }
  // If not seeing a target, scan toward the audible direction rather than
  // blindly keeping the head in a repeating ±30° sweep.
  return {
    goal,
    speed: mode === 'держит дистанцию' ? 0 : actuallySeen ? CONFIG.movement.chaseSpeedCm : CONFIG.movement.searchSpeedCm,
    mode,
    lookPoint: r.hasHead && actuallySeen ? foe.center : null
  };
}
