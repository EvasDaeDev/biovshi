import assert from 'node:assert/strict';
import {mkdir, mkdtemp, copyFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import {startLanServer} from '../scripts/lan-server.mjs';
import {lanMessage} from '../src/lan/protocol.js';

const build = 'test-build';
async function setup(t, options) {
  const dist = await mkdtemp(path.join(tmpdir(), 'biovshi-lan-'));
  t.after(() => rm(dist, {recursive: true, force: true}));
  await mkdir(path.join(dist, 'locations'));
  await Promise.all([
    writeFile(path.join(dist, 'index.html'), "<html><head><meta content=\"connect-src 'self'\"></head></html>"),
    writeFile(path.join(dist, 'build-info.json'), JSON.stringify({sourceCommit: build})),
    ...['active', 'ward', 'ring', 'annulus', 'sluice', 'zigzag', 'columns', 'maze', 'throat'].map(id =>
      copyFile(new URL('../public/locations/' + id + '.json', import.meta.url), path.join(dist, 'locations', id + '.json'))),
  ]);
  const server = await startLanServer({dist, port: 0, ...options});
  t.after(() => server.close());
  return server.origin;
}

async function connect(origin, version = build) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/lan/ws', {origin});
  const pending = [];
  let wake;
  socket.on('message', data => {
    pending.push(JSON.parse(data.toString()));
    wake?.();
  });
  await new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
  function send(type, payload, roomId) {
    socket.send(JSON.stringify(lanMessage(type, payload, roomId)));
  }
  async function next(type, predicate = () => true) {
    const timeout = AbortSignal.timeout(3000);
    for (;;) {
      const index = pending.findIndex(message => message.type === type && predicate(message));
      if (index >= 0) return pending.splice(index, 1)[0];
      await new Promise((resolve, reject) => {
        const abort = () => reject(Error('Timed out awaiting ' + type + ' after ' +
          JSON.stringify(pending.map(item => item.type))));
        timeout.addEventListener('abort', abort, {once: true});
        wake = () => {
          timeout.removeEventListener('abort', abort);
          resolve();
        };
      });
    }
  }
  send('hello', {build: version});
  return {send, next, socket};
}

async function create(host, arenaId = 'ring') {
  host.send('room.create', {name: 'Арена', playerName: 'Хозяин', arenaId});
  return host.next('room.entered');
}

