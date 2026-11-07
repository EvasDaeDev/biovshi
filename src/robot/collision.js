import { clamp } from '../utils/math.js';
import { arenaClearance } from "../game/arena.js";
import { coreClearBone, coreClearCircle, obstacleDistance } from "../systems/collision.js";
import { ik, pointSegment, segmentDistance } from "../utils/math.js";
import { ctx } from "../game/state.js";
// Hit capsules keep the full anatomy. Only the head and torso stop another
// robot's locomotion: articulated limbs may pass over/under each other in 2D.
export function isSolidBody(capsule) {
  return capsule.segment === 'head' || capsule.segment?.startsWith('spine-');
}
export function clearanceAt(robotState, p) {
  let d = Math.min(arenaClearance(p), obstacleDistance(p));
  for (const r of robotState.peerRobots()) for (const c of r.capsules) d = Math.min(d, pointSegment(p, c.a, c.b) - c.r);
  return d;
}
export function clearCircle(robotState, p, radius, collideWithPeers = true) {
  if (!coreClearCircle(p, radius)) return false;
  if (!collideWithPeers) return true;
  for (const other of robotState.peerRobots()) for (const c of other.capsules.filter(isSolidBody)) if (pointSegment(p, c.a, c.b) < radius + c.r + .15) return false;
  return true;
}
export function clearBone(robotState, a, b, radius, collideWithPeers = true) {
  if (!coreClearBone(a, b, radius)) return false;
  if (!collideWithPeers) return true;
  for (const other of robotState.peerRobots()) for (const c of other.capsules.filter(isSolidBody)) {
    const r = radius + c.r + .15;
    if (Math.max(a.x, b.x) + r < c.minX || Math.min(a.x, b.x) - r > c.maxX || Math.max(a.y, b.y) + r < c.minY || Math.min(a.y, b.y) - r > c.maxY) continue;
    if (segmentDistance(a, b, c.a, c.b) < r) return false;
  }
  return true;
}
export function limbClear(robotState, l, endpoint = robotState.handEnd(l)) {
  const a = robotState.origin(l),
    [u, v] = robotState.lengths(l),
    solved = ik(a, endpoint, u, v, l.kind === 'arm' ? l.side : -l.side),
    r = l.kind === 'arm' ? [4.8, 3.8, 4.8] : [6.8, 4.8, 5.8];
  if (!robotState.healthy(`${l.kind}-${l.side}-lower`)) return robotState.clearBone(a, solved.joint, r[0] * ctx.scale, false);
  return robotState.clearBone(a, solved.joint, r[0] * ctx.scale, false) && robotState.clearBone(solved.joint, solved.end, r[1] * ctx.scale, false) && robotState.clearCircle(solved.end, r[2] * ctx.scale, false);
}
export function rigClear(robotState) {
  // Проверяем только физически сохранившиеся части. Отделённый таз,
  // позвоночник и конечности больше не могут блокировать шаг своего владельца.
  if (!robotState.clearCircle(robotState.chest, 19 * ctx.scale)) return false;
  if (robotState.healthy('spine-3') && !robotState.clearCircle(robotState.pelvis, 24 * ctx.scale)) return false;
  for (let i = 1; i < robotState.spine.length; i++) if (robotState.healthy('spine-' + (i - 1)) && !robotState.clearBone(robotState.spine[i - 1], robotState.spine[i], 17 * ctx.scale)) return false;
  for (let i = 1; i < robotState.tail.length; i++) if (robotState.healthy('tail-' + (i - 1)) && !robotState.clearBone(robotState.tail[i - 1], robotState.tail[i], 3 * ctx.scale, false)) return false;
  return (!robotState.hasHead() || robotState.clearCircle(robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0), 13 * ctx.scale) && robotState.clearCircle(robotState.local(robotState.headFrame, 39 + robotState.headMotion, 0), 2.5 * ctx.scale)) && [...robotState.arms, ...robotState.legs].filter(l => robotState.healthy(`${l.kind}-${l.side}-upper`)).every(l => robotState.limbClear(l));
}
export function freeBlockedJoint(robotState, l, dt) {
  const a = robotState.origin(l),
    [u, v] = robotState.lengths(l),
    branch = l.kind === 'arm' ? l.side : -l.side,
    pose = ik(a, l.foot, u, v, branch),
    theta = Math.atan2(pose.joint.y - a.y, pose.joint.x - a.x),
    phi = Math.atan2(pose.end.y - pose.joint.y, pose.end.x - pose.joint.x),
    frame = robotState.limbFrame(l),
    step = Math.min(dt * 2, .045),
    goal = robotState.rest(l);
  const distance = robotState.clearanceAt,
    lateral = p => (-(p.x - frame.x) * Math.sin(frame.angle) + (p.y - frame.y) * Math.cos(frame.angle)) * l.side;
  let best = {
      ...l.foot
    },
    bestScore = -Infinity;
  for (const da of [-step, 0, step]) for (const db of [-step, 0, step]) {
    const ta = theta + da,
      tb = phi + db;
    if (Math.sin(ta - tb) * branch < .025) continue;
    const joint = {
        x: a.x + Math.cos(ta) * u,
        y: a.y + Math.sin(ta) * u
      },
      end = {
        x: joint.x + Math.cos(tb) * v,
        y: joint.y + Math.sin(tb) * v
      };
    if (lateral(joint) < Math.min(3 * ctx.scale, lateral(pose.joint)) - 1e-6 || lateral(end) < Math.min(3 * ctx.scale, lateral(pose.end)) - 1e-6 || !robotState.limbClear(l, end)) continue;
    const midJoint = {
        x: a.x + Math.cos(theta + da / 2) * u,
        y: a.y + Math.sin(theta + da / 2) * u
      },
      midEnd = {
        x: midJoint.x + Math.cos(phi + db / 2) * v,
        y: midJoint.y + Math.sin(phi + db / 2) * v
      };
    if (!robotState.limbClear(l, midEnd)) continue;
    const score = distance(joint) * 4 + distance(end) * .25 + Math.min(3 * ctx.scale, lateral(joint)) * 8 + Math.min(3 * ctx.scale, lateral(end)) * 8 - Math.hypot(end.x - goal.x, end.y - goal.y) * .07;
    if (score > bestScore) {
      best = end;
      bestScore = score;
    }
  }
  l.foot = best;
}
export function edgeClearance(robotState, capsules = robotState.api.capsules) {
  return Math.min(...capsules.flatMap(c => [c.a.x - c.r, c.b.x - c.r, 700 - c.a.x - c.r, 700 - c.b.x - c.r, c.a.y - c.r, c.b.y - c.r, 700 - c.a.y - c.r, 700 - c.b.y - c.r]));
}
// Ближайшая поверхность к ЛЮБОМУ звену, суставу или опоре, а не только к корпусу.
export function nearestSurface(robotState, caps) {
  let best = {
    distance: Infinity,
    nx: 0,
    ny: 0
  };
  const consider = (distance, nx, ny) => {
    if (distance < best.distance) {
      const length = Math.hypot(nx, ny) || 1;
      best = {
        distance,
        nx: nx / length,
        ny: ny / length
      };
    }
  };
  const project = (p, a, b) => {
    const dx = b.x - a.x,
      dy = b.y - a.y,
      t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return {
      x: a.x + dx * t,
      y: a.y + dy * t
    };
  };
  for (const c of caps) {
    for (const plane of ctx.arenaPlanes) {
      const length = Math.hypot(plane.nx, plane.ny);
      const distance = Math.min(plane.c - plane.nx * c.a.x - plane.ny * c.a.y, plane.c - plane.nx * c.b.x - plane.ny * c.b.y) / length - c.r;
      consider(distance, -plane.nx, -plane.ny);
    }
    for (const box of ctx.obstacles) {
      const dx = Math.max(box.left - Math.max(c.a.x, c.b.x), Math.min(c.a.x, c.b.x) - box.right, 0);
      const dy = Math.max(box.top - Math.max(c.a.y, c.b.y), Math.min(c.a.y, c.b.y) - box.bottom, 0);
      if (Math.hypot(dx, dy) - c.r >= best.distance) continue;
      for (let i = 0; i < box.points.length; i++) {
        const a = box.points[i],
          b = box.points[(i + 1) % box.points.length];
        for (const [p, q] of [[c.a, project(c.a, a, b)], [c.b, project(c.b, a, b)], [project(a, c.a, c.b), a], [project(b, c.a, c.b), b]]) {
          consider(Math.hypot(p.x - q.x, p.y - q.y) - c.r, p.x - q.x, p.y - q.y);
        }
      }
    }
  }
  return best;
}
export function validContact(robotState, l) {
  const a = robotState.origin(l),
    [u, v] = robotState.lengths(l),
    d = Math.hypot(l.foot.x - a.x, l.foot.y - a.y);
  if (d > u + v - .1 * ctx.scale || d < Math.abs(u - v) + .1 * ctx.scale) return false;
  const frame = robotState.limbFrame(l),
    solved = ik(a, l.foot, u, v, l.kind === 'arm' ? l.side : -l.side),
    lateral = p => (-(p.x - frame.x) * Math.sin(frame.angle) + (p.y - frame.y) * Math.cos(frame.angle)) * l.side;
  return lateral(l.foot) > 2 * ctx.scale && lateral(solved.joint) > 2 * ctx.scale;
}
export function makeCapsules(robotState) {
  // Incapacitated robots remain drawn but never obstruct other fighters.
  if (!robotState.mobile()) return [];
  const out = [],
    push = (a, b, r, segment) => {
      r *= ctx.scale;
      if (segment && !robotState.healthy(segment)) return;
      out.push({
        segment,
        a: {
          x: a.x,
          y: a.y
        },
        b: {
          x: b.x,
          y: b.y
        },
        r,
        minX: Math.min(a.x, b.x),
        maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxY: Math.max(a.y, b.y)
      });
    };
  for (let i = 1; i < robotState.spine.length; i++) push(robotState.spine[i - 1], robotState.spine[i], 17, 'spine-' + (i - 1));
  for (let i = 1; i < robotState.tail.length; i++) push(robotState.tail[i - 1], robotState.tail[i], 3, 'tail-' + (i - 1));
  push(robotState.chest, robotState.chest, 19, 'spine-0');
  push(robotState.pelvis, robotState.pelvis, 24, 'spine-3');
  push(robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0), robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0), 13, 'head');
  push(robotState.local(robotState.headFrame, 39 + robotState.headMotion, 0), robotState.local(robotState.headFrame, 39 + robotState.headMotion, 0), 2.5, 'head');
  for (const l of [...robotState.arms, ...robotState.legs]) {
    const a = robotState.origin(l),
      ls = robotState.lengths(l),
      p = ik(a, robotState.handEnd(l), ...ls, l.kind === 'arm' ? l.side : -l.side);
    const prefix = `${l.kind}-${l.side}-`;
    push(a, p.joint, l.kind === 'arm' ? 4.8 : 6.8, prefix + 'upper');
    push(p.joint, p.end, l.kind === 'arm' ? 3.8 : 4.8, prefix + 'lower');
    push(p.end, p.end, l.kind === 'arm' ? 4.8 : 5.8, prefix + 'lower');
  }
  if (robotState.mode === 'scratch') {
    const hand = robotState.arms.find(l => l.side === 1);
    if (robotState.healthyLimb(hand)) push(hand.foot, hand.foot, 4.8, `arm-${hand.side}-lower`);
  }
  return out;
}
