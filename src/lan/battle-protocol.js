import {LAN_MAX_FIGHTERS} from './protocol.js';

export const LAN_FRAME_BYTES = 96 * 1024;
export const LAN_SNAPSHOT_MS = 1000 / 15;
export const LAN_INPUT_MS = 50;
export const LAN_INPUT_TIMEOUT_MS = 350;
export const LAN_INTERPOLATION_MS = 100;

export const validSequence = value => Number.isSafeInteger(value) && value >= 0;
const bounded = value => Number.isFinite(value) && Math.abs(value) <= 10_000_000;
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(bounded);
const vectors = (value, size, limit) => Array.isArray(value) && value.length <= limit &&
  value.every(item => vector(item, size));

export function validMovement({x, y, seq}) {
  return Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) <= 1.001 && validSequence(seq);
}

export const encodeNumber = value => Math.round(value * 1000) / 1000;
export const encodePoint = point => [encodeNumber(point.x), encodeNumber(point.y)];
export const encodeFrame = point => [...encodePoint(point), encodeNumber(point.angle ?? 0)];

function validRobot(robot) {
  return robot && vector(robot.root, 3) && vectors(robot.frames, 3, 20) && robot.frames.length >= 8 &&
    vectors(robot.tail, 2, 24) && vectors(robot.limbs, 6, 12) &&
    vectors(robot.cue, 2, 14) && (robot.bossPhase === null || [1, 2].includes(robot.bossPhase)) &&
    vector(robot.appearance, 9) && Array.isArray(robot.health) && robot.health.length <= 64 &&
    robot.health.every(bounded) && vectors(robot.crit, 2, 64) &&
    typeof robot.action === 'string' && robot.action.length < 80 &&
    (robot.cause === null || typeof robot.cause === 'string' && robot.cause.length < 40) &&
    typeof robot.visible === 'boolean' && typeof robot.unconscious === 'boolean' &&
    bounded(robot.trauma);
}

export function validBattleSnapshot(snapshot, count) {
  return validSequence(snapshot.seq) && bounded(snapshot.time) && snapshot.time >= 0 &&
    bounded(snapshot.elapsed) && snapshot.elapsed >= 0 &&
    typeof snapshot.started === 'boolean' && typeof snapshot.finished === 'boolean' &&
    (snapshot.winner === null || Number.isInteger(snapshot.winner) && snapshot.winner >= 0 && snapshot.winner < count) &&
    Array.isArray(snapshot.robots) && snapshot.robots.length === count && count <= LAN_MAX_FIGHTERS &&
    snapshot.robots.every(validRobot);
}

export function validImpact(event, count) {
  return event && validSequence(event.seq) && Number.isInteger(event.robot) && event.robot >= 0 && event.robot < count &&
    (event.by === null || Number.isInteger(event.by) && event.by >= 0 && event.by < count) &&
    vector(event.point, 2) && bounded(event.time) &&
    typeof event.segment === 'string' && event.segment.length < 40 &&
    typeof event.severed === 'boolean' && Number.isFinite(event.damage);
}

export function validRemains(parts, count) {
  return Array.isArray(parts) && parts.length <= count * 64 && parts.every(part =>
    part && Number.isInteger(part.id) && part.id >= 0 && part.id < count &&
    typeof part.cause === 'string' && part.cause.length < 40 &&
    vector(part.motion, 4) && Array.isArray(part.pieces) && part.pieces.length > 0 && part.pieces.length <= 64 &&
    part.pieces.every(piece => piece && (vector(piece.bone, 3) || vector(piece.bone, 5)) &&
      (piece.skin === null || validRemainsSkin(piece.skin))));
}

function validRemainsSkin(skin) {
  return skin && typeof skin.key === 'string' && /^[a-z0-9_-]{1,40}$/.test(skin.key) &&
    typeof skin.asset === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(skin.asset) &&
    vector(skin.tile, 2) && skin.tile.every(index => Number.isInteger(index) && index >= 0 && index <= 15) &&
    vector(skin.matrix, 6) && Number.isInteger(skin.rarity) && skin.rarity >= 0 && skin.rarity <= 10 &&
    (skin.hat === null || [1, 2, 3, 4].includes(skin.hat));
}

export function validBattleView(view, count) {
  return view && vectors(view.starts, 3, LAN_MAX_FIGHTERS) && view.starts.length === count;
}