test('LAN serves the game, current locations and local QR codes', async t => {
  const origin = await setup(t);
  const page = await fetch(origin + '/?room=1234');
  assert.match(await page.text(), /name="biovshi-lan"/);
  const qr = await fetch(origin + '/lan/qr.png');
  assert.equal(qr.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  assert.equal((await fetch(origin + '/lan/qr.png?room=FEAA')).status, 404);

  const client = await connect(origin);
  const hello = await client.next('hello');
  assert.ok(hello.payload.arenas.some(arena => arena.id === 'maze' && arena.capacity === 10));
  const {roomId} = await create(client);
  assert.equal((await fetch(origin + '/lan/qr.png?room=' + roomId)).status, 200);

  const obsolete = await connect(origin, 'obsolete');
  assert.equal((await obsolete.next('error')).payload.code, 'build_mismatch');
  obsolete.send('rooms.list');
  assert.equal((await obsolete.next('error')).payload.code, 'hello_required');
});

test('LAN synchronizes rooms, slot limits, roles and the host-only start', async t => {
  const origin = await setup(t);
  const [host, guest, viewer, late] = await Promise.all(Array.from({length: 4}, () => connect(origin)));
  await Promise.all([host, guest, viewer, late].map(client => client.next('hello')));
  const {roomId} = await create(host);
  await guest.next('rooms.snapshot', message => message.payload.rooms.some(room => room.id === roomId));
  guest.send('room.join', {playerName: 'Игрок', role: 'player'}, roomId);
  const {payload: {memberId: guestId}} = await guest.next('room.entered');
  await host.next('room.state', message => message.payload.members.some(member => member.id === guestId));
  guest.send('match.start', {}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  host.send('match.start', {}, roomId);
  assert.equal((await host.next('error')).payload.code, 'not_ready');

  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', message => message.payload.canStart);
  host.send('room.configure', {name: 'Новая арена', arenaId: 'ring', slots: 4, ai: []}, roomId);
  assert.equal((await host.next('error')).payload.code, 'invalid_slots');
  host.send('room.configure', {name: 'Новая арена', arenaId: 'ring', slots: 3, ai: ['fast']}, roomId);
  await guest.next('room.state', message => message.payload.fighters === 3 && !message.payload.canStart);
  late.send('room.join', {playerName: 'Лишний боец', role: 'player'}, roomId);
  assert.equal((await late.next('error')).payload.code, 'slots_full');

  viewer.send('room.join', {playerName: 'Зритель', role: 'spectator'}, roomId);
  await viewer.next('room.entered');
  viewer.send('room.ready', {ready: true}, roomId);
  assert.equal((await viewer.next('error')).payload.code, 'invalid_ready');
  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', message => message.payload.canStart && message.payload.spectators === 1);
  host.send('match.start', {}, roomId);
  const {payload: {matchId}} = await viewer.next('room.state', message => message.payload.phase === 'preparing');
  late.send('room.join', {playerName: 'Поздний зритель', role: 'spectator'}, roomId);
  assert.equal((await late.next('error')).payload.code, 'room_unavailable');
  guest.send('match.host-ready', {matchId}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  host.send('match.host-ready', {matchId}, roomId);
  await viewer.next('room.state', message => message.payload.phase === 'running');
  guest.send('match.finish', {matchId, winner: 1, elapsedSec: 5, reason: 'combat'}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  host.send('match.finish', {matchId: 'obsolete', winner: 2, elapsedSec: 5, reason: 'combat'}, roomId);
  assert.equal((await host.next('error')).payload.code, 'match_mismatch');
  host.send('match.finish', {matchId, winner: 2, elapsedSec: 5.25, reason: 'combat'}, roomId);
  const result = await viewer.next('room.state', message => message.payload.phase === 'results');
  assert.deepEqual(result.payload.result, {winnerName: 'ИИ 1 · Быстрый', elapsedSec: 5.25, reason: 'combat'});
  host.send('room.return', {matchId}, roomId);
  await guest.next('room.state', message => message.payload.phase === 'waiting' && !message.payload.canStart &&
    message.payload.members.length === 3);

  host.send('room.kick', {memberId: guestId}, roomId);
  assert.match((await guest.next('room.left')).payload.reason, /исключил/);
  host.send('room.close', {}, roomId);
  await viewer.next('room.left');
  await late.next('rooms.snapshot', message => message.payload.rooms.length === 0);
});

test('LAN restores the same guest session before expiry and releases an expired slot', async t => {
  const origin = await setup(t, {reconnectMs: 1200});
  const [host, guest] = await Promise.all([connect(origin), connect(origin)]);
  const {roomId, payload: {memberId: hostId}} = await create(host);
  host.send('room.select', {role: 'player', profile: 'tower', profileSummary: '5/3/4 очков'}, roomId);
  await host.next('room.state', message => message.payload.members[0].profileSummary === '5/3/4 очков');
  host.send('room.select', {role: 'spectator', profile: 'basic'}, roomId);
  await host.next('room.state', message => message.payload.fighters === 0);
  host.send('match.start', {}, roomId);
  assert.equal((await host.next('error')).payload.code, 'not_ready');
  guest.send('room.join', {playerName: 'Гость', role: 'player'}, roomId);
  const {payload: {memberId, resumeToken}} = await guest.next('room.entered');
  guest.send('room.select', {role: 'player', profile: 'strong'}, roomId);
  await host.next('room.state', message => message.payload.members.some(member => member.profile === 'strong'));
  guest.socket.terminate();
  await host.next('room.state', message => message.payload.members.some(member => member.id === memberId && !member.connected));

  const resumed = await connect(origin);
  assert.ok((await resumed.next('hello')).payload);
  resumed.send('session.resume', {token: resumeToken}, roomId);
  assert.equal((await resumed.next('room.entered')).payload.memberId, memberId);
  const restored = await resumed.next('room.state');
  assert.equal(restored.payload.members.find(member => member.id === memberId).profile, 'strong');
  resumed.socket.terminate();
  await host.next('room.state', message => message.payload.members.length === 1 &&
    message.payload.members[0].id === hostId && message.payload.members[0].role === 'spectator');

  const expired = await connect(origin);
  expired.send('session.resume', {token: resumeToken}, roomId);
  assert.equal((await expired.next('error')).payload.code, 'resume_failed');
  host.send('room.configure', {name: 'Арена', arenaId: 'ring', slots: 1, ai: ['basic']}, roomId);
  await host.next('room.state', message => message.payload.canStart);
  host.send('match.start', {}, roomId);
  await host.next('room.state', message => message.payload.phase === 'preparing');
});
