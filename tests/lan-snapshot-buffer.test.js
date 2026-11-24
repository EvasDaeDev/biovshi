import assert from 'node:assert/strict';
import test from 'node:test';
import {createSnapshotBuffer} from '../src/lan/snapshot-buffer.js';
import {LAN_INTERPOLATION_MS} from '../src/lan/battle-protocol.js';

const snapshot = (seq, time, x, extras = {}) => ({
  seq, time, elapsed: time, started: true, finished: false,
  robots: [{root: [x, 50, 0], visible: true, unconscious: false, cause: null,
    health: [6], frames: [[x + 5, 50, 0]], tail: [[x - 5, 50]],
    limbs: [[x, 50, x, 60, x, 70]], appearance: [0, 0], ...extras}],
});

test('LAN buffer extrapolates translation for at most 80 ms and keeps the last known time', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(0, 0, 100), 0);
  const latest = snapshot(1, .05, 110);
  buffer.push(latest, 50);
  const stalled = buffer.sample(50 + LAN_INTERPOLATION_MS + 100);
  const [view] = stalled.robots;
  assert.equal(stalled.time, .05);
  assert.equal(stalled.elapsed, .05);
  assert.deepEqual(view.root, [126, 50, 0]);
  assert.deepEqual(view.observedRoot, [110, 50, 0]);
  assert.deepEqual(view.frames, [[131, 50, 0]]);
  assert.deepEqual(view.tail, [[121, 50]]);
  assert.deepEqual(view.limbs, [[126, 50, 126, 60, 126, 70]]);
  assert.equal(buffer.sample(2000).robots[0].root[0], 126);
  assert.deepEqual(latest.robots[0].root, [110, 50, 0]);
});

test('LAN buffer caps the prediction distance and corrects smoothly when fresh data arrives', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(0, 0, 100), 0);
  buffer.push(snapshot(1, .05, 140), 50);
  assert.equal(buffer.sample(230).robots[0].root[0], 164);
  buffer.push(snapshot(2, .10, 142), 240);
  assert.equal(buffer.sample(240).robots[0].root[0], 164);
  const correcting = buffer.sample(295).robots[0].root[0];
  assert.ok(correcting < 164 && correcting > 142);
  assert.equal(buffer.sample(350).robots[0].root[0], 142 + 2 * .2);
});

test('LAN buffer cannot predict damage or continue through a discontinuity or a keyframe', () => {
  const buffer = createSnapshotBuffer();
  buffer.push(snapshot(0, 0, 100), 0);
  buffer.push(snapshot(1, .05, 110), 50);
  assert.ok(buffer.sample(220).robots[0].root[0] > 110);
  buffer.push(snapshot(2, .10, 113, {health: [-1], unconscious: true}), 230);
  const down = buffer.sample(340).robots[0];
  assert.deepEqual(down.root, [113, 50, 0]);
  assert.deepEqual(down.health, [-1]);
  buffer.clear();
  buffer.push(snapshot(0, .10, 75), 350);
  assert.equal(buffer.sample(600).robots[0].root[0], 75);
});
