import { clamp, smooth } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { CONFIG } from "../config.js";
import { ik, path } from "../utils/math.js";
import { paintLighting } from './lighting.js';
import { attr, dot } from "./svg.js";
import { victoryBodyColor, ROBOT_COLORS } from "../utils/colors.js";
import { paintRobotSkin, paintSkinVictory } from './robot-skin.js';
import { paintTorsoShadow } from './ground-spots.js';
export function visualOffset(robotState) {
  if (robotState.scene && (robotState.mode === 'cover' || robotState.mode === 'eat') && robotState.attackVisual) {
    const q = robotState.mode === 'eat' ? 1 : smooth((ctx.game.time - robotState.scene.started) / CONFIG.attack.coverApproachSec);
    return {
      x: robotState.attackVisual.x * q,
      y: robotState.attackVisual.y * q
    };
  }
  if (robotState.leap?.kind === 'rebound' && !robotState.leap.launched) return robotState.leap.offset;
  return {
    x: 0,
    y: 0
  };
}
export function visualRotation(robotState) {
  return robotState.leap?.kind === 'rebound' && !robotState.leap.launched && robotState.leap.turnDuration ? robotState.leap.turn * smooth((ctx.game.time - robotState.leap.started) / robotState.leap.turnDuration) : 0;
}
export function visiblePoint(robotState, p) {
  const o = robotState.visualOffset(),
    a = robotState.visualRotation(),
    dx = p.x - robotState.x,
    dy = p.y - robotState.y;
  return {
    x: robotState.x + o.x + dx * Math.cos(a) - dy * Math.sin(a),
    y: robotState.y + o.y + dx * Math.sin(a) + dy * Math.cos(a)
  };
}
export function bodyTransform(robotState, height) {
  if (!height) return '';
  let factor = 1 + height * .13;
  const center = robotState.visiblePoint({
    x: robotState.x,
    y: robotState.y
  });
  for (const capsule of robotState.api.capsules) for (const endpoint of [capsule.a, capsule.b]) {
    const p = robotState.visiblePoint(endpoint);
    for (const n of ctx.arenaPlanes) {
      const delta = n.nx * (p.x - center.x) + n.ny * (p.y - center.y) + capsule.r * Math.hypot(n.nx, n.ny);
      if (delta > 0) factor = Math.min(factor, (n.c - n.nx * center.x - n.ny * center.y) / delta);
    }
  }
  factor = Math.max(1, factor);
  return factor > 1.0001 ? `translate(${robotState.x} ${robotState.y}) scale(${factor}) translate(${-robotState.x} ${-robotState.y})` : '';
}
// Проверяем всю дистанцию пары прыжков до отрыва от земли.

// При прерывании жеста текущая рука становится новой опорой без скачка позы.

