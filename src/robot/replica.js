import {encodeFrame, encodeNumber, encodePoint} from '../lan/battle-protocol.js';
import {robotSetVisible} from './scenes.js';

const point = ([x, y]) => ({x, y});
export const decodeFrame = ([x, y, angle]) => ({x, y, angle});

export function captureRobotReplica(robot) {
  const {offset, turn, scale, opacity, lift, headStrike} = robot.paintedReplica ?? {
    offset: {x: 0, y: 0}, turn: 0, scale: 1, opacity: 1, lift: 1, headStrike: {x: 0, y: 0},
  };
  return {
    root: encodeFrame(robot),
    frames: [robot.chest, robot.pelvis, robot.headFrame, ...robot.spine].map(encodeFrame),
    tail: robot.tail.map(encodePoint),
    limbs: [...robot.arms, ...robot.legs].map(limb => (limb.pose ?? [limb.foot, limb.foot, limb.foot]).flatMap(encodePoint)),
    appearance: [offset.x, offset.y, turn, scale, opacity, lift, headStrike.x, headStrike.y, robot.headMotion].map(encodeNumber),
    health: robot.segments.map(key => robot.broken.has(key) ? -1 : robot.hp.get(key)),
    bossPhase: robot.body?.behavior?.state.phase ?? null,
    cue: (robot.bossCue?.points ?? []).map(encodePoint),
    crit: robot.segments.flatMap((key, index) => robot.segmentCritTints?.has(key)
      ? [[index, encodeNumber(robot.segmentCritTints.get(key))]] : []),
    visible: robot.visible,
    unconscious: robot.bledOut,
    trauma: encodeNumber(robot.trauma),
    cause: robot.knockoutCause,
    action: robot.body?.behavior?.state.status || robot.api.state,
  };
}

export function applyRobotReplica(robot, view) {
  if(view.frames.length!==robot.spine.length+3||view.limbs.length!==robot.arms.length+robot.legs.length||
    view.health.length!==robot.segments.length)return;

  const [chest, pelvis, headFrame, ...spine] = view.frames;
  const [offsetX, offsetY, turn, scale, opacity, lift, headX, headY, headMotion] = view.appearance;
  Object.assign(robot, decodeFrame(view.root), {
    chest: decodeFrame(chest), pelvis: decodeFrame(pelvis), headFrame: decodeFrame(headFrame),
    spine: spine.map(decodeFrame), tail: view.tail.map(point), headMotion,
    trauma: view.trauma, bledOut: view.unconscious, knockoutCause: view.cause,
    replicaPose: {
      offset: {x: offsetX, y: offsetY}, turn, scale, opacity, lift, headStrike: {x: headX, y: headY},
      bossPhase: view.bossPhase, cue: view.cue.map(point),
      limbs: view.limbs.map(([ax, ay, jx, jy, ex, ey]) =>
        [{x: ax, y: ay}, {x: jx, y: jy}, {x: ex, y: ey}]),
    },
  });
  robot.currentIntent.mode = view.action;
  robot.broken.clear();
  for (const [index, key] of robot.segments.entries()) {
    const hp = view.health[index];
    robot.hp.set(key, Math.max(0, hp));
    if (hp < 0) robot.broken.add(key);
  }
  robot.segmentCritTints = new Map(view.crit
    .filter(([index]) => Number.isInteger(index) && robot.segments[index])
    .map(([index, time]) => [robot.segments[index], time]));
  if (view.visible !== robot.visible) robotSetVisible(robot, view.visible);
}
