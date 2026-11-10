import { clamp, wrap, smooth } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { coreClearBone, sightClear } from "../systems/collision.js";
import { ctx } from "../game/state.js";
import { pointSegment, segmentDistance } from "../utils/math.js";
import { note } from "../game/events.js";
import { attr } from "../render/svg.js";
export function coverOffset(robotState, victim) {
  const a = robotState.api.center,
    b = victim.center,
    dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy) || 1,
    desired = {
      x: dx - dx / d * CONFIG.attack.coverCenterGapCm,
      y: dy - dy / d * CONFIG.attack.coverCenterGapCm
    };
  function valid(q) {
    return robotState.api.capsules.every(c => coreClearBone({
      x: c.a.x + desired.x * q,
      y: c.a.y + desired.y * q
    }, {
      x: c.b.x + desired.x * q,
      y: c.b.y + desired.y * q
    }, c.r));
  }
  let lo = 0,
    hi = 1;
  if (valid(1)) return desired;
  for (let i = 0; i < 10; i++) {
    const q = (lo + hi) / 2;
    if (valid(q)) lo = q;else hi = q;
  }
  return {
    x: desired.x * lo,
    y: desired.y * lo
  };
}
export function scheduleIdle(robotState) {
  const fraction = (robotState.id * 37 + robotState.idleSequence * 17) % 101 / 100;
  robotState.nextIdleAt = ctx.game.time + CONFIG.idle.minDelaySec + fraction * (CONFIG.idle.maxDelaySec - CONFIG.idle.minDelaySec);
}
export function hopHeight(robotState) {
  if (!robotState.scene || robotState.mode !== 'hops') return 0;
  const age = ctx.game.time - robotState.scene.started,
    flight = CONFIG.idle.hopFlightSec,
    pause = CONFIG.idle.hopPauseSec;
  if (age < flight) return Math.sin(Math.PI * clamp(age / flight, 0, 1));
  if (age < flight + pause) return 0;
  return Math.sin(Math.PI * clamp((age - flight - pause) / flight, 0, 1));
}
export
// Проверяем всю дистанцию пары прыжков до отрыва от земли.

// При прерывании жеста текущая рука становится новой опорой без скачка позы.

// Видимая кисть движется относительно плеча, но другие лапы остаются опорными.
function planIdleHops(robotState) {
  const heading = robotState.chest.angle,
    direction = {
      x: Math.cos(heading),
      y: Math.sin(heading)
    };
  const moving = Math.hypot(robotState.vx, robotState.vy);
  if (moving > 3 && (robotState.vx * direction.x + robotState.vy * direction.y) / moving < Math.cos(Math.PI / 9)) return null;
  for (let step = 0; step <= 8; step++) {
    const distance = CONFIG.idle.hopDistanceCm * 2 * step / 8;
    for (const c of robotState.api.capsules) {
      const shift = p => ({
        x: p.x + direction.x * distance,
        y: p.y + direction.y * distance
      });
      if (!robotState.clearBone(shift(c.a), shift(c.b), c.r)) return null;
    }
  }
  return {
    base: robotState.savePose(),
    feet: robotState.allLimbs().map(l => ({
      ...l.foot
    })),
    direction
  };
}
export function updateIdleHops(robotState, dt) {
  const plan = robotState.scene.hopPlan,
    age = ctx.game.time - robotState.scene.started;
  const flight = CONFIG.idle.hopFlightSec,
    pause = CONFIG.idle.hopPauseSec;
  const distance = CONFIG.idle.hopDistanceCm * (age < flight ? smooth(age / flight) : age < flight + pause ? 1 : 1 + smooth((age - flight - pause) / flight));
  const dx = plan.direction.x * distance,
    dy = plan.direction.y * distance;
  const previous = robotState.savePose(),
    feet = robotState.allLimbs().map(l => ({
      ...l.foot
    }));
  robotState.mixPose(plan.base, plan.base, 0);
  robotState.x = plan.base.x + dx;
  robotState.y = plan.base.y + dy;
  robotState.chest.x += dx;
  robotState.chest.y += dy;
  for (const p of robotState.spine) {
    p.x += dx;
    p.y += dy;
  }
  robotState.pelvis = {
    ...robotState.spine[4]
  };
  robotState.updateTail();
  robotState.headFrame.x += dx;
  robotState.headFrame.y += dy;
  for (let i = 0; i < plan.feet.length; i++) {
    const l = robotState.allLimbs()[i];
    l.foot = {
      x: plan.feet[i].x + dx,
      y: plan.feet[i].y + dy
    };
    l.phase = robotState.hopHeight() > .001 ? .5 : 1;
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
  }
  robotState.updateHead(dt);
  if (!robotState.rigClear()) {
    robotState.mixPose(previous, previous, 0);
    robotState.allLimbs().forEach((l, i) => {
      l.foot = feet[i];
      l.phase = 1;
      l.from = {
        ...l.foot
      };
      l.to = {
        ...l.foot
      };
    });
    robotState.api.endScene();
    robotState.currentIntent = {
      ...robotState.currentIntent,
      mode: 'wander'
    };
  }
  robotState.api.capsules = robotState.makeCapsules();
}
export function sceneEnvelope(robotState) {
  return robotState.scene ? smooth((ctx.game.time - robotState.scene.started) / .45) * (1 - smooth((ctx.game.time - robotState.scene.ends + .4) / .4)) : 0;
}
export function settleHands(robotState) {
  for (const l of robotState.arms) if (l.renderEnd) {
    l.foot = {
      ...l.renderEnd
    };
    delete l.renderEnd;
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
    l.phase = .5;
  }
}
export function lifted(robotState, l) {
  const p = ctx.combat.pending[robotState.id];
  if (p && l.kind === 'arm' && (p.source === `arm-${l.side}-lower` || p.source === `arm-${l.side}-upper`)) return true;
  return robotState.mode === 'cover' || robotState.mode === 'hops' && robotState.hopHeight() > .001 || robotState.mode === 'scratch' && l.kind === 'arm' && l.side === 1 || (robotState.mode === 'eat' || robotState.mode === 'startle') && l.kind === 'arm' || !!robotState.leap?.launched || robotState.leap?.kind === 'rebound';
}
export
// Действия прогулки используют тот же IK; угроза прерывает их сразу.