// Видимая кисть движется относительно плеча, но другие лапы остаются опорными.
export function draw(robotState, dt) {
  const offset = robotState.visualOffset();
  paintLighting(robotState);
  const eating = robotState.mode === 'eat',
    chew = eating && robotState.eatTime > CONFIG.attack.eatSec * .65 / 2.6 && robotState.eatTime < CONFIG.attack.eatSec * 1.8 / 2.6 ? robotState.reduced ? 1 : (1 + Math.sin(robotState.eatTime * 24)) / 2 : 0;
  if (robotState.tailPath) {
    attr(robotState.tailPath, 'd', '');
    for (let i = 0; i < CONFIG.robot.tailSegments; i++) {
      dot(robotState.tailDots[i], robotState.tail[i + 1]);
      attr(robotState.tailDots[i], 'display', robotState.healthy('tail-' + i) ? '' : 'none');
    }
    robotState.tailBones.forEach((node, i) => attr(node, 'd', robotState.healthy('tail-' + i) ? path([robotState.tail[i], robotState.tail[i + 1]]) : ''));
  }
  attr(robotState.torso, 'd', '');
  robotState.spineBones.forEach((node, i) => attr(node, 'd', robotState.healthy('spine-' + i) ? path([robotState.spine[i], robotState.spine[i + 1]]) : ''));
  for (let i = 0; i < robotState.spine.length; i++) {
    dot(robotState.spineDots[i], robotState.spine[i]);
    attr(robotState.spineDots[i], 'opacity', i === 0 ? Number(robotState.healthy('spine-0')) : Number(robotState.healthy('spine-' + Math.min(3, i - 1))));
  }
  attr(robotState.pelvicBar, 'd', robotState.healthy('spine-3') ? path([robotState.local(robotState.pelvis, -5, -12), robotState.local(robotState.pelvis, -5, 12)]) : '');
  // Shoulder girdle belongs to the unbreakable chest and joins both arm roots.
  attr(robotState.shoulderBar, 'd', path([robotState.local(robotState.chest, 3, -15), robotState.local(robotState.chest, 3, 15)]));
  attr(robotState.neck, 'd', path([robotState.local(robotState.chest, 3, 0), robotState.local(robotState.headFrame, 18 + robotState.headMotion, 0)]));
  robotState.headCenter = robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0);
  robotState.mouthPoint = robotState.local(robotState.headFrame, 34 + robotState.headMotion, 0);
  robotState.horns.forEach((node, i) => attr(node, 'd', path(robotState.hornPoints(i === 0 ? -1 : 1))));
  if (robotState.spheres.length) robotState.sphereCenters().forEach((p, i) => {
    dot(robotState.spheres[i], p, CONFIG.robot.sphereRadiusCm);
    attr(robotState.spheres[i], 'display', robotState.healthy('spine-0') ? '' : 'none');
  });
  attr(robotState.head, 'display', robotState.hasHead() ? '' : 'none');
  attr(robotState.neck, 'display', robotState.hasHead() ? '' : 'none');
  attr(robotState.nose, 'display', robotState.hasHead() ? '' : 'none');
  attr(robotState.mouth, 'display', robotState.hasHead() ? '' : 'none');
  for (const horn of robotState.horns) attr(horn, 'display', robotState.hasHead() ? '' : 'none');
  attr(robotState.head, 'cx', robotState.headCenter.x);
  attr(robotState.head, 'cy', robotState.headCenter.y);
  attr(robotState.head, 'rx', (robotState.mode === 'caught' ? 10 - 3 * robotState.sceneEnvelope() : 10) * ctx.scale);
  attr(robotState.head, 'ry', 10 * ctx.scale);
  attr(robotState.head, 'transform', `rotate(${robotState.headFrame.angle * 180 / Math.PI} ${robotState.headCenter.x} ${robotState.headCenter.y})`);
  attr(robotState.nose, 'd', path([robotState.local(robotState.headFrame, 30 + robotState.headMotion, 0), robotState.local(robotState.headFrame, 38 + robotState.headMotion, 0)]));
  attr(robotState.mouth, 'cx', robotState.mouthPoint.x);
  attr(robotState.mouth, 'cy', robotState.mouthPoint.y);
  attr(robotState.mouth, 'rx', (1 + chew * 3) * ctx.scale);
  attr(robotState.mouth, 'ry', (1 + chew * 2) * ctx.scale);
  const pendingStrike = ctx.combat.pending[robotState.id];
  const strikePose = pendingStrike ? robotState.attackPose(pendingStrike) : null;
  if (strikePose?.kind === 'head') {
    const ox = strikePose.tip.x - strikePose.base.x,
      oy = strikePose.tip.y - strikePose.base.y;
    const transform = `translate(${ox} ${oy})`;
    for (const node of [robotState.head, robotState.nose, robotState.mouth, ...robotState.horns]) attr(node, 'transform', transform);
    // Эллипс сам использует rotate(), который дополняем смещением.
    attr(robotState.head, 'transform', `${transform} rotate(${robotState.headFrame.angle * 180 / Math.PI} ${robotState.headCenter.x} ${robotState.headCenter.y})`);
  } else {
    for (const node of [robotState.head, robotState.nose, robotState.mouth, ...robotState.horns]) attr(node, 'transform', '');
    attr(robotState.head, 'transform', `rotate(${robotState.headFrame.angle * 180 / Math.PI} ${robotState.headCenter.x} ${robotState.headCenter.y})`);
  }
  for (const l of [...robotState.arms, ...robotState.legs, ...robotState.extraLimbs]) {
    const attackEnd = strikePose?.kind === 'arm' && strikePose.limb === l ? strikePose.tip : robotState.handEnd(l);
    const a = robotState.origin(l),
      solved = ik(a, attackEnd, ...robotState.lengths(l), l.kind === 'arm' ? l.side : -l.side);
    const prefix = `${l.kind}-${l.side}-`;
    const stumpStrike = strikePose?.kind === 'arm' && strikePose.limb === l && !strikePose.complete;
    attr(l.upper, 'd', robotState.healthy(prefix + 'upper') ? path([a, stumpStrike ? strikePose.tip : solved.joint]) : '');
    attr(l.lower, 'd', robotState.healthy(prefix + 'lower') ? path([solved.joint, solved.end]) : '');
    attr(l.joint, 'display', robotState.healthy(prefix + 'upper') || robotState.healthy(prefix + 'lower') ? '' : 'none');
    attr(l.endShape, 'display', robotState.healthy(prefix + 'lower') ? '' : 'none');
    dot(l.joint, solved.joint);
    dot(l.endShape, solved.end);
    dot(l.contact, robotState.visiblePoint(l.foot));
    attr(l.contact, 'opacity', !robotState.healthyLimb(l) || robotState.lifted(l) || l.phase < 1 ? '0' : '.5');
    l.pose = [a, solved.joint, solved.end];
  }
  paintRobotSkin(robotState,strikePose);
  paintTorsoShadow(robotState);
}

// Действия прогулки используют тот же IK; угроза прерывает их сразу.

