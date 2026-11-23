import {CONFIG} from '../config.js';
import {LAN_MAX_FIGHTERS} from './protocol.js';
import {encodeNumber, validSequence} from './battle-protocol.js';

export const LAN_FLOOR_INTERVAL_MS = 200;
export const LAN_FLOOR_BATCH = 128;
const finite = value => Number.isFinite(value) && Math.abs(value) <= 10_000_000;
const fighterId = (value, count) => Number.isInteger(value) && value >= 0 && value < count;

export function validFloorPatch(patch, count) {
  return count <= LAN_MAX_FIGHTERS && validSequence(patch.seq) && finite(patch.time) && patch.time >= 0 &&
    Array.isArray(patch.add) && patch.add.length <= LAN_FLOOR_BATCH && patch.add.every(drop =>
      Array.isArray(drop) && drop.length === 9 && drop.every(finite) && validSequence(drop[0]) &&
      fighterId(drop[1], count) && drop[4] > 0 && drop[5] >= 0 && drop[5] <= patch.time &&
      (drop[6] === 0 || drop[6] === 1) && Number.isInteger(drop[7]) && drop[7] >= 0 &&
      drop[7] < CONFIG.oil.spriteColumns * CONFIG.oil.spriteRows && drop[8] >= 0 && drop[8] <= 360) &&
    Array.isArray(patch.remove) && patch.remove.length <= LAN_FLOOR_BATCH && patch.remove.every(validSequence) &&
    Array.isArray(patch.trails) && patch.trails.length <= count && patch.trails.every(trail =>
      Array.isArray(trail) && trail.length === 2 && fighterId(trail[0], count) &&
      Array.isArray(trail[1]) && trail[1].length <= CONFIG.trails.limit &&
      trail[1].every(point => Array.isArray(point) && point.length === 3 &&
        point.every(finite) && point[2] >= 0 && point[2] <= patch.time));
}

function encodeDrop(id, drop) {
  return [id, drop.robot, drop.x, drop.y, drop.baseRadius, drop.born, Number(drop.fluid === 'coolant'),
    drop.variant.index, drop.variant.angle].map(encodeNumber);
}

export function createFloorPublisher() {
  const ids = new WeakMap(), sent = new Set(), trails = new Map();
  let nextId = 0, seq = 0, nextAt = 0;

  return (now, gameTime, drops, robots, send, force = false) => {
    if ((!force && now < nextAt) || !send) return;
    nextAt = now + LAN_FLOOR_INTERVAL_MS;
    const current = new Map();
    for (const drop of drops) {
      if (!ids.has(drop)) ids.set(drop, nextId++);
      current.set(ids.get(drop), drop);
    }
    const remove = [...sent].filter(id => !current.has(id)).slice(0, LAN_FLOOR_BATCH);
    const add = [];
    // Keep the cached set within the renderer's per-round limit even if a
    // graphics setting removes a large batch of drops in one frame.
    const free = Math.min(LAN_FLOOR_BATCH, CONFIG.oil.limit - sent.size + remove.length);
    for (const [id, drop] of current) {
      if (add.length >= free) break;
      if (!sent.has(id)) add.push(encodeDrop(id, drop));
    }
    const changed = robots.filter(robot => {
      const trail = robot.trail;
      const previous = trails.get(robot.id);
      return trail.length !== (previous?.length ?? 0) || trail.at(-1) !== previous?.last;
    });
    if (!add.length && !remove.length && !changed.length) return;
    const patch = {
      seq, time: encodeNumber(gameTime), add, remove,
      trails: changed.map(robot => [robot.id, robot.trail.map(({x, y, time}) => [x, y, time].map(encodeNumber))]),
    };
    if (!send(patch)) return;
    seq++;
    for (const id of remove) sent.delete(id);
    for (const [id] of add) sent.add(id);
    for (const robot of changed) trails.set(robot.id, {length: robot.trail.length, last: robot.trail.at(-1)});
  };
}

// A full floor on reconnect is sent in bounded chunks. Live updates use deltas.
export function createFloorCache() {
  const drops = new Map(), trails = new Map();
  let seq = -1, time = 0;
  return {
    apply(patch) {
      if (patch.seq <= seq || patch.time < time) return false;
      const removed = new Set(patch.remove);
      const added = new Set(patch.add.map(([id]) => id));
      if (added.size !== patch.add.length || [...added].some(id => drops.has(id)) ||
          drops.size - [...removed].filter(id => drops.has(id)).length + added.size > CONFIG.oil.limit) return false;
      for (const id of removed) drops.delete(id);
      for (const drop of patch.add) drops.set(drop[0], drop);
      for (const trail of patch.trails) trails.set(trail[0], trail);
      seq = patch.seq;
      time = patch.time;
      return true;
    },
    *keyframes() {
      const floor = [...drops.values()];
      yield {reset: true, time, add: floor.slice(0, LAN_FLOOR_BATCH), remove: [], trails: [...trails.values()]};
      for (let offset = LAN_FLOOR_BATCH; offset < floor.length; offset += LAN_FLOOR_BATCH)
        yield {time, add: floor.slice(offset, offset + LAN_FLOOR_BATCH), remove: [], trails: []};
    },
  };
}

// A backgrounded viewer may accumulate updates while the renderer is idle.
// Fold the oldest changes so the queue preserves the current floor in bounded memory.
export function queueFloorPatch(pending, patch) {
  if (patch.reset) pending.length = 0;
  pending.push(patch);
  if (pending.length <= 24) return;
  const [first, next] = pending;
  const drops = new Map(first.add.map(drop => [drop[0], drop]));
  const removed = new Set(first.remove);
  for (const id of next.remove) if (!drops.delete(id) && !first.reset) removed.add(id);
  for (const drop of next.add) drops.set(drop[0], drop);
  pending.splice(0, 2, {
    time: next.time, reset: first.reset, add: [...drops.values()], remove: [...removed],
    trails: [...new Map([...first.trails, ...next.trails])],
  });
}