// Проверяем весь манёвр: сначала вперёд, затем варианты с разворотом.
function updateIdleScene(robotState, dt) {
  if (robotState.mode === 'hops') {
    robotState.updateIdleHops(dt);
    return;
  }
  const age = ctx.game.time - robotState.scene.started,
    duration = robotState.scene.ends - robotState.scene.started,
    q = clamp(age / duration, 0, 1);
  const envelope = Math.sin(Math.PI * q);
  robotState.gesture = {
    kind: robotState.mode,
    time: age,
    weight: envelope
  };
  if (robotState.mode === 'stretch') {
    const old = robotState.savePose();
    robotState.layoutBody(dt);
    const candidate = robotState.savePose(),
      supported = () => robotState.allLimbs().every(robotState.validContact) && robotState.rigClear();
    if (!supported()) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 10; i++) {
        const f = (lo + hi) / 2;
        robotState.mixPose(old, candidate, f);
        if (supported()) lo = f;else hi = f;
      }
      robotState.mixPose(old, candidate, lo);
    }
  }
  robotState.updateHead(dt);
  if (robotState.mode === 'scratch') {
    const l = robotState.arms.find(l => l.side === 1),
      before = {
        ...robotState.handEnd(l)
      };
    const bring = smooth(age / .3) * (1 - smooth((age - duration + .3) / .3));
    const near = robotState.local(robotState.headFrame, 23 + Math.sin(age * 24) * 2, 12 + Math.cos(age * 24) * 2);
    const desired = {
      x: l.foot.x + (near.x - l.foot.x) * bring,
      y: l.foot.y + (near.y - l.foot.y) * bring
    };
    l.renderEnd = desired;
    if (!robotState.limbClear(l)) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 9; i++) {
        const f = (lo + hi) / 2;
        l.renderEnd = {
          x: before.x + (desired.x - before.x) * f,
          y: before.y + (desired.y - before.y) * f
        };
        if (robotState.limbClear(l)) lo = f;else hi = f;
      }
      l.renderEnd = {
        x: before.x + (desired.x - before.x) * lo,
        y: before.y + (desired.y - before.y) * lo
      };
    }
  }
  robotState.api.capsules = robotState.makeCapsules();
}
export function updateScene(robotState) {
  robotState.eatTime = ctx.game.time - robotState.scene.started;
  const wanted = (robotState.mode === 'cover' ? 0 : robotState.mode === 'eat' ? -2.5 : robotState.mode === 'startle' ? -3 : -6) * robotState.sceneEnvelope(),
    old = robotState.headMotion;
  robotState.headMotion = wanted;
  if (!robotState.rigClear()) {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 9; i++) {
      const q = (lo + hi) / 2;
      robotState.headMotion = old + (wanted - old) * q;
      if (robotState.rigClear()) lo = q;else hi = q;
    }
    robotState.headMotion = old + (wanted - old) * lo;
  }
  if (robotState.mode === 'eat' || robotState.mode === 'startle') for (const l of robotState.arms) {
    const previous = {
        ...robotState.handEnd(l)
      },
      bring = robotState.mode === 'startle' ? Math.sin(Math.PI * clamp(robotState.eatTime / CONFIG.attack.startleSec, 0, 1)) : smooth(robotState.eatTime / (CONFIG.attack.eatSec * .55 / 2.6)) * (1 - smooth((robotState.eatTime - CONFIG.attack.eatSec * 1.8 / 2.6) / (CONFIG.attack.eatSec * .4 / 2.6))),
      near = robotState.mode === 'startle' ? robotState.local(robotState.chest, 9, l.side * (42 + Math.sin(robotState.eatTime * 45) * 4)) : robotState.local(robotState.headFrame, 36 + robotState.headMotion, l.side * (5 + .8 * Math.sin(robotState.eatTime * 24))),
      desired = {
        x: l.foot.x + (near.x - l.foot.x) * bring,
        y: l.foot.y + (near.y - l.foot.y) * bring
      };
    l.renderEnd = desired;
    if (!robotState.limbClear(l)) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 9; i++) {
        const q = (lo + hi) / 2;
        l.renderEnd = {
          x: previous.x + (desired.x - previous.x) * q,
          y: previous.y + (desired.y - previous.y) * q
        };
        if (robotState.limbClear(l)) lo = q;else hi = q;
      }
      l.renderEnd = {
        x: previous.x + (desired.x - previous.x) * lo,
        y: previous.y + (desired.y - previous.y) * lo
      };
    }
  }
  robotState.api.capsules = robotState.makeCapsules();
}
export function reboundPlan(robotState, victim) {
  const offset = {
      ...(robotState.attackVisual || {
        x: 0,
        y: 0
      })
    },
    origin = {
      x: robotState.x + offset.x,
      y: robotState.y + offset.y
    },
    caps = robotState.api.capsules,
    base = robotState.savePose(),
    feet = robotState.allLimbs().map(l => ({
      ...l.foot
    }));
  let jumpDistance = CONFIG.attack.landingDistancesCm[0];
  function transformed(p, turn, q, heading) {
    const dx = p.x - robotState.x,
      dy = p.y - robotState.y;
    return {
      x: origin.x + dx * Math.cos(turn) - dy * Math.sin(turn) + Math.cos(heading) * jumpDistance * q,
      y: origin.y + dx * Math.sin(turn) + dy * Math.cos(turn) + Math.sin(heading) * jumpDistance * q
    };
  }
  function clearAt(turn, q, heading, landing) {
    for (const c of caps) {
      const a = transformed(c.a, turn, q, heading),
        b = transformed(c.b, turn, q, heading);
      if (!coreClearBone(a, b, c.r)) return false;
      for (const other of ctx.robots) {
        if (other.id === robotState.id || !other.mobile || !landing && other.id === victim.id) continue;
        // Оставляем запас для поворота головы жертвы во время полёта.
        if (landing && other.id === victim.id) {
          const pivot = robotState.local(other.actualPose.chest, 14, 0);
          if (pointSegment(pivot, a, b) < c.r + 28 * ctx.scale + .2) return false;
        }
        for (const d of other.capsules) if (segmentDistance(a, b, d.a, d.b) < c.r + d.r + (landing && other.id === victim.id ? 12 : .2)) return false;
      }
    }
    return true;
  }
  for (const degrees of [0, 45, -45, 90, -90, 135, -135, 180]) for (const distance of CONFIG.attack.landingDistancesCm) {
    jumpDistance = distance;
    const turn = degrees * Math.PI / 180,
      heading = robotState.angle + turn;
    let valid = true;
    for (let k = 0; k <= 8 && valid; k++) valid = clearAt(turn * k / 8, 0, heading, false);
    for (let k = 1; k <= 10 && valid; k++) valid = clearAt(turn, k / 10, heading, k === 10);
    if (valid) return {
      kind: 'rebound',
      started: ctx.game.time,
      offset,
      origin,
      base,
      feet,
      turn,
      heading,
      distance,
      turnDuration: degrees === 0 ? 0 : CONFIG.attack.dismountTurnSec,
      launched: false,
      victim: victim.id,
      direction: {
        x: Math.cos(heading),
        y: Math.sin(heading)
      }
    };
  }
  return null;
}
export function reboundTick(robotState, dt, intent) {
  const jump = robotState.leap,
    age = ctx.game.time - jump.started;
  robotState.currentIntent = {
    ...intent,
    mode: age < jump.turnDuration ? 'turn-rebound' : 'rebound'
  };
  robotState.t = ctx.game.time;
  robotState.vx = robotState.vy = 0;
  if (age < jump.turnDuration) return;
  const q = clamp((age - jump.turnDuration) / CONFIG.attack.dismountSec, 0, 1),
    progress = smooth(q),
    base = jump.base,
    heading = jump.heading,
    turn = jump.turn;
  robotState.leap.launched = true;
  robotState.x = jump.origin.x + jump.direction.x * jump.distance * progress;
  robotState.y = jump.origin.y + jump.direction.y * jump.distance * progress;
  robotState.angle = heading;
  robotState.chest = {
    x: robotState.x,
    y: robotState.y,
    angle: base.chestAngle + turn
  };
  robotState.spine[0] = {
    ...robotState.chest
  };
  for (let i = 1; i < 5; i++) {
    const p = robotState.spine[i - 1],
      a = base.angles[i] + turn;
    robotState.spine[i] = {
      x: p.x - Math.cos(a) * CONFIG.robot.vertebraBaseCm * ctx.scale,
      y: p.y - Math.sin(a) * CONFIG.robot.vertebraBaseCm * ctx.scale,
      angle: a
    };
  }
  robotState.pelvis = {
    ...robotState.spine[4]
  };
  robotState.turnRate = 0;
  robotState.updateTail();
  robotState.gazeYaw = base.headAngle + turn;
  robotState.look = wrap(robotState.gazeYaw - robotState.chest.angle);
  robotState.headFrame = robotState.headFrameAt(robotState.gazeYaw);
  for (let i = 0; i < jump.feet.length; i++) {
    const p = jump.feet[i],
      dx = p.x - base.x,
      dy = p.y - base.y,
      l = robotState.allLimbs()[i];
    l.foot = {
      x: robotState.x + dx * Math.cos(turn) - dy * Math.sin(turn),
      y: robotState.y + dx * Math.sin(turn) + dy * Math.cos(turn)
    };
    l.phase = .5;
  }
  const speed = jump.distance / CONFIG.attack.dismountSec * 6 * q * (1 - q);
  robotState.vx = jump.direction.x * speed;
  robotState.vy = jump.direction.y * speed;
  robotState.api.capsules = robotState.makeCapsules();
  if (q >= 1) {
    robotState.reboundEscape = {
      ...jump.direction,
      until: ctx.game.time + CONFIG.attack.runAfterLandingSec
    };
    robotState.vx = jump.direction.x * 64;
    robotState.vy = jump.direction.y * 64;
    robotState.leap = null;
    robotState.attackVisual = null;
    for (const l of robotState.allLimbs()) {
      l.phase = 1;
      l.from = {
        ...l.foot
      };
      l.to = {
        ...l.foot
      };
    }
    robotState.currentIntent = {
      goal: {
        x: robotState.x + jump.direction.x * 100,
        y: robotState.y + jump.direction.y * 100
      },
      mode: 'flee',
      speed: 64,
      lookPoint: null
    };
    note('rebound-land', {
      robot: robotState.id,
      heading,
      distance: jump.distance
    });
  }
}
// No turn on disengagement: retreat opposite the jump's heading, not back
// to the original start point. Physical movement is collision-clamped.
export function startCombatPounceRetreat(robotState,completedJump) {
  const direction={x:-completedJump.direction.x,y:-completedJump.direction.y};
  robotState.leap={
    kind:'combat-retreat',started:ctx.game.time,launched:true,
    origin:{x:robotState.x,y:robotState.y},direction,
    goal:{x:robotState.x+direction.x*CONFIG.attack.combatPounceRetreatCm,
          y:robotState.y+direction.y*CONFIG.attack.combatPounceRetreatCm}
  };
  note('pounce-retreat',{robot:robotState.id,distance:CONFIG.attack.combatPounceRetreatCm});
}
export function jumpTick(robotState, dt, intent) {
  // Contact interrupts the forward leap immediately, without turning.
  if(robotState.leap.kind==='combat-pounce' && robotState.leap.impactDone)
    startCombatPounceRetreat(robotState,robotState.leap);
  const age = ctx.game.time - robotState.leap.started;
  const rebound = robotState.leap.kind === 'rebound';
  const combatRetreat = robotState.leap.kind === 'combat-retreat';
  robotState.currentIntent = {
    ...intent,
    mode: rebound ? 'rebound' : combatRetreat ? 'отскакивает' : 'напрыгивает'
  };
  robotState.t = ctx.game.time;
  robotState.vx = robotState.vy = 0;
  if (combatRetreat ? age < CONFIG.attack.combatPounceRetreatSec : rebound ? age < .55 : age > .12 && age < .94) {
    const old = robotState.savePose(),
      feet = robotState.allLimbs().map(l => ({
        ...l.foot
      })),
      // Fixed-heading jumps stop at their intended destination. The old
      // "distance || 1" moved the patient 1 extra cm each frame once
      // the goal was reached, causing overshoot and broken retreats.
      remaining = Math.max(0,
        (robotState.leap.goal.x-robotState.x)*robotState.leap.direction.x
        +(robotState.leap.goal.y-robotState.y)*robotState.leap.direction.y),
      // Ease a 10 cm backward step over its short animation instead of
      // travelling instantly and then lingering in a redundant hop pose.
      travelled = combatRetreat ? Math.max(0,
        (robotState.x-robotState.leap.origin.x)*robotState.leap.direction.x
        +(robotState.y-robotState.leap.origin.y)*robotState.leap.direction.y) : 0,
      retreatProgress = combatRetreat ? smooth(clamp((age+dt)/CONFIG.attack.combatPounceRetreatSec,0,1)) : 0,
      move = combatRetreat
        ? Math.min(remaining,Math.max(0,CONFIG.attack.combatPounceRetreatCm*retreatProgress-travelled))
        : Math.min(remaining,(rebound ? 140 : CONFIG.attack.pounceSpeedCm)*dt),
      mx = robotState.leap.direction.x * move,
      my = robotState.leap.direction.y * move;
    function moveTo(q) {
      robotState.mixPose(old, old, 0);
      robotState.x = old.x + mx * q;
      robotState.y = old.y + my * q;
      robotState.chest.x += mx * q;
      robotState.chest.y += my * q;
      for (const p of robotState.spine) {
        p.x += mx * q;
        p.y += my * q;
      }
      robotState.pelvis = {
        ...robotState.spine[4]
      };
      robotState.updateTail();
      robotState.headFrame.x += mx * q;
      robotState.headFrame.y += my * q;
      for (let i = 0; i < feet.length; i++) {
        const l = robotState.allLimbs()[i];
        l.foot = {
          x: feet[i].x + mx * q,
          y: feet[i].y + my * q
        };
        l.phase = .5;
      }
    }
    moveTo(1);
    if (!robotState.rigClear()) {
      let lo = 0,
        hi = 1;
      for (let i = 0; i < 10; i++) {
        const q = (lo + hi) / 2;
        moveTo(q);
        if (robotState.rigClear()) lo = q;else hi = q;
      }
      moveTo(lo);
    }
    robotState.vx = (robotState.x - old.x) / dt;
    robotState.vy = (robotState.y - old.y) / dt;
    // Trigger the jump effect on the actual first forward movement.
    if (robotState.leap.kind==='combat-pounce' && !robotState.leap.soundStarted
        && Math.hypot(robotState.x-old.x,robotState.y-old.y)>.01) {
      robotState.leap.soundStarted=true;
      note('pounce-launch',{robot:robotState.id,heading:robotState.chest.angle});
    }
  }
  robotState.updateHead(dt);
  robotState.api.capsules = robotState.makeCapsules();
  if (age >= (combatRetreat ? CONFIG.attack.combatPounceRetreatSec : rebound ? .55 : 1)) {
    if (!combatRetreat && !rebound) {
      // If the lunge was completely blocked, it never left the ground:
      // don't play a landing or an imaginary backwards hop.
      if (!robotState.leap.soundStarted) {
        robotState.leap=null;
        robotState.attackVisual=null;
        return;
      }
      startCombatPounceRetreat(robotState,robotState.leap);
      robotState.api.capsules = robotState.makeCapsules();
      return;
    }
    if (combatRetreat) {
      robotState.combatRecoveryUntil = ctx.game.time + CONFIG.attack.combatPounceRecoverSec;
      note('footstep',{robot:robotState.id,landing:true});
    }
    if (rebound) robotState.reboundEscape = {
      ...robotState.leap.direction,
      until: ctx.game.time + CONFIG.attack.runAfterLandingSec
    };
    robotState.leap = null;
    robotState.attackVisual = null;
    for (const l of robotState.allLimbs()) {
      l.phase = 1;
      l.from = {
        ...l.foot
      };
      l.to = {
        ...l.foot
      };
    }
    robotState.currentIntent = {
      ...intent,
      mode: rebound ? 'flee' : combatRetreat ? 'восстанавливается' : 'chase'
    };
  }
}
export function robotSetVisible(robotState, value, spawnAt = null) {
  robotState.visible = value;
  robotState.spawnAt = value ? spawnAt : null;
  for (const node of [robotState.actor, robotState.floor, robotState.pool, robotState.nearLight, ...robotState.trailNodes]) attr(node, 'display', value ? '' : 'none');
}
// Repeat a single randomly selected victory gesture for two or three
// complete cycles. Keep this cosmetic choice independent of combat RNG.
export function robotCelebrateVictory(robotState,random=Math.random) {
  if(!robotState.mobile())return null;
  if(robotState.scene)robotState.api.endScene();
  robotState.leap=null;
  robotState.victoryKind=null;
  robotState.victoryRepeatsLeft=0;
  const kinds=[...robotState.idleKinds];
  // Uniform random first choice; if limbs/obstacles prevent it, try the others.
  for(let i=kinds.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [kinds[i],kinds[j]]=[kinds[j],kinds[i]];
  }
  for(const kind of kinds){
    if(kind==='scratch'&&!robotState.arms.some(l=>l.side===1&&robotState.healthy('arm-1-upper')))continue;
    if(robotState.api.performIdle(kind)){
      const total=2+Math.floor(random()*2);
      const duration=robotState.scene.ends-robotState.scene.started;
      robotState.victoryKind=kind;
      robotState.victoryRepeatsLeft=total-1;
      ctx.combat.celebrationUntil=ctx.game.time+total*duration+.25;
      return kind;
    }
  }
  ctx.combat.celebrationUntil=ctx.game.time+3;
  return null;
}
// Called after an idle gesture ends. Never start automatic wandering while
// results are pending, and stop if injury/obstacles make a repeat impossible.
export function robotContinueVictory(robotState) {
  if(!ctx.combat.finished||ctx.combat.winner!==robotState.id
    ||!robotState.victoryKind||robotState.victoryRepeatsLeft<=0
    ||robotState.scene||!robotState.mobile())return false;
  const kind=robotState.victoryKind;
  if(!robotState.api.performIdle(kind)){
    robotState.victoryRepeatsLeft=0;
    return false;
  }
  robotState.victoryRepeatsLeft--;
  return true;
}
export function robotPerformIdle(robotState, kind) {
  if (!robotState.idleKinds.includes(kind) || robotState.scene || robotState.leap || !robotState.mobile() || !robotState.clearCircle(robotState.api.center, 52)) return false;
  const hopPlan = kind === 'hops' ? robotState.planIdleHops() : null;
  if (kind === 'hops' && !hopPlan) return false;
  const duration = kind === 'hops' ? CONFIG.idle.hopFlightSec * 2 + CONFIG.idle.hopPauseSec : CONFIG.idle[kind + 'Sec'];
  robotState.api.beginScene(kind, duration);
  if (hopPlan) robotState.scene.hopPlan = hopPlan;
  robotState.idleSequence++;
  note('idle-action', {
    robot: robotState.id,
    kind,
    duration
  });
  return true;
}
export function robotStartle(robotState) {
  if (robotState.scene && robotState.idleKinds.includes(robotState.mode)) robotState.api.endScene();
  if (robotState.scene || robotState.leap || ctx.game.time < robotState.fearCooldown) return false;
  robotState.fearCooldown = ctx.game.time + CONFIG.attack.startleCooldownSec;
  robotState.api.beginScene('startle', CONFIG.attack.startleSec);
  note('startle', {
    robot: robotState.id
  });
  return true;
}
export function robotCanCover(robotState, victim) {
  const offset = robotState.coverOffset(victim),
    center = robotState.api.center,
    target = victim.center;
  return Math.hypot(center.x + offset.x - target.x, center.y + offset.y - target.y) <= CONFIG.attack.coverCenterGapCm + 4 && sightClear(center, target);
}
export function robotBeginApproach(robotState, victim) {
  const age = robotState.leap?.launched ? ctx.game.time - robotState.leap.started : 0;
  robotState.coverHeightStart = robotState.leap?.launched ? Math.sin(Math.PI * clamp((age - .12) / .82, 0, 1)) : 0;
  robotState.api.beginScene('cover', CONFIG.attack.coverApproachSec);
  robotState.api.beginCover(victim);
}
export function robotCoverGap(robotState, victim) {
  const p = robotState.visiblePoint(robotState.api.center),
    v = victim.center;
  return Math.hypot(p.x - v.x, p.y - v.y);
}
export function robotCancelCover(robotState) {
  robotState.attackVisual = null;
  robotState.leap = null;
  robotState.api.endScene();
}
export function robotBeginCover(robotState, victim) {
  robotState.attackVisual = robotState.coverOffset(victim);
  ctx.actorsG.appendChild(robotState.actor);
}
export function robotReboundFrom(robotState, victim) {
  const plan = robotState.reboundPlan(victim);
  if (plan) {
    robotState.leap = plan;
    for (const l of robotState.allLimbs()) l.phase = .5;
    note('rebound', {
      robot: robotState.id,
      from: victim.id,
      turn: plan.turn,
      distance: plan.distance,
      duration: CONFIG.attack.dismountSec
    });
  } else {
    robotState.attackVisual = null;
    note('rebound-blocked', {
      robot: robotState.id
    });
  }
}
export function robotPounce(robotState, goal, gap) {
  if (robotState.scene || robotState.leap || ctx.game.time - robotState.lastLeap < CONFIG.attack.pounceCooldownSec) return false;
  robotState.lastLeap = ctx.game.time;
  robotState.leap = {
    kind: 'combat-pounce',
    started: null,
    prepareAt: ctx.game.time,
    launched: false,
    victim: gap?.victimId ?? null,
    impactDone: false,
    lastHead: null,
    goal: {
      ...goal
    }
  };
  robotState.settleHands();
  note('pounce', {
    robot: robotState.id,
    gap,
    goal: {
      ...goal
    }
  });
  return true;
}
export function robotBeginScene(robotState, kind, duration) {
  robotState.boundaryRecovery = false;
  robotState.boundaryBlockedFor = 0;
  robotState.recoveryDirection = null;
  robotState.recoverySwing = null;
  robotState.gesture = {
    kind: '',
    time: 0,
    weight: 0
  };
  robotState.leap = null;
  robotState.settleHands();
  const previousHeadMotion = robotState.headMotion;
  robotState.headMotion = 0;
  if (!robotState.rigClear()) robotState.headMotion = previousHeadMotion;
  robotState.scene = {
    started: ctx.game.time,
    ends: ctx.game.time + duration
  };
  robotState.mode = kind;
  robotState.vx = robotState.vy = 0;
  for (const l of robotState.allLimbs()) {
    l.phase = 1;
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
  }
  robotState.currentIntent = {
    goal: {
      x: robotState.x,
      y: robotState.y
    },
    speed: 0,
    mode: kind,
    lookPoint: null
  };
  robotState.api.capsules = robotState.makeCapsules();
}
export function robotEndScene(robotState) {
  if (robotState.mode === 'hops') for (const l of robotState.allLimbs()) {
    l.phase = 1;
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
  }
  if (robotState.idleKinds.includes(robotState.mode)) robotState.scheduleIdle();
  robotState.gesture = {
    kind: '',
    time: 0,
    weight: 0
  };
  robotState.scene = null;
  robotState.mode = 'crawl';
  const previousHeadMotion = robotState.headMotion;
  robotState.headMotion = 0;
  robotState.settleHands();
  if (!robotState.rigClear()) robotState.headMotion = previousHeadMotion;
  robotState.api.capsules = robotState.makeCapsules();
}