// Проверяем весь манёвр: сначала вперёд, затем варианты с разворотом.
export function visionAngle(robotState) {
  return robotState.hasHead() ? CONFIG.vision.runnerAngleDeg * Math.PI / 180 : 0;
}
export function robotPaint(robotState, hunter) {
  if (!robotState.visible) return;
  hunter = false;
  const shield = hunter ? 0 : clamp((ctx.game.immune[robotState.id] - ctx.game.time) / Math.max(.001, CONFIG.attack.previousHunterShieldSec), 0, 1);
  const victorious = ctx.combat.finished && ctx.combat.winner === robotState.id;
  const victoryColor = victorious ? victoryBodyColor(robotState.reduced ? 0 : ctx.game.time - (ctx.combat.finishedAt ?? ctx.game.time)) : null;
  paintSkinVictory(robotState,victoryColor);
  attr(robotState.actor, 'style', `--robot-color:${victoryColor ?? '#b7ada1'};filter:none`);
  attr(robotState.label, 'style', 'fill:'+ROBOT_COLORS[robotState.id]);
  const offset = robotState.visualOffset();
  const elapsedHit = robotState.hitReaction ? ctx.game.time - robotState.hitReaction.start : Infinity;
  const hitPhase = clamp(elapsedHit / (robotState.hitReaction?.duration || 1), 0, 1);
  const recoilTilt = robotState.hitReaction && hitPhase < 1 ? robotState.hitReaction.twist * Math.sin(Math.PI * hitPhase) * (1 - hitPhase) : 0;
  attr(robotState.actor, 'transform', `translate(${robotState.x + offset.x} ${robotState.y + offset.y}) rotate(${robotState.visualRotation() * 180 / Math.PI + recoilTilt}) translate(${-robotState.x} ${-robotState.y})`);
  const age = robotState.leap && (robotState.leap.launched || robotState.leap.kind === 'rebound') ? ctx.game.time - robotState.leap.started : 0,
    height = robotState.scene && robotState.mode === 'cover' ? robotState.coverHeightStart * (1 - smooth((ctx.game.time - robotState.scene.started) / CONFIG.attack.coverApproachSec)) + (1 - robotState.coverHeightStart) * .7 * Math.sin(Math.PI * clamp((ctx.game.time - robotState.scene.started) / CONFIG.attack.coverApproachSec, 0, 1)) : robotState.scene && robotState.mode === 'hops' ? robotState.hopHeight() : robotState.leap ? Math.sin(Math.PI * clamp(robotState.leap.kind === 'rebound' ? (age - robotState.leap.turnDuration) / CONFIG.attack.dismountSec : (age - .12) / .82, 0, 1)) : robotState.mode === 'startle' && robotState.scene ? Math.sin(Math.PI * clamp((ctx.game.time - robotState.scene.started) / CONFIG.attack.startleSec, 0, 1)) * .55 : 0;
  attr(robotState.limbG, 'transform', robotState.bodyTransform(height));
  attr(robotState.bodyG, 'transform', robotState.bodyTransform(height));
  attr(robotState.actor, 'class', hunter ? 'robot hunter' : shield > 0 ? 'robot protected' : 'robot');
  attr(robotState.vision, 'class', hunter ? 'cone hunter' : shield > 0 ? 'cone protected' : 'cone');
  attr(robotState.vision, 'fill', 'url(#' + robotState.beamId + '-tint)');
  for (const stop of robotState.tintStops) attr(stop, 'stop-color', hunter ? 'var(--night-accent)' : shield > 0 ? `color-mix(in srgb, var(--night-protected) ${shield * 100}%, var(--night-light))` : 'var(--night-light)');
  robotState.draw(0);
  // Отпечаток появляется только при постановке конечности на землю.
  for (const l of robotState.allLimbs()) {
    const grounded = l.phase >= 1 && !robotState.lifted(l),
      previous = robotState.lastFootTouches.get(l);
    const p = robotState.visiblePoint(robotState.handEnd(l));
    if (grounded && !previous?.grounded && (!previous?.point || Math.hypot(p.x - previous.point.x, p.y - previous.point.y) > .25)) {
      robotState.trail.push({
        x: p.x,
        y: p.y,
        time: ctx.game.time,
        hunter,
        shield
      });
      if (robotState.trail.length > CONFIG.trails.limit) robotState.trail.shift();
    }
    robotState.lastFootTouches.set(l, {
      grounded,
      point: grounded ? {
        ...p
      } : previous?.point
    });
  }
  for (let i = 0; i < CONFIG.trails.limit; i++) {
    const sample = robotState.trail[i],
      age = sample ? ctx.game.time - sample.time : Infinity;
    const opacity = sample ? Math.min(.65, CONFIG.trails.opacity * CONFIG.trails.neonMultiplier) * Math.max(0, 1 - age / CONFIG.trails.fadeSec) : 0;
    attr(robotState.trailNodes[i], 'opacity', opacity.toFixed(3));
    attr(robotState.trailNodes[i], 'fill', 'var(--night-trail)');
    if (sample) dot(robotState.trailNodes[i], sample);
  }
  const name = String.fromCharCode(65 + robotState.id);
  if (robotState.label.textContent !== name) robotState.label.textContent = name;
  attr(robotState.label, 'x', robotState.spine[2].x);
  attr(robotState.label, 'y', robotState.spine[2].y - 18);
  attr(robotState.label, 'opacity', '1');
}
