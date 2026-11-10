import { clamp, wrap } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { strikeProgress } from "../systems/combat.js";
import { ik } from "../utils/math.js";
import { CONFIG } from "../config.js";
export function local(robotState, s, a, b) {
  a *= ctx.scale;
  b *= ctx.scale;
  return {
    x: s.x + (Math.cos(s.angle) * a - Math.sin(s.angle) * b),
    y: s.y + (Math.sin(s.angle) * a + Math.cos(s.angle) * b)
  };
}
export function headFrameAt(robotState, yaw) {
  const p = robotState.local(robotState.chest, 14, 0);
  return {
    x: p.x - Math.cos(yaw) * 14 * ctx.scale,
    y: p.y - Math.sin(yaw) * 14 * ctx.scale,
    angle: yaw
  };
}
export function allLimbs(robotState) {
  return [...robotState.arms, ...robotState.legs].filter(robotState.healthyLimb);
}
export function limbFrame(robotState, l) {
  return l.kind === 'extra' ? robotState.spine[2] : l.kind === 'arm' ? robotState.chest : robotState.pelvis;
}
export function handEnd(robotState, l) {
  // An amputated forearm is no longer a planted world-space support.
  // Keep its upper segment attached to the moving body, not the old hand position.
  if (robotState.healthy(`${l.kind}-${l.side}-upper`) && !robotState.healthy(`${l.kind}-${l.side}-lower`)) return robotState.rest(l);
  return l.renderEnd || l.foot;
}
// The striking hand or foot moves relative to its limb root; other limbs stay planted.
export function attackPose(robotState, p) {
  if (!p || p.source === 'head') {
    if (!p || !robotState.hasHead()) return null;
    const progress = p.preview ? {
        wind: 0,
        reach: 1
      } : strikeProgress(p),
      base = robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0);
    const dx = p.aim.x - base.x,
      dy = p.aim.y - base.y,
      d = Math.hypot(dx, dy) || 1;
    const extension = Math.min(12, d) * progress.reach - 3 * progress.wind;
    return {
      kind: 'head',
      base,
      tip: {
        x: base.x + dx / d * extension,
        y: base.y + dy / d * extension
      },
      extension,
      progress
    };
  }
  const match = /^(arm|leg)-(-?1)-(lower|upper)$/.exec(p.source);
  if (!match) return null;
  const l = (match[1] === 'arm' ? robotState.arms : robotState.legs).find(item => item.side === Number(match[2]));
  if (!l || !robotState.healthy(`${l.kind}-${l.side}-upper`)) return null;
  const complete = robotState.healthy(`${l.kind}-${l.side}-lower`);
  if ((match[3] === 'lower') !== complete) return null;
  const shoulder = robotState.origin(l),
    [upper, lower] = robotState.lengths(l);
  const restJoint = ik(shoulder, robotState.handEnd(l), upper, lower, l.kind === 'arm' ? l.side : -l.side).joint;
  const base = complete ? {
    ...l.foot
  } : {
    ...restJoint
  };
  const dx = p.aim.x - shoulder.x,
    dy = p.aim.y - shoulder.y,
    d = Math.hypot(dx, dy) || 1;
  const maxReach = complete ? upper + lower - .2 : upper - .2; // upper-only stump reaches about half as far
  const desired = {
    x: shoulder.x + dx / d * Math.min(maxReach, d),
    y: shoulder.y + dy / d * Math.min(maxReach, d)
  };
  const progress = p.preview ? {
    wind: 0,
    reach: 1
  } : strikeProgress(p);
  // Подготовка: кисть уходит назад. Выпад: вытягивание к ЗАФИКСИРОВАННОЙ при замахе точке.
  const rear = {
    x: base.x - Math.cos(robotState.angle) * 5,
    y: base.y - Math.sin(robotState.angle) * 5
  };
  const wind = progress.wind,
    reach = progress.reach;
  const tip = {
    x: base.x + (rear.x - base.x) * wind + (desired.x - base.x) * reach,
    y: base.y + (rear.y - base.y) * wind + (desired.y - base.y) * reach
  };
  const vx = tip.x - shoulder.x,
    vy = tip.y - shoulder.y,
    dist = Math.hypot(vx, vy) || 1;
  if (dist > maxReach) {
    tip.x = shoulder.x + vx / dist * maxReach;
    tip.y = shoulder.y + vy / dist * maxReach;
  }
  return {
    kind: l.kind,
    limb: l,
    shoulder,
    tip,
    base,
    progress,
    complete
  };
}
export function hornPoints(robotState, side) {
  return [robotState.local(robotState.headFrame, 24 + robotState.headMotion, side * 8), robotState.local(robotState.headFrame, 44 + robotState.headMotion, side * 10), robotState.local(robotState.headFrame, 32 + robotState.headMotion, side * 4)];
}
export function sphereCenters(robotState) {
  return [-1, 1].map(side => robotState.local(robotState.spine[1], 0, side * CONFIG.robot.sphereOffsetCm / ctx.scale));
}
export function updateExtraLimbs(robotState) {
  // The retired third pair is not part of the current patients.
  robotState.extraActive = false;
  robotState.extraWeight = 0;
}
export function updateTail(robotState) {
  robotState.tail = [];
  if (robotState.id !== 3) return;
  let p = robotState.local(robotState.pelvis, -10, 0);
  robotState.tail.push(p);
  for (let i = 0; i < CONFIG.robot.tailSegments; i++) {
    const yaw = robotState.pelvis.angle + (robotState.reduced ? 0 : Math.sin(robotState.gait * .65 - i * .6) * .24 * robotState.gaitBlend) + clamp(robotState.turnRate, -2, 2) * i * .06;
    p = {
      x: p.x - Math.cos(yaw) * CONFIG.robot.vertebraBaseCm * ctx.scale,
      y: p.y - Math.sin(yaw) * CONFIG.robot.vertebraBaseCm * ctx.scale
    };
    robotState.tail.push(p);
  }
}
export function layoutBody(robotState, dt) {
  const stretching = robotState.gesture.kind === 'stretch' ? robotState.gesture.weight : 0,
    sway = robotState.reduced ? 0 : Math.sin(robotState.gait) * .10 * robotState.gaitBlend + stretching * Math.sin(robotState.gesture.time * 2.8) * .10;
  const backingOut = robotState.t < robotState.recoveryUntil;
  robotState.chest = {
    x: robotState.x,
    y: robotState.y,
    angle: backingOut ? robotState.chest.angle : robotState.angle + sway
  };
  if (dt === 0 || robotState.spine.length === 0) robotState.spine = Array.from({
    length: 5
  }, (_, i) => ({
    x: robotState.x - i * CONFIG.robot.vertebraBaseCm * ctx.scale,
    y: robotState.y,
    angle: robotState.angle
  }));
  robotState.spine[0] = {
    ...robotState.chest
  };
  for (let i = 1; i < 5; i++) {
    const p = robotState.spine[i - 1],
      s = robotState.spine[i],
      wave = robotState.reduced ? 0 : Math.sin(robotState.gait - i * .7) * .055 * robotState.gaitBlend,
      aim = robotState.angle - clamp(robotState.turnRate, -2, 2) * i * .10 + wave + (robotState.reduced ? 0 : stretching * Math.sin(robotState.gesture.time * 2.8 - i * .5) * i * .065);
    s.angle += wrap(aim - s.angle) * (dt === 0 ? 1 : backingOut ? 0 : 1 - Math.exp(-dt * (9 - i)));
    s.angle = p.angle + clamp(wrap(s.angle - p.angle), -.48, .48);
    s.x = p.x - Math.cos(s.angle) * CONFIG.robot.vertebraBaseCm * ctx.scale;
    s.y = p.y - Math.sin(s.angle) * CONFIG.robot.vertebraBaseCm * ctx.scale;
  }
  robotState.pelvis = {
    ...robotState.spine[4]
  };
  robotState.updateTail();
  robotState.headFrame = robotState.headFrameAt(robotState.currentIntent.lookPoint ? robotState.gazeYaw : robotState.chest.angle + robotState.look);
}
export function handRest(robotState, side) {
  return robotState.local(robotState.chest, 30 + clamp(Math.hypot(robotState.vx, robotState.vy) / ctx.scale * .1, 0, 8), side * (27 + Math.abs(robotState.turnRate) * 2));
}
export function legRest(robotState, side) {
  return robotState.local(robotState.pelvis, -28 + clamp(Math.hypot(robotState.vx, robotState.vy) / ctx.scale * .14, 0, 10), side * 31);
}
export function origin(robotState, l) {
  return l.kind === 'extra' ? robotState.local(robotState.spine[2], 0, l.side * 12) : l.kind === 'arm' ? robotState.local(robotState.chest, 3, l.side * 15) : robotState.local(robotState.pelvis, -5, l.side * 12);
}
export function lengths(robotState, l) {
  return l.kind === 'extra' ? [CONFIG.robot.extraLimbLengthCm, CONFIG.robot.extraLimbLengthCm] : l.kind === 'arm' ? [27 * ctx.scale, 29 * ctx.scale] : [32 * ctx.scale, 33 * ctx.scale];
}
export function rest(robotState, l) {
  return l.kind === 'extra' ? robotState.local(robotState.spine[2], 6, l.side * 44) : l.kind === 'arm' ? robotState.handRest(l.side) : robotState.legRest(l.side);
}
export function savePose(robotState) {
  return {
    x: robotState.x,
    y: robotState.y,
    angle: robotState.angle,
    chestAngle: robotState.chest.angle,
    angles: robotState.spine.map(s => s.angle),
    headAngle: robotState.headFrame.angle
  };
}
export function mixPose(robotState, a, b, q) {
  robotState.x = a.x + (b.x - a.x) * q;
  robotState.y = a.y + (b.y - a.y) * q;
  robotState.angle = a.angle + wrap(b.angle - a.angle) * q;
  robotState.chest = {
    x: robotState.x,
    y: robotState.y,
    angle: a.chestAngle + wrap(b.chestAngle - a.chestAngle) * q
  };
  robotState.spine[0] = {
    ...robotState.chest
  };
  for (let i = 1; i < 5; i++) {
    const s = robotState.spine[i],
      p = robotState.spine[i - 1];
    s.angle = a.angles[i] + wrap(b.angles[i] - a.angles[i]) * q;
    s.x = p.x - Math.cos(s.angle) * CONFIG.robot.vertebraBaseCm * ctx.scale;
    s.y = p.y - Math.sin(s.angle) * CONFIG.robot.vertebraBaseCm * ctx.scale;
  }
  robotState.pelvis = {
    ...robotState.spine[4]
  };
  robotState.updateTail();
  robotState.headFrame = robotState.headFrameAt(a.headAngle + wrap(b.headAngle - a.headAngle) * q);
}
