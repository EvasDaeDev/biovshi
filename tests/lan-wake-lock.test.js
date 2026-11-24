import assert from 'node:assert/strict';
import test from 'node:test';
import {createLanWakeLock} from '../src/lan/wake-lock.js';

function setup(request) {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.defaultView = {navigator: {wakeLock: request ? {request} : undefined}};
  const statuses = [];
  const controller = createLanWakeLock(doc, status => statuses.push(status));
  function visibility(hidden) {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event('visibilitychange'));
  }
  return {controller, statuses, visibility};
}

class Sentinel extends EventTarget {
  released = false;
  async release() {
    this.released = true;
    this.dispatchEvent(new Event('release'));
  }
}

test('LAN host holds the screen only while in the room and visible', async () => {
  const locks = [];
  const {controller, statuses, visibility} = setup(async type => {
    assert.equal(type, 'screen');
    const lock = new Sentinel();
    locks.push(lock);
    return lock;
  });
  visibility(false);
  assert.equal(locks.length, 0);
  controller.setEnabled(true);
  controller.setEnabled(true);
  await Promise.resolve();
  assert.deepEqual(statuses, ['requesting', 'active']);
  visibility(true);
  assert.equal(locks[0].released, true);
  assert.equal(statuses.at(-1), 'hidden');
  visibility(false);
  await Promise.resolve();
  assert.equal(locks.length, 2);
  assert.equal(statuses.at(-1), 'active');
  await locks[1].release();
  assert.equal(statuses.at(-1), 'released');
  visibility(true);
  visibility(false);
  await Promise.resolve();
  controller.setEnabled(false);
  assert.equal(locks[2].released, true);
  assert.equal(statuses.at(-1), null);
  visibility(false);
  assert.equal(locks.length, 3);
});

test('LAN discards a grant that arrives after the host leaves', async () => {
  let grant;
  const {controller, statuses} = setup(() => new Promise(resolve => { grant = resolve; }));
  controller.setEnabled(true);
  controller.setEnabled(false);
  const lock = new Sentinel();
  grant(lock);
  await Promise.resolve();
  assert.equal(lock.released, true);
  assert.deepEqual(statuses, ['requesting', null]);
});

test('LAN distinguishes an absent API from a rejected request and retries on return', async () => {
  const unavailable = setup();
  unavailable.controller.setEnabled(true);
  assert.deepEqual(unavailable.statuses, ['unavailable']);

  let requests = 0;
  const refused = setup(async () => {
    if (++requests === 1) throw new Error('denied');
    return new Sentinel();
  });
  refused.controller.setEnabled(true);
  await Promise.resolve();
  assert.equal(refused.statuses.at(-1), 'denied');
  refused.visibility(true);
  refused.visibility(false);
  await Promise.resolve();
  assert.equal(refused.statuses.at(-1), 'active');
});
