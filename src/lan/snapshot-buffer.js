import {wrap} from '../utils/math.js';
import {LAN_INTERPOLATION_MS} from './battle-protocol.js';

const interpolate = (a, b, t) => a + (b - a) * t;
const vectors = (a, b, t) => a.length === b.length
  ? a.map((v, i) => v.map((value, j) => interpolate(value, b[i][j], t))) : a;
const frame = (a, b, t) => [interpolate(a[0], b[0], t), interpolate(a[1], b[1], t), a[2] + wrap(b[2] - a[2]) * t];

export function createSnapshotBuffer() {
  const frames = [];
  let sequence = -1;
  return {
    push(snapshot, received) {
      if (snapshot.seq <= sequence) return false;
      sequence = snapshot.seq;
      frames.push({snapshot, received});
      if (frames.length > 12) frames.shift();
      return true;
    },
    sample(now) {
      const target = now - LAN_INTERPOLATION_MS;
      while (frames.length > 1 && frames[1].received <= target) frames.shift();
      const [left, right] = frames;
      if (!left || !right || target <= left.received) return left?.snapshot;
      const a = left.snapshot, b = right.snapshot;
      if (a.started !== b.started || a.finished !== b.finished) return a;
      const t = (target - left.received) / Math.max(1, right.received - left.received);
      return {
        ...a, time: interpolate(a.time, b.time, t), elapsed: interpolate(a.elapsed, b.elapsed, t),
        robots: a.robots.map((robot, id) => {
          const next = b.robots[id];
          if (robot.visible !== next.visible || robot.frames.length !== next.frames.length ||
              robot.health.length !== next.health.length || robot.health.some((hp, index) => (hp < 0) !== (next.health[index] < 0)))
            return robot;
          return {...robot, root: frame(robot.root, next.root, t),
            frames: robot.frames.map((bone, index) => frame(bone, next.frames[index], t)),
            limbs: vectors(robot.limbs, next.limbs, t),
            tail: vectors(robot.tail, next.tail, t),
            appearance: robot.appearance.map((value, index) => interpolate(value, next.appearance[index], t)),
          };
        }),
      };
    },
    clear() { frames.length = 0; sequence = -1; },
  };
}
