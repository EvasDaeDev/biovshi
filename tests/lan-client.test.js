import assert from 'node:assert/strict';
import test from 'node:test';
import {createLanClient} from '../src/lan/client.js';
import {lanMessage, LAN_RECONNECT_MS, LAN_SERVER_PULSE_MS} from '../src/lan/protocol.js';

const setup = t => {
  t.mock.timers.enable({apis: ['setTimeout', 'Date']});
  const original = {WebSocket: globalThis.WebSocket, location: globalThis.location};
  t.after(() => Object.assign(globalThis, original));
  const sockets = [];
  globalThis.location = new URL('http://127.0.0.1:8080/');
  globalThis.WebSocket = class extends EventTarget {
    constructor() { super(); sockets.push(this); }
    close() { this.dispatchEvent(new Event('close')); }
    receive(type, payload) {
      this.dispatchEvent(new MessageEvent('message', {data: JSON.stringify(lanMessage(type, payload))}));
    }
  };
  const events = [];
  const client = createLanClient(event => events.push(event));
  t.after(() => client.close());
  return {client, sockets, events, tick: ms => t.mock.timers.tick(ms)};
};

test('LAN connection times out and can be restarted manually', t => {
  const {client, sockets, events, tick} = setup(t);
  client.open();
  for (let ms = 0; ms < LAN_RECONNECT_MS; ms += 100) tick(100);
  assert.deepEqual(events.map(event => event.type), ['connection.failed']);
  const attempts = sockets.length;
  tick(LAN_RECONNECT_MS);
  assert.equal(sockets.length, attempts);
  client.open();
  assert.equal(sockets.length, attempts + 1);
  sockets.at(-1).receive('hello');
  assert.equal(events.at(-1).type, 'hello');
  sockets[0].receive('hello');
  assert.equal(events.length, 2);
});

test('LAN connection notices silence and recovers when a server answers', t => {
  const {client, sockets, events, tick} = setup(t);
  client.open();
  sockets[0].receive('hello');
  for (let i = 0; i < 4; i++) {
    tick(LAN_SERVER_PULSE_MS);
    sockets[0].receive('server.pulse');
  }
  assert.deepEqual(events.map(event => event.type), ['hello']);
  tick(LAN_SERVER_PULSE_MS * 2 + 1000);
  assert.equal(events.at(-1).type, 'disconnected');
  tick(700);
  sockets[1].receive('hello');
  tick(LAN_SERVER_PULSE_MS);
  assert.deepEqual(events.map(event => event.type), ['hello', 'disconnected', 'hello']);
});

test('LAN preserves an explicit handshake rejection', t => {
  const {client, sockets, events, tick} = setup(t);
  client.open();
  const payload = {code: 'build_mismatch', message: 'Обновите страницу.'};
  sockets[0].receive('error', payload);
  tick(LAN_RECONNECT_MS);
  assert.deepEqual(events, [{type: 'connection.failed', payload}]);
  assert.equal(sockets.length, 1);
});
