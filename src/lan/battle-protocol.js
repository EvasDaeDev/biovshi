import {LAN_MAX_FIGHTERS} from './protocol.js';

export const LAN_FRAME_BYTES = 96 * 1024;
export const LAN_SNAPSHOT_MS = 1000 / 15;
export const LAN_INPUT_MS = 50;
export const LAN_INPUT_TIMEOUT_MS = 350;
export const LAN_INTERPOLATION_MS = 100;
export const LAN_BATTLE_EVENT_BATCH = 64;

export const validSequence = value => Number.isSafeInteger(value) && value >= 0;
const bounded = value => Number.isFinite(value) && Math.abs(value) <= 10_000_000;
const vector = (value, size) => Array.isArray(value) && value.length === size && value.every(bounded);
const vectors = (value, size, limit) => Array.isArray(value) && value.length <= limit &&
  value.every(item => vector(item, size));

export function validMovement({x, y, goal, seq}) {
  return validSequence(seq) && (goal === undefined
    ? Number.isFinite(x) && Number.isFinite(y) && Math.hypot(x, y) <= 1.001
    : x === undefined && y === undefined && vector(goal, 2));
}

export const encodeNumber = value => Math.round(value * 1000) / 1000;
export const encodePoint = point => [encodeNumber(point.x), encodeNumber(point.y)];
export const encodeFrame = point => [...encodePoint(point), encodeNumber(point.angle ?? 0)];

function validRobot(robot) {
  return robot && vector(robot.root, 3) && vectors(robot.frames, 3, 20) && robot.frames.length >= 8 &&
    vectors(robot.tail, 2, 24) && vectors(robot.limbs, 6, 12) &&
    vectors(robot.cue, 2, 14) && (robot.bossPhase === null || [1, 2].includes(robot.bossPhase)) &&
    (robot.destination === undefined || vector(robot.destination, 2) || vector(robot.destination, 4)) &&
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

export function validBattleEvent(event, count) {
  if (!event || !validSequence(event.seq) || !bounded(event.time) || event.time < 0) return false;
  const fighter = id => Number.isInteger(id) && id >= 0 && id < count;
  const part = key => typeof key === 'string' && key.length > 0 && key.length < 40;
  switch (event.type) {
    case 'hit':
    case 'segment-broken':
      return fighter(event.robot) && (event.by === null || fighter(event.by)) &&
        vector(event.point, 2) && part(event.segment) && bounded(event.damage) && event.damage >= 0;
    case 'combat-windup':
    case 'combat-miss':
    case 'combat-strike':
      return fighter(event.from) && fighter(event.to) && part(event.source) &&
        (event.type !== 'combat-strike' || part(event.segment));
    case 'pounce-launch':
      return fighter(event.robot) && bounded(event.heading);
    case 'boss-charge':
      return fighter(event.robot) && vector(event.goal, 2);
    case 'boss-phase':
      return fighter(event.robot) && event.phase === 2;
    case 'robot-immobilized':
      return fighter(event.robot) && ['погиб', 'потерял сознание', 'потерял конечности'].includes(event.reason) &&
        (event.knockoutCause === null || ['blood-loss', 'trauma', 'limb-loss'].includes(event.knockoutCause));
    case 'combat-end':
      return event.winner === null ? ['draw', 'manual'].includes(event.outcome) :
        fighter(event.winner) && event.outcome === 'victory';
    default:
      return false;
  }
}

export function validBattleEvents(events, count, after) {
  return Array.isArray(events) && events.length <= LAN_BATTLE_EVENT_BATCH &&
    events.every((event, i) => validBattleEvent(event, count) && event.seq > (i ? events[i - 1].seq : after));
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

export function readBattleStatistics(statistics, count) {
  if (!statistics) return null;
  const {strikes, hits, fighters} = statistics;
  if (!validSequence(strikes) || !validSequence(hits) ||
      !Array.isArray(fighters) || fighters.length !== count) return null;
  if (!fighters.every(fighter => fighter &&
    validSequence(fighter.total) && fighter.total > 0 && fighter.total <= 64 &&
    validSequence(fighter.segments) && fighter.segments <= fighter.total &&
    validSequence(fighter.hits) && validSequence(fighter.taken) &&
    typeof fighter.hasHead === 'boolean' && typeof fighter.mobile === 'boolean')) return null;
  return {strikes, hits, fighters: fighters.map(({segments, total, hits, taken, hasHead, mobile}) =>
    ({segments, total, hits, taken, hasHead, mobile}))};
}
