import {limbKey} from './body.js';
import {pendingStrikes} from '../systems/strikes.js';
import {resolveSurfaceContacts} from '../systems/surface-contact.js';
import {patientMovementMultiplier} from '../game/patients.js';
import { clamp, wrap, smooth } from '../utils/math.js';
import { planPath } from "../systems/navigation.js";
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { coreClearBone, nearestObstaclePoint } from "../systems/collision.js";
import { ik, segmentDistance } from "../utils/math.js";
import { isSolidBody,peerBodyOverlap,solidCapsules } from "./collision.js";
import { robotContinueVictory } from "./scenes.js";
import { note } from "../game/events.js";
export function hasGoal(robotState) {
  return robotState.currentIntent.mode === 'chase';
}
export function currentTargetVisible(robotState) {
  return !!robotState.currentIntent.lookPoint;
}
export function steerTo(robotState, goal, padding=robotState.routePadding, waypointRadius=18) {
  // A stop/attack intent is not a navigation request. Discard stale waypoints
  // rather than turning toward an old flank point with zero travel speed.
  if (Math.hypot(goal.x - robotState.x, goal.y - robotState.y) < 4) {
    robotState.route = [];
    robotState.routeGoal = null;
    robotState.routeIndex = 0;
    return goal;
  }
  if (robotState.routeClearance!==padding || !robotState.routeGoal || Math.hypot(robotState.routeGoal.x - goal.x, robotState.routeGoal.y - goal.y) > 18 || !robotState.route.length) {
    robotState.route = planPath({
      x: robotState.x,
      y: robotState.y
    }, goal, padding);
    robotState.routeClearance=padding;
    robotState.routeGoal = {
      ...goal
    };
    robotState.routeIndex = 0;
  }
  while (robotState.routeIndex < robotState.route.length - 1 && Math.hypot(robotState.route[robotState.routeIndex].x - robotState.x, robotState.route[robotState.routeIndex].y - robotState.y) < waypointRadius) robotState.routeIndex++;
  // planPath может вернуть только начальную точку при отсутствии маршрута.
  // Не превращаем это в вечную команду стоять на месте.
  if (robotState.route.length === 1 && Math.hypot(robotState.route[0].x - robotState.x, robotState.route[0].y - robotState.y) < 4 && Math.hypot(goal.x - robotState.x, goal.y - robotState.y) > 25) {
    robotState.route = [];
    robotState.routeGoal = null;
    return goal;
  }
  return robotState.route[robotState.routeIndex] || goal;
}
export function headingForIntent(currentAngle, position, waypoint, intent) {
  if(Number.isFinite(intent.heading))return intent.heading;
  const dx=waypoint.x-position.x,dy=waypoint.y-position.y;
  if (intent.mode === 'атакует' && intent.lookPoint) {
    const tx=intent.lookPoint.x-position.x,ty=intent.lookPoint.y-position.y;
    if(Math.hypot(tx,ty)>1)return Math.atan2(ty,tx);
  }
  return Math.hypot(dx,dy)>1 ? Math.atan2(dy,dx) : currentAngle;
}
export function retreatFromBoundary(robotState, dt) {
  if(ctx.mode==='tower'&&robotState.id===0)return false;
  if (!robotState.boundaryRecovery) return false;
  const caps = robotState.makeCapsules(),
    surface = robotState.nearestSurface(caps),
    margin = surface.distance;
  // В открытом пространстве режим восстановления не должен удерживать робота.
  if ((margin >= CONFIG.movement.boundaryReleaseCm || ctx.game.time - robotState.recoveryStartedAt > 1.4) && !robotState.recoverySwing) {
    robotState.boundaryRecovery = false;
    robotState.boundaryBlockedFor = 0;
    robotState.recoveryDirection = null;
    robotState.recoverySwing = null;
    robotState.route = [];
    robotState.routeGoal = null;
    return false;
  }
  const nx = surface.nx,
    ny = surface.ny;
  const heading = Math.atan2(ny, nx),
    distance = CONFIG.movement.boundaryRetreatSpeedCm * CONFIG.movement.speedMultiplier * patientMovementMultiplier(robotState.id,robotState.api,0) * dt;
  let best = null,
    bestScore = -Infinity;
  const peerBodies = robotState.peerRobots().flatMap(r=>solidCapsules(r.capsules));
  for (let index = 0; index < 16; index++) {
    const turn = index * Math.PI / 8;
    const dx = Math.cos(heading + turn) * distance,
      dy = Math.sin(heading + turn) * distance;
    const safe = [.5, 1].every(q => caps.every(c => {
      const a = {
          x: c.a.x + dx * q,
          y: c.a.y + dy * q
        },
        b = {
          x: c.b.x + dx * q,
          y: c.b.y + dy * q
        };
      return coreClearBone(a, b, c.r) && (!isSolidBody(c) || peerBodies.every(d => segmentDistance(a, b, d.a, d.b) > c.r + d.r + .15));
    }));
    if (!safe) continue;
    const shifted = caps.map(c => ({
      ...c,
      a: {
        x: c.a.x + dx,
        y: c.a.y + dy
      },
      b: {
        x: c.b.x + dx,
        y: c.b.y + dy
      }
    }));
    const clearance = robotState.nearestSurface(shifted).distance;
    // На узком проходе сохраняем выбранную сторону обхода, а не мечемся между гранями.
    const continuity = robotState.recoveryDirection ? (dx * robotState.recoveryDirection.x + dy * robotState.recoveryDirection.y) / distance * .3 : 0;
    const score = clearance * 10 + dx * nx + dy * ny + continuity;
    if (score > bestScore) {
      best = {
        dx,
        dy
      };
      bestScore = score;
    }
  }
  if (!best) best = {
    dx: nx * distance,
    dy: ny * distance
  };
  robotState.recoveryDirection = {
    x: best.dx / distance,
    y: best.dy / distance
  };
  robotState.t = ctx.game.time;
  const limbs = robotState.allLimbs();
  const safeFoot = (l, p, plant) => {
    const old = l.foot;
    l.foot = p;
    const safe = robotState.limbClear(l) && (!plant || robotState.validContact(l));
    l.foot = old;
    return safe;
  };
  // Сначала переносим одну лапу. Остальные опоры сохраняют мировые координаты.
  if (!robotState.recoverySwing) {
    const ordered = limbs.map((_, i) => limbs[(i + robotState.recoveryStepIndex) % limbs.length]);
    ordered.sort((a, b) => Number(robotState.validContact(a)) - Number(robotState.validContact(b)));
    for (const l of ordered) {
      const from = {
          ...robotState.handEnd(l)
        },
        home = robotState.rest(l);
      const candidates = [12, 8, 4, 2].map(step => ({
        x: from.x + robotState.recoveryDirection.x * step,
        y: from.y + robotState.recoveryDirection.y * step
      }));
      candidates.push({
        x: home.x + robotState.recoveryDirection.x * 4,
        y: home.y + robotState.recoveryDirection.y * 4
      }, home);
      let target = null,
        score = -Infinity;
      for (const p of candidates) {
        if (Math.hypot(p.x - from.x, p.y - from.y) < 1 || !safeFoot(l, p, true)) continue;
        if (![.2, .4, .6, .8].every(q => safeFoot(l, {
          x: from.x + (p.x - from.x) * q,
          y: from.y + (p.y - from.y) * q
        }, false))) continue;
        const value = (p.x - from.x) * robotState.recoveryDirection.x + (p.y - from.y) * robotState.recoveryDirection.y - Math.hypot(p.x - home.x, p.y - home.y) * .06;
        if (value > score) {
          target = p;
          score = value;
        }
      }
      if (target) {
        robotState.recoverySwing = {
          limb: l,
          from,
          to: target,
          age: 0
        };
        l.from = {
          ...from
        };
        l.to = {
          ...target
        };
        l.phase = 0;
        l.stall = 0;
        l.escapeFor = 0;
        robotState.recoveryStepIndex = (limbs.indexOf(l) + 1) % limbs.length;
        break;
      }
    }
  }
  if (robotState.recoverySwing) {
    const swing = robotState.recoverySwing,
      l = swing.limb;
    swing.age += dt;
    const q = clamp(swing.age / .2, 0, 1),
      blend = smooth(q);
    const p = {
      x: swing.from.x + (swing.to.x - swing.from.x) * blend,
      y: swing.from.y + (swing.to.y - swing.from.y) * blend
    };
    if (safeFoot(l, p, q >= 1)) {
      l.foot = p;
      l.phase = q;
      if (q >= 1) {
        l.from = {
          ...p
        };
        l.to = {
          ...p
        };
        robotState.recoverySwing = null;
      }
    } else {
      l.phase = robotState.validContact(l) ? 1 : .5;
      robotState.recoverySwing = null;
    }
  }
  // Корпус движется относительно неподвижных опор. IK сгибает суставы;
  // при нехватке досягаемости движение сокращается до следующего переступа.
  const points = [...new Set([robotState.chest, robotState.pelvis, robotState.headFrame, ...robotState.spine, ...robotState.tail])],
    original = points.map(p => ({
      ...p
    }));
  const oldX = robotState.x,
    oldY = robotState.y;
  const moveBody = q => {
    robotState.x = oldX + best.dx * q;
    robotState.y = oldY + best.dy * q;
    points.forEach((p, i) => {
      p.x = original[i].x + best.dx * q;
      p.y = original[i].y + best.dy * q;
    });
  };
  const supported = () => robotState.rigClear() && limbs.filter(l => l.phase >= 1).every(robotState.validContact);
  moveBody(1);
  if (!supported()) {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 11; i++) {
      const q = (lo + hi) / 2;
      moveBody(q);
      if (supported()) lo = q;else hi = q;
    }
    moveBody(lo);
  }
  robotState.vx = (robotState.x - oldX) / dt;
  robotState.vy = (robotState.y - oldY) / dt;
  robotState.api.capsules = robotState.makeCapsules();
  return true;
}
export function watchProgress(robotState, dt, previous) {
  const actualMoved = Math.hypot(robotState.x - previous.x, robotState.y - previous.y);
  const navigationBlocked=robotState.currentIntent.navigate&&robotState.currentIntent.speed>0&&Math.abs(wrap(robotState.angle-previous.angle))<.006;
  const attemptingMove = navigationBlocked || robotState.requestedSpeed > 5 * (robotState.scale??ctx.scale) || !!robotState.leap && !robotState.leap.launched;
  if (!robotState.currentIntent.navigate && attemptingMove && actualMoved < Math.max(20, robotState.requestedSpeed) * dt * .12) {
    robotState.boundaryBlockedFor += dt;
    if (robotState.boundaryBlockedFor >= CONFIG.movement.boundaryStuckSec) {
      robotState.boundaryRecovery = true;
      robotState.recoveryStartedAt = ctx.game.time;
      robotState.boundaryBlockedFor = 0;
      robotState.recoveryDirection = null;
      robotState.recoverySwing = null;
      robotState.recoveryStepIndex = 0;
      robotState.recoveries++;
      note('surface-recovery', {
        robot: robotState.id
      });
    }
  } else robotState.boundaryBlockedFor = Math.max(0, robotState.boundaryBlockedFor - dt * 2);
  const navigating = robotState.behavior === 'follow' || robotState.behavior === 'wander' || robotState.behavior === 'search';
  if (navigating && robotState.t >= robotState.recoveryUntil && (robotState.requestedSpeed > 5 * (robotState.scale??ctx.scale)||navigationBlocked)) {
    const moved = Math.hypot(robotState.x - previous.x, robotState.y - previous.y),
      turned = Math.abs(wrap(robotState.angle - previous.angle));
    robotState.stuckFor = moved < Math.max(5,robotState.requestedSpeed) * dt * .12 && turned < .006 ? robotState.stuckFor + dt : Math.max(0, robotState.stuckFor - dt * 2);
    if (robotState.stuckFor > .5) {
      robotState.routePadding = Math.min((robotState.currentIntent.navigate?140:95) * (robotState.scale??ctx.scale), robotState.routePadding + CONFIG.robot.vertebraBaseCm * (robotState.scale??ctx.scale));
      robotState.route = [];
      robotState.routeGoal = null;
      robotState.recoveryUntil = robotState.t + 1;
      robotState.recoveries++;
      robotState.stuckFor = 0;
      if (robotState.behavior === 'wander') robotState.nextStop = Math.max(robotState.nextStop, robotState.t + 6);
    }
  } else robotState.stuckFor = 0;
}
// Moving feet used to land on the rest position of the body at swing START.
// At chase speed the body travels several centimeters during the swing, so
// the new support was already behind and immediately had to step again.
// Plan a forward point using actual velocity; collision and IK still have
// the final say, and calm walking keeps its existing landing position.
export function fastGaitFactor(robotState){
 const speed=Math.hypot(robotState.vx??0,robotState.vy??0);
 return clamp((speed-CONFIG.movement.stepLeadStartSpeedCm)/
   (CONFIG.movement.stepLeadFullSpeedCm-CONFIG.movement.stepLeadStartSpeedCm),0,1);
}
export function stepLandingTarget(robotState,l,home=robotState.rest(l)){
 const vx=robotState.vx??0,vy=robotState.vy??0;
 const speed=Math.hypot(vx,vy),factor=fastGaitFactor(robotState);
 if(speed<1||factor===0)return home;
 const scale=robotState.scale??ctx.scale;
 const advance=Math.min(speed*CONFIG.movement.stepLeadTimeSec,
   CONFIG.movement.stepLeadMaxCm*scale)*factor;
 if(advance<.1)return home;
 const previous=l.foot;
 try{
  // Each candidate must be reachable and collision-free with the REAL
  // joint geometry. Shorten the lead instead of forcing a foot through walls.
  for(const fraction of [1,.75,.5,.25]){
   const candidate={x:home.x+vx/speed*advance*fraction,
     y:home.y+vy/speed*advance*fraction};
   l.foot=candidate;
   if(robotState.validContact(l)&&robotState.limbClear(l))return candidate;
  }
 }finally{l.foot=previous;}
 return home;
}
export function contacts(robotState, dt, previous) {
  const limbs = robotState.allLimbs(),
    candidate = robotState.savePose();
  let airborne = limbs.filter(l => l.phase < 1).length;
  for (const l of limbs) if (l.phase < 1 && (l.stall || 0) > .25 && robotState.validContact(l) && robotState.limbClear(l)) {
    l.phase = 1;
    l.stall = 0;
    airborne--;
  }
  // A planted endpoint is a world-space constraint, not a body-relative pose.
  const pending = limbs.filter(l => l.phase >= 1 && !robotState.lifted(l)).map(l => {
    const a = robotState.origin(l),
      r = robotState.rest(l),
      scale=robotState.scale??ctx.scale,
      error = Math.hypot(r.x - l.foot.x, r.y - l.foot.y) / scale,
      // A longer relaxed reach should not immediately lift a newly planted hand.
      replantReach=l.kind==='arm'&&l.anchor===undefined&&!robotState.body?.isBoss
        ?Math.max(44*scale,Math.hypot(r.x-a.x,r.y-a.y)+8*scale):44*scale,
      urgent = !robotState.validContact(l) || !robotState.limbClear(l) || Math.hypot(l.foot.x - a.x, l.foot.y - a.y) > replantReach,
      cycle = (robotState.gait / (Math.PI * 2) + (l.kind === 'arm' ? l.side === 1 ? 0 : .5 : l.side === -1 ? 0 : .5)) % 1;
    return {
      l,
      r,
      error,
      urgent,
      cycle
    };
  }).sort((a, b) => (b.urgent ? 1000 : 0) + b.error - ((a.urgent ? 1000 : 0) + a.error));
  for (const p of pending) {
    const nearFood = robotState.hasGoal() && robotState.currentTargetVisible() && Math.hypot(robotState.target.x - robotState.x, robotState.target.y - robotState.y) < 50 * (robotState.scale??ctx.scale),
      normal = robotState.mode !== 'eat' && (robotState.behavior === 'follow' || robotState.behavior === 'wander' || robotState.behavior === 'search') && !nearFood && p.error > CONFIG.movement.stepReplantErrorCm && p.cycle < .4;
    if (airborne < 2 && (p.urgent || normal)) {
      p.l.from = {
        ...p.l.foot
      };
      p.l.to = stepLandingTarget(robotState,p.l,p.r);
      p.l.phase = 0;
      p.l.stall = 0;
      airborne++;
    }
  }
  const supports = limbs.filter(l => l.phase >= 1 && !robotState.lifted(l));
  if (!supports.every(robotState.validContact) || !robotState.rigClear()) {
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 11; i++) {
      const q = (lo + hi) / 2;
      robotState.mixPose(previous, candidate, q);
      if (supports.every(robotState.validContact) && robotState.rigClear()) lo = q;else hi = q;
    }
    robotState.mixPose(previous, candidate, lo);
  }
  for (const l of limbs) {
    if (l.phase >= 1 || robotState.lifted(l)) continue;
    if ((l.escapeFor || 0) > 0) {
      robotState.freeBlockedJoint(l, dt);
      l.escapeFor -= dt;
      l.phase = .5;
      if (l.escapeFor <= 0) {
        l.from = {
          ...l.foot
        };
        l.to = robotState.rest(l);
        l.phase = robotState.validContact(l) && robotState.limbClear(l) ? 1 : 0;
      }
      continue;
    }
    const oldFoot = {
        ...l.foot
      },
      oldPhase = l.phase;
    l.phase = Math.min(1, l.phase + dt * CONFIG.movement.stepSwingRate / (robotState.scale??ctx.scale));
    const q = smooth(l.phase),
      arc = Math.sin(l.phase * Math.PI) * (l.kind === 'leg' ? 5 : 3) * (robotState.scale??ctx.scale),
      frame = robotState.limbFrame(l);
    let desired = {
      x: l.from.x + (l.to.x - l.from.x) * q - Math.sin(frame.angle) * l.side * arc,
      y: l.from.y + (l.to.y - l.from.y) * q + Math.cos(frame.angle) * l.side * arc
    };
    // Only a lifted limb may adjust its landing position to stay reachable.
    const rx = ((desired.x - frame.x) * Math.cos(frame.angle) + (desired.y - frame.y) * Math.sin(frame.angle)) / (robotState.scale??ctx.scale),
      ry = (-(desired.x - frame.x) * Math.sin(frame.angle) + (desired.y - frame.y) * Math.cos(frame.angle)) / (robotState.scale??ctx.scale);
    // The old -7 cm leg bound cut off even safe forward landing targets.
    // Relax it only while moving fast; the true IK/obstacle tests below
    // still reject unsafe placements and restore the previous pose.
    const legFront=-7+CONFIG.movement.stepLegForwardGainCm*fastGaitFactor(robotState);
    desired = robotState.local(frame, l.kind === 'extra' ? clamp(rx, -14, 18) : l.kind === 'arm' ? Math.max(7, rx) : clamp(rx, -44, legFront), l.side * Math.max(l.kind === 'arm' ? 5 : 23, ry * l.side));
    const a = robotState.origin(l),
      [u, v] = robotState.lengths(l),
      dx = desired.x - a.x,
      dy = desired.y - a.y,
      d = Math.hypot(dx, dy) || 1,
      rad = clamp(d, Math.abs(u - v) + 2 * (robotState.scale??ctx.scale), u + v - 2 * (robotState.scale??ctx.scale));
    desired = {
      x: a.x + dx / d * rad,
      y: a.y + dy / d * rad
    };
    l.foot = desired;
    if (!robotState.limbClear(l)) {
      l.foot = ik(robotState.origin(l), oldFoot, u, v, l.kind === 'arm' ? l.side : -l.side).end;
      l.phase = oldPhase;
      l.stall = (l.stall || 0) + dt;
      if (l.stall > .12) {
        l.escapeFor = .5;
        l.phase = .5;
        l.stall = 0;
      }
    } else l.stall = 0;
  }
}
export function updateHead(robotState, dt) {
  if (robotState.currentIntent.lookPoint) {
    const p = robotState.currentIntent.lookPoint,
      pivot = robotState.local(robotState.chest, 14, 0),
      desired = Math.atan2(p.y - pivot.y, p.x - pivot.x);
    // Track in the neck's local frame: global yaw alone could twist the head
    // far beyond the physical scan limit while the torso was turning.
    const desiredLocal = clamp(wrap(desired - robotState.chest.angle), -ctx.HEAD_LIMIT, ctx.HEAD_LIMIT);
    const currentLocal = clamp(wrap(robotState.gazeYaw - robotState.chest.angle), -ctx.HEAD_LIMIT, ctx.HEAD_LIMIT);
    robotState.look = clamp(currentLocal + clamp(desiredLocal-currentLocal,
      -ctx.TRACK_SPEED*dt,ctx.TRACK_SPEED*dt), -ctx.HEAD_LIMIT,ctx.HEAD_LIMIT);
    robotState.gazeYaw = robotState.chest.angle + robotState.look;
    robotState.scanAngle = robotState.look;
  } else {
    if (Math.abs(robotState.look) > ctx.HEAD_LIMIT + .001) robotState.look += clamp(clamp(robotState.look, -ctx.HEAD_LIMIT, ctx.HEAD_LIMIT) - robotState.look, -ctx.TRACK_SPEED * dt, ctx.TRACK_SPEED * dt);else {
      robotState.scanAngle += robotState.scanDirection * ctx.SCAN_SPEED * dt;
      if (robotState.scanAngle > ctx.HEAD_LIMIT) {
        robotState.scanAngle = 2 * ctx.HEAD_LIMIT - robotState.scanAngle;
        robotState.scanDirection = -1;
      }
      if (robotState.scanAngle < -ctx.HEAD_LIMIT) {
        robotState.scanAngle = -2 * ctx.HEAD_LIMIT - robotState.scanAngle;
        robotState.scanDirection = 1;
      }
      robotState.look = robotState.scanAngle;
    }
    robotState.gazeYaw = robotState.chest.angle + robotState.look;
  }
  const before = robotState.headFrame;
  robotState.headFrame = robotState.headFrameAt(robotState.gazeYaw);
  if (!robotState.clearCircle(robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0), 13 * (robotState.body?.headSizeFactor??1) * (robotState.scale??ctx.scale)) || !robotState.clearCircle(robotState.local(robotState.headFrame, 25 + 14*(robotState.body?.headSizeFactor??1) + robotState.headMotion, 0), 2.5 * (robotState.body?.headSizeFactor??1) * (robotState.scale??ctx.scale))) {
    robotState.headFrame = before;
    robotState.gazeYaw = before.angle;
    robotState.look = clamp(wrap(robotState.gazeYaw - robotState.chest.angle),-ctx.HEAD_LIMIT,ctx.HEAD_LIMIT);
    robotState.gazeYaw = robotState.chest.angle + robotState.look;
  }
}
// Действия прогулки используют тот же IK; угроза прерывает их сразу.
export function robotTick(robotState, dt, intent) {
  robotState.updateExtraLimbs(dt);
  if (!robotState.mobile()) {
    if (robotState.scene) robotState.api.endScene();
    robotState.leap = null;
    robotState.vx = robotState.vy = 0;
    robotState.requestedSpeed = 0;
    robotState.currentIntent = {
      goal: {
        x: robotState.x,
        y: robotState.y
      },
      speed: 0,
      mode: 'обездвижен',
      lookPoint: null
    };
    robotState.api.capsules = robotState.makeCapsules();
    return;
  }
  const strikes=intent.manual?[]:pendingStrikes(robotState.id);
  if(strikes.some(p=>p.source.startsWith('leg-'))){
    // Keep planted supports during an autonomous kick. A boss can still
    // track the opponent in front while a leg attacks separately behind it.
    if(robotState.scene)robotState.api.endScene();
    robotState.vx=robotState.vy=robotState.requestedSpeed=0;
    const primary=strikes[0];
    const lookPoint=robotState.body?.isBoss&&!primary.source.startsWith('leg-')?primary.aim:null;
    robotState.currentIntent={goal:{x:robotState.x,y:robotState.y},speed:0,mode:'лягается',lookPoint};
    robotState.updateHead(dt);
    return;
  }
  if (robotState.scene && robotState.idleKinds.includes(robotState.mode) && intent.mode !== 'wander') robotState.api.endScene();
  if (robotState.scene && robotState.mode === 'hops' && ctx.game.time >= robotState.scene.ends) robotState.updateIdleHops(dt);
  if (robotState.scene && (robotState.mode === 'startle' || robotState.idleKinds.includes(robotState.mode)) && ctx.game.time >= robotState.scene.ends) robotState.api.endScene();
  if (ctx.combat.finished && !robotState.scene) robotContinueVictory(robotState);
  if (!ctx.combat.finished && !robotState.scene && !robotState.leap && intent.mode === 'wander' && ctx.game.time >= robotState.nextIdleAt) {
    if (!robotState.api.performIdle(robotState.idleKinds[robotState.idleSequence % robotState.idleKinds.length])) robotState.nextIdleAt = ctx.game.time + 2;
  }
  if (robotState.scene) {
    robotState.t = ctx.game.time;
    if (robotState.idleKinds.includes(robotState.mode)) robotState.updateIdleScene(dt);else robotState.updateScene();
    return;
  }
  // The victory pose is a one-shot animation, not a return to wandering.
  if(ctx.combat.finished){robotState.vx=robotState.vy=0;return;}
  if (robotState.leap && robotState.leap.kind === 'rebound') {
    robotState.reboundTick(dt, intent);
    return;
  }
  if (robotState.boundaryRecovery) {
    robotState.leap = null;
    if (robotState.retreatFromBoundary(dt)) return;
  }
  if (robotState.leap && !robotState.leap.launched) {
    const desired = Math.atan2(robotState.leap.goal.y - robotState.y, robotState.leap.goal.x - robotState.x);
    const error = Math.abs(wrap(desired - robotState.chest.angle));
    if (error <= CONFIG.attack.pounceAlignDeg * Math.PI / 180) {
      const distance = Math.hypot(robotState.leap.goal.x - robotState.x, robotState.leap.goal.y - robotState.y);
      robotState.leap.direction = {
        x: Math.cos(robotState.chest.angle),
        y: Math.sin(robotState.chest.angle)
      };
      robotState.leap.goal = {
        x: robotState.x + robotState.leap.direction.x * distance,
        y: robotState.y + robotState.leap.direction.y * distance
      };
      robotState.leap.started = ctx.game.time;
      robotState.leap.lastHead = {...robotState.api.eye};
      robotState.leap.launched = true;
      // The sound/event fires in jumpTick on the first actual movement,
      // not at alignment, which may precede takeoff by 120 ms.
    } else if (ctx.game.time - robotState.leap.prepareAt > CONFIG.attack.pounceTurnTimeoutSec) {
      robotState.leap = null;
    } else if(intent.manual){
      // A standing player never turns automatically to line up a headbutt.
      robotState.leap=null;
    } else {
      intent = {
        goal: robotState.leap.goal,
        speed: 0,
        mode: 'pounce-turn',
        lookPoint: robotState.leap.goal
      };
    }
  }
  if (robotState.leap?.launched) {
    robotState.jumpTick(dt, intent);
    return;
  }
  if (ctx.game.time < (robotState.combatRecoveryUntil??0)) {
    robotState.vx=robotState.vy=0;
    robotState.currentIntent={goal:{x:robotState.x,y:robotState.y},
      speed:0,mode:'восстанавливается',lookPoint:intent.lookPoint??null};
    robotState.updateHead(dt);
    return;
  }
  if (robotState.retreatFromBoundary(dt)) return;
  if (robotState.reboundEscape && ctx.game.time < robotState.reboundEscape.until && intent.mode === 'flee') intent = {
    ...intent,
    goal: {
      x: robotState.x + robotState.reboundEscape.x * 100,
      y: robotState.y + robotState.reboundEscape.y * 100
    },
    brake: false,
    retreat: {
      x: robotState.reboundEscape.x,
      y: robotState.reboundEscape.y
    }
  };
  robotState.currentIntent = intent;
  robotState.t = ctx.game.time;
  robotState.behavior = intent.mode === 'chase' ? 'follow' : 'wander';
  robotState.target = intent.goal || {
    x: robotState.x,
    y: robotState.y
  };
  // Сохраняем опоры: при тесном контакте небезопасный шаг откатывается целиком.
  // Recoil and independently advanced opponents can leave an existing
  // overlap. A commanded step may reduce it while walls and supports stay solid.
  if(intent.manual&&intent.speed>0&&robotState.peerRobots().length){
    robotState.stepPeerOverlap=peerBodyOverlap(robotState);
  }
  const previousHeadMotion = robotState.headMotion;
  robotState.headMotion = 0;
  if (!robotState.rigClear()) robotState.headMotion = previousHeadMotion;
  const previousGait = robotState.gait,
    previousTurnRate = robotState.turnRate,
    previousBlend = robotState.gaitBlend;
  const previousLimbs = robotState.allLimbs().map(l => ({
    foot: {
      ...l.foot
    },
    phase: l.phase,
    from: {
      ...l.from
    },
    to: {
      ...l.to
    },
    stall: l.stall,
    escapeFor: l.escapeFor
  }));
  const navigationRecovering=intent.navigate&&intent.speed>0&&robotState.t<robotState.recoveryUntil;
  const old = robotState.savePose(),
    goal = intent.goal || {
      x: robotState.x,
      y: robotState.y
    },
    waypoint = intent.navigate?robotState.steerTo(goal,Math.max(intent.navigationPadding,robotState.routePadding),6*(robotState.scale??ctx.scale)):intent.manual?goal:robotState.steerTo(goal),
    dx = waypoint.x - robotState.x,
    dy = waypoint.y - robotState.y,
    heading = navigationRecovering?robotState.angle:intent.manual || robotState.t >= robotState.recoveryUntil ? headingForIntent(robotState.angle, robotState, waypoint, intent) : robotState.angle,
    turn = wrap(heading - robotState.angle),
    speed = intent.speed * CONFIG.movement.speedMultiplier * patientMovementMultiplier(robotState.id,robotState.api,0) * robotState.locomotion() * clamp(Math.hypot(intent.navigate?dx:goal.x - robotState.x, intent.navigate?dy:goal.y - robotState.y) / 18, 0, 1) * (intent.navigate?Math.max(0,Math.cos(turn)):1) * (robotState.reduced ? 1 : .86 + .14 * Math.sin(robotState.gait * 2 - .5));
  const flinching = robotState.hitReaction && ctx.game.time < robotState.hitReaction.start + robotState.hitReaction.duration;
  const flinchTime = flinching ? (ctx.game.time - robotState.hitReaction.start) / robotState.hitReaction.duration : 1;
  const flinchSlow = flinching ? .18 + .82 * smooth(flinchTime) : 1;
  robotState.requestedSpeed = speed * flinchSlow;
  const turning = robotState.turnAbility() * flinchSlow * CONFIG.movement.turnSpeedMultiplier * patientMovementMultiplier(robotState.id,robotState.api,2);
  const rotate = clamp(turn * dt * 5 * turning, -3.4 * dt * turning, 3.4 * dt * turning);
  robotState.angle += rotate;
  robotState.turnRate += (rotate / dt - robotState.turnRate) * (1 - Math.exp(-dt * 8));
  const ease = 1 - Math.exp(-dt * (intent.brake ? 18 : 7));
  let tx = Math.cos(robotState.angle) * speed * Math.max(.15, 1 - Math.abs(turn) / Math.PI),
    ty = Math.sin(robotState.angle) * speed * Math.max(.15, 1 - Math.abs(turn) / Math.PI);
  if (intent.retreat) {
    tx = intent.retreat.x * speed;
    ty = intent.retreat.y * speed;
    robotState.recoveryUntil = Math.max(robotState.recoveryUntil, robotState.t + .1);
  } else if ((!intent.manual||intent.navigate&&intent.speed>0) && robotState.t < robotState.recoveryUntil) {
    const distanceTo = b => nearestObstaclePoint({
      x: robotState.x,
      y: robotState.y
    }, b).distance;
    const nearest = ctx.obstacles.reduce((a, b) => !a || distanceTo(b) < distanceTo(a) ? b : a, null);
    const closest = nearest ? nearestObstaclePoint({
      x: robotState.x,
      y: robotState.y
    }, nearest).point : {x:robotState.x-Math.cos(robotState.angle),y:robotState.y-Math.sin(robotState.angle)};
    let nx = robotState.x - closest.x,
      ny = robotState.y - closest.y;
    const peer = robotState.peerRobots().sort((a, b) => Math.hypot(a.x - robotState.x, a.y - robotState.y) - Math.hypot(b.x - robotState.x, b.y - robotState.y))[0];
    if (peer && Math.hypot(peer.x - robotState.x, peer.y - robotState.y) < 130) {
      nx = robotState.x - peer.x;
      ny = robotState.y - peer.y;
    }
    const surface = robotState.nearestSurface(robotState.api.capsules);
    if (surface.distance < 8) {
      nx = surface.nx;
      ny = surface.ny;
    }
    const d = Math.hypot(nx, ny) || 1;
    tx = nx / d * 22 * CONFIG.movement.speedMultiplier * patientMovementMultiplier(robotState.id,robotState.api,0);
    ty = ny / d * 22 * CONFIG.movement.speedMultiplier * patientMovementMultiplier(robotState.id,robotState.api,0);
  }
  if (intent.brake) tx = ty = 0;
  tx *= flinchSlow;
  ty *= flinchSlow;
  // Recoil decays rapidly and is inserted before collision / IK validation.
  const impulseDecay = Math.exp(-dt * 7.5);
  robotState.vx += (tx - robotState.vx) * ease;
  robotState.vy += (ty - robotState.vy) * ease;
  robotState.vx += robotState.recoilX * dt * 7.5;
  robotState.vy += robotState.recoilY * dt * 7.5;
  robotState.recoilX *= impulseDecay;
  robotState.recoilY *= impulseDecay;
  if (!flinching && robotState.hitReaction) robotState.hitReaction = null;
  robotState.x += robotState.vx * dt;
  robotState.y += robotState.vy * dt;
  robotState.gait += Math.hypot(robotState.vx, robotState.vy) * dt / (CONFIG.movement.stepCycleDistanceCm * (robotState.scale??ctx.scale));
  robotState.layoutBody(dt);
  resolveSurfaceContacts(robotState);
  robotState.contacts(dt, old);
  resolveSurfaceContacts(robotState);
  robotState.updateHead(dt);
  robotState.gaitBlend += ((Math.hypot(robotState.vx, robotState.vy) > 1 ? 1 : 0) - robotState.gaitBlend) * (1 - Math.exp(-dt * 10));
  robotState.updateTail(); // Проверяем хвост с уже обновлённой амплитудой шага.
  if (!robotState.rigClear()) {
    robotState.headMotion = previousHeadMotion;
    robotState.gait = previousGait;
    robotState.turnRate = previousTurnRate;
    robotState.gaitBlend = previousBlend;
    robotState.mixPose(old, old, 0);
    robotState.allLimbs().forEach((l, i) => Object.assign(l, previousLimbs[i]));
    robotState.vx = robotState.vy = 0;
  }
  robotState.stepPeerOverlap=null;
  // Учитываем итоговое перемещение ПОСЛЕ отката небезопасного шага.
  if(!intent.manual||intent.navigate&&intent.speed>0)robotState.watchProgress(dt, old);
  robotState.api.capsules = robotState.makeCapsules();
}
