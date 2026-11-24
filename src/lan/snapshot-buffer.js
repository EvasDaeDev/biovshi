import {smooth, wrap} from '../utils/math.js';
import {LAN_INTERPOLATION_MS, LAN_SNAPSHOT_MS} from './battle-protocol.js';

const MAX_PREDICTION_MS = 80;
const MAX_PREDICTION_DISTANCE = 24;
const CORRECTION_MS = 110;

const interpolate = (a, b, t) => a + (b - a) * t;
const vectors = (a, b, t) => a.length === b.length
  ? a.map((v, i) => v.map((value, j) => interpolate(value, b[i][j], t))) : a;
const frame = (a, b, t) => [interpolate(a[0], b[0], t), interpolate(a[1], b[1], t), a[2] + wrap(b[2] - a[2]) * t];

function sameRig(a, b) {
  return a.visible === b.visible && a.unconscious === b.unconscious && a.cause === b.cause &&
    a.frames.length === b.frames.length && a.health.length === b.health.length &&
    a.health.every((hp, index) => (hp < 0) === (b.health[index] < 0));
}

function interpolateSnapshots(a, b, t) {
  if (a.started !== b.started || a.finished !== b.finished) return a;
  return {
    ...a, time: interpolate(a.time, b.time, t), elapsed: interpolate(a.elapsed, b.elapsed, t),
    robots: a.robots.map((robot, id) => {
      const next = b.robots[id];
      if (!sameRig(robot, next)) return robot;
      return {...robot, root: frame(robot.root, next.root, t),
        frames: robot.frames.map((bone, index) => frame(bone, next.frames[index], t)),
        limbs: vectors(robot.limbs, next.limbs, t),
        tail: vectors(robot.tail, next.tail, t),
        appearance: robot.appearance.map((value, index) => interpolate(value, next.appearance[index], t)),
      };
    }),
  };
}

function translatePose(robot, dx, dy) {
  if (!dx && !dy) return robot;
  const pair = ([x, y, ...rest]) => [x + dx, y + dy, ...rest];
  return {...robot, observedRoot: robot.observedRoot ?? robot.root,
    root: pair(robot.root), frames: robot.frames.map(pair), tail: robot.tail.map(pair),
    limbs: robot.limbs.map(limb => limb.map((value, index) => value + (index % 2 ? dy : dx))),
  };
}

function predict(previous, latest, extra) {
  if (!previous || extra <= 0 || !latest.started || latest.finished || !previous.started || previous.finished) return latest;
  const elapsed = (latest.time - previous.time) * 1000;
  if (elapsed <= 0 || elapsed > 3 * LAN_SNAPSHOT_MS) return latest;
  const t = Math.min(extra, MAX_PREDICTION_MS) / elapsed;
  let moved = false;
  const robots = latest.robots.map((robot, id) => {
    const old = previous.robots[id];
    if (!robot.visible || robot.unconscious || robot.cause !== null || !sameRig(old, robot)) return robot;
    const dx = (robot.root[0] - old.root[0]) * t, dy = (robot.root[1] - old.root[1]) * t;
    const limit = Math.min(1, MAX_PREDICTION_DISTANCE / (Math.hypot(dx, dy) || 1));
    moved ||= Boolean(dx || dy);
    return translatePose(robot, dx * limit, dy * limit);
  });
  return moved ? {...latest, robots} : latest;
}

export function createSnapshotBuffer() {
  const frames = [];
  let sequence = -1, previous, lastSample, predictedSequence, correction;
  return {
    push(snapshot, received) {
      if (snapshot.seq <= sequence) return false;
      sequence = snapshot.seq;
      frames.push({snapshot, received});
      if (frames.length > 12) previous = frames.shift();
      return true;
    },
    sample(now) {
      const target = now - LAN_INTERPOLATION_MS;
      while (frames.length > 1 && frames[1].received <= target) previous = frames.shift();
      const [left, right] = frames;
      if (!left) return;
      let sample = left.snapshot;
      if (right && target > left.received) {
        sample = interpolateSnapshots(left.snapshot, right.snapshot,
          (target - left.received) / Math.max(1, right.received - left.received));
      } else if (!right) {
        sample = predict(previous?.snapshot, left.snapshot, target - left.received);
      }

      if (sample.finished) {
        predictedSequence = correction = undefined;
      } else if (predictedSequence !== undefined && sequence !== predictedSequence) {
        // Start at the pose already shown, then fade the difference from the new samples.
        correction = {start: now, from: lastSample, base: sample};
        predictedSequence = undefined;
      }
      if (sample.robots.some(robot => robot.observedRoot)) predictedSequence = sequence;

      if (correction) {
        const blend = 1 - smooth((now - correction.start) / CORRECTION_MS);
        if (blend <= 0) correction = undefined;
        else {
          const {from, base} = correction;
          sample = {...sample, robots: sample.robots.map((robot, id) => {
            const a = from.robots[id], b = base.robots[id];
            if (!sameRig(a, robot) || !sameRig(b, robot)) return robot;
            return translatePose(robot, (a.root[0] - b.root[0]) * blend, (a.root[1] - b.root[1]) * blend);
          })};
        }
      }
      lastSample = sample;
      return sample;
    },
    clear() {
      frames.length = 0;
      sequence = -1;
      previous = lastSample = predictedSequence = correction = undefined;
    },
  };
}
