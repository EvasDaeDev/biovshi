import assert from 'node:assert/strict';
import {mkdir, mkdtemp, copyFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import WebSocket from 'ws';
import {startLanServer} from '../scripts/lan-server.mjs';
import {lanMessage} from '../src/lan/protocol.js';
import {createLanRoster, lanTowerCopy} from '../src/lan/characters.js';
import {createFloorCache, LAN_FLOOR_BATCH, queueFloorPatch} from '../src/lan/floor-sync.js';

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
  const server = await startLanServer({dist, port: 0, countdownMs: 50, ...options});
  t.after(() => server.close());
  return server.origin;
}

async function connect(origin, version = build, perMessageDeflate = true) {
  const socket = new WebSocket(origin.replace('http:', 'ws:') + '/lan/ws', {origin, perMessageDeflate});
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
  const {payload: {resumeToken: viewerToken}} = await viewer.next('room.entered');
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
  host.send('match.host-ready', {matchId, view: {starts: Array(3).fill([350, 350, 0])}}, roomId);
  await guest.next('room.state', message => message.payload.phase === 'loading');
  guest.send('match.loaded', {matchId}, roomId);
  const loaded = await host.next('room.state', message => message.payload.phase === 'loading' && message.payload.loaded === 2);
  assert.equal(loaded.payload.loadingTotal, 3);
  viewer.send('match.loaded', {matchId}, roomId);
  await viewer.next('room.state', message => message.payload.phase === 'countdown');
  await viewer.next('room.state', message => message.payload.phase === 'running');
  guest.send('match.finish', {matchId, winner: 1, elapsedSec: 5, reason: 'combat'}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  host.send('match.finish', {matchId: 'obsolete', winner: 2, elapsedSec: 5, reason: 'combat'}, roomId);
  assert.equal((await host.next('error')).payload.code, 'match_mismatch');
  const surviving = {segments: 12, total: 13, hits: 2, taken: 1, hasHead: true, mobile: true};
  const statistics = {strikes: 10, hits: 6, fighters: [
    {...surviving, segments: 6, hasHead: false, mobile: false},
    {...surviving, taken: 4, mobile: false},
    surviving,
  ]};
  const finish = {matchId, winner: 2, elapsedSec: 5.25, reason: 'combat'};
  host.send('match.finish', {...finish, statistics: {...statistics,
    fighters: [surviving, surviving, {...surviving, segments: 99}]}}, roomId);
  assert.equal((await host.next('error')).payload.code, 'invalid_result');
  host.send('match.finish', {...finish, statistics: {...statistics,
    fighters: statistics.fighters.map(fighter => ({...fighter, name: 'Подставное имя'}))}}, roomId);
  const result = await viewer.next('room.state', message => message.payload.phase === 'results');
  assert.deepEqual(result.payload.result, {winner: 2, winnerName: 'ИИ 1 · Быстрый',
    elapsedSec: 5.25, reason: 'combat', statistics});
  assert.deepEqual((await guest.next('room.state', message => message.payload.phase === 'results')).payload.result,
    result.payload.result);
  viewer.socket.close();
  await host.next('room.state', ({payload}) =>
    payload.phase === 'results' && payload.members.some(member => member.role === 'spectator' && !member.connected));
  const resumedViewer = await connect(origin);
  resumedViewer.send('session.resume', {token: viewerToken}, roomId);
  await resumedViewer.next('room.entered');
  assert.deepEqual((await resumedViewer.next('room.state')).payload.result, result.payload.result);
  host.send('room.return', {matchId}, roomId);
  await guest.next('room.state', message => message.payload.phase === 'waiting' && !message.payload.canStart &&
    message.payload.members.length === 3);

  host.send('room.kick', {memberId: guestId}, roomId);
  assert.match((await guest.next('room.left')).payload.reason, /исключил/);
  host.send('room.close', {}, roomId);
  await resumedViewer.next('room.left');
  await late.next('rooms.snapshot', message => message.payload.rooms.length === 0);
});

test('LAN restores the same guest session before expiry and releases an expired slot', async t => {
  const origin = await setup(t, {reconnectMs: 1200});
  const [host, guest] = await Promise.all([connect(origin), connect(origin)]);
  const {roomId, payload: {memberId: hostId}} = await create(host);
  const tower = lanTowerCopy({patient: 0, stats: [5, 3, 4]});
  host.send('room.select', {role: 'player', profile: 'tower', tower}, roomId);
  await host.next('room.state', message => message.payload.members[0].profileSummary?.startsWith('5/3/4 очков'));
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

function battleSnapshot(matchId, seq) {
  const robot = {
    root: [300, 350, 0], frames: Array(12).fill([300, 350, 0]), tail: Array(16).fill([301, 350]), limbs: [],
    appearance: [0, 0, 0, 1, 1, 1, 0, 0, 0], cue: [], bossPhase: null, health: [6, 4], crit: [],
    trauma: 0, cause: null, visible: true, unconscious: false, action: 'патруль',
  };
  return {matchId, seq, time: 2, elapsed: 2, started: true, finished: false,
    winner: null, robots: [robot, robot], impacts: []};
}

test('LAN freezes separate Tower patients for the host and guest, and restores them on reconnect', async t => {
  const origin = await setup(t);
  const [host, guest] = await Promise.all([connect(origin), connect(origin)]);
  const {roomId, payload: {memberId: hostId}} = await create(host, 'columns');
  guest.send('room.join', {playerName: 'Гость', role: 'player'}, roomId);
  const {payload: {memberId: guestId, resumeToken}} = await guest.next('room.entered');
  const hostTower = lanTowerCopy({patient: 1, stats: [4, 3, 3], prosthetics: ['arm-1-lower']});
  const guestCopy = lanTowerCopy({patient: 2, stats: [5, 6, 5],
    surgeries: [{procedure: 'graft_arm', site: 'arm--1-upper'}], graftProsthetics: ['arm--1-graft-lower'],
    mutations: ['optic'], equippedMutations: ['m1'],
    mutationInventory: [{id: 'm1', type: 'optic', rarity: 2, obtainedAt: 6}],
    equippedSegments: ['seg1'],
    segmentInventory: [{id: 'seg1', type: 'servo', site: 'arm-1-lower', rarity: 2},
      {id: 'seg2', type: 'turbo', site: 'leg-1-lower', rarity: 1}],
  });
  assert.ok(hostTower);
  assert.ok(guestCopy);
  assert.deepEqual(guestCopy.segmentInventory.map(item => item.id), ['seg1']);
  host.send('room.select', {role: 'player', profile: 'tower', tower: hostTower}, roomId);
  guest.send('room.select', {role: 'player', profile: 'tower',
    tower: {...guestCopy, equippedSegments: ['seg404']}}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'invalid_patient');
  guest.send('room.select', {role: 'player', profile: 'tower', tower: {...guestCopy, balance: 100},
    profileSummary: 'подставная сводка'}, roomId);
  const waiting = (await host.next('room.state', ({payload}) =>
    payload.members.every(member => member.profile === 'tower'))).payload;
  assert.ok(waiting.members.every(member => !('tower' in member) && member.profileSummary.includes('очков')));

  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', ({payload}) => payload.canStart && payload.members[1]?.ready);
  const revisedGuest = {...guestCopy, stats: [6, 5, 5]};
  guest.send('room.select', {role: 'player', profile: 'tower', tower: revisedGuest}, roomId);
  await host.next('room.state', ({payload}) => !payload.canStart &&
    payload.members[1]?.profileSummary?.startsWith('6/5/5') && !payload.members[1].ready);
  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', ({payload}) => payload.canStart && payload.members[1]?.ready);
  host.send('match.start', {}, roomId);
  const {payload: {matchId, players}} = await host.next('room.state', ({payload}) => payload.phase === 'preparing');
  assert.deepEqual(players.map(player => player.tower), [hostTower, revisedGuest]);
  assert.equal((await guest.next('room.state', ({payload}) => payload.phase === 'preparing')).payload.players, undefined);
  guest.send('room.select', {role: 'player', profile: 'basic'}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'room_locked');

  host.send('match.host-ready', {matchId, view: {
    starts: [[300, 350, 0], [500, 350, 3.14]], players: [],
  }}, roomId);
  const {payload: {view}} = await guest.next('room.state', ({payload}) => payload.phase === 'loading');
  assert.deepEqual(view.players, players);
  const hostRoster = createLanRoster({members: players, ai: []}, hostId);
  const guestRoster = createLanRoster({members: view.players, ai: view.ai}, guestId);
  assert.deepEqual(hostRoster.map(({control, ...fighter}) => fighter),
    guestRoster.map(({control, ...fighter}) => fighter));
  assert.deepEqual(guestRoster.map(fighter => fighter.control), ['remote', 'local']);
  guestRoster[1].stats[0]--;
  assert.deepEqual(view.players[1].tower.stats, revisedGuest.stats);

  guest.send('match.loaded', {matchId}, roomId);
  await guest.next('room.state', ({payload}) => payload.phase === 'running');
  guest.socket.close();
  await host.next('room.state', ({payload}) => payload.members.some(member => member.id === guestId && !member.connected));
  const resumed = await connect(origin);
  resumed.send('session.resume', {token: resumeToken}, roomId);
  assert.equal((await resumed.next('room.entered')).payload.memberId, guestId);
  assert.deepEqual((await resumed.next('room.state')).payload.view.players, players);
  host.send('room.close', {}, roomId);
  await resumed.next('room.left');
});

test('LAN relays only the bound guest input and host snapshots, including a reconnect keyframe', async t => {
  const origin = await setup(t);
  const [host, guest, viewer] = await Promise.all([connect(origin), connect(origin, build, false), connect(origin)]);
  const {roomId} = await create(host);
  guest.send('room.join', {playerName: 'Игрок', role: 'player'}, roomId);
  const {payload: {memberId, resumeToken}} = await guest.next('room.entered');
  viewer.send('room.join', {playerName: 'Наблюдатель', role: 'spectator'}, roomId);
  await viewer.next('room.entered');
  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', message => message.payload.canStart && message.payload.members.length === 3);
  host.send('match.start', {}, roomId);
  const {payload: {matchId}} = await host.next('room.state', message => message.payload.phase === 'preparing');
  const view = {starts: [[300, 350, 0], [400, 350, 3.14]]};
  host.send('match.host-ready', {matchId, view}, roomId);
  await viewer.next('room.state', message => message.payload.view?.players.length === 2);
  guest.send('match.loaded', {matchId}, roomId);
  viewer.send('match.loaded', {matchId}, roomId);
  await viewer.next('room.state', message => message.payload.phase === 'running');

  viewer.send('input', {matchId, seq: 1, x: 1, y: 0}, roomId);
  assert.equal((await viewer.next('error')).payload.code, 'no_control');
  guest.send('input', {matchId, seq: 2, x: 1, y: 0, memberId: 'spoofed'}, roomId);
  const input = await host.next('input');
  assert.deepEqual(input.payload, {matchId, memberId, seq: 2, x: 1, y: 0});
  guest.send('input', {matchId, seq: 1, x: 0, y: 1}, roomId);
  guest.send('input', {matchId, seq: 3, x: 2, y: 1}, roomId);
  guest.send('input', {matchId, seq: 4, x: 0, y: 0}, roomId);
  assert.equal((await host.next('input')).payload.seq, 4);

  const snapshot = battleSnapshot(matchId, 7);
  assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) > 1024);
  assert.equal(guest.socket.extensions, '');
  assert.equal(viewer.socket.extensions, 'permessage-deflate');
  guest.send('state.snapshot', snapshot, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  const remains = {matchId, parts: [{id: 0, cause: 'head', motion: [1, 0, 0, 0], pieces: [{bone: [3, 4, 5], skin: null}]}]};
  host.send('state.remains', remains, roomId);
  host.send('state.snapshot', snapshot, roomId);
  assert.deepEqual((await viewer.next('state.remains')).payload, remains);
  assert.deepEqual((await viewer.next('state.snapshot')).payload, snapshot);
  assert.deepEqual((await guest.next('state.snapshot')).payload, snapshot);

  const floor = {matchId, seq: 2, time: 2,
    add: [[0, 1, 300, 350, 4, 1, 1, 3, 50], [1, 1, 301, 350, 4, 1, 0, 2, 40]],
    remove: [], trails: [[1, [[300, 350, 1]]]]};
  guest.send('state.floor', floor, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  host.send('state.floor', floor, roomId);
  assert.deepEqual((await viewer.next('state.floor')).payload, floor);
  host.send('state.floor', {...floor, seq: 1, add: [], remove: [1]}, roomId);
  host.send('state.floor', {...floor, seq: 3, add: [], remove: [0]}, roomId);
  await viewer.next('state.floor', message => message.payload.seq === 3);

  guest.socket.terminate();
  assert.equal((await host.next('input.reset')).payload.memberId, memberId);
  const resumed = await connect(origin);
  resumed.send('session.resume', {token: resumeToken}, roomId);
  assert.equal((await resumed.next('room.entered')).payload.memberId, memberId);
  assert.deepEqual((await resumed.next('state.remains')).payload, remains);
  const floorKeyframe = (await resumed.next('state.floor')).payload;
  assert.equal(floorKeyframe.reset, true);
  assert.deepEqual(floorKeyframe.add, [floor.add[1]]);
  assert.deepEqual(floorKeyframe.trails, floor.trails);
  assert.deepEqual((await resumed.next('state.snapshot')).payload, snapshot);
  resumed.send('input', {matchId, seq: 0, x: 0, y: 1}, roomId);
  assert.equal((await host.next('input')).payload.seq, 0);
});

test('LAN cancels preparation when an invited viewer never loads the arena', async t => {
  const origin = await setup(t, {loadingMs: 500});
  const [host, viewer] = await Promise.all([connect(origin), connect(origin)]);
  const {roomId} = await create(host);
  viewer.send('room.join', {playerName: 'Зритель', role: 'spectator'}, roomId);
  await viewer.next('room.entered');
  host.send('match.start', {}, roomId);
  const {payload: {matchId}} = await viewer.next('room.state', message => message.payload.phase === 'preparing');
  host.send('match.host-ready', {matchId, view: {starts: [[350, 350, 0]]}}, roomId);
  await viewer.next('room.state', message => message.payload.phase === 'loading');
  const waiting = await viewer.next('room.state', message => message.payload.phase === 'waiting' && message.payload.notice);
  assert.match(waiting.payload.notice, /Истекло время загрузки/);
  assert.equal(waiting.payload.matchId, null);
});

test('a full floor reconnect is chunked and a backgrounded client can combine past changes', () => {
  const cache = createFloorCache();
  const drop = id => [id, 0, 350, 350, 4, 1, 0, 3, 50];
  assert.ok(cache.apply({seq: 0, time: 1, add: Array.from({length: LAN_FLOOR_BATCH}, (_, id) => drop(id)),
    remove: [], trails: []}));
  assert.ok(cache.apply({seq: 1, time: 1, add: [drop(LAN_FLOOR_BATCH)], remove: [], trails: []}));
  const pending = [...cache.keyframes()];
  assert.deepEqual(pending.map(patch => patch.add.length), [LAN_FLOOR_BATCH, 1]);
  assert.equal(pending[0].reset, true);
  for (let time = 2; time < 200; time++) {
    const id = LAN_FLOOR_BATCH + time - 1;
    queueFloorPatch(pending, {time, add: [drop(id)], remove: [id - 1], trails: [[0, [[350, 350, time]]]]});
  }
  assert.equal(pending.length, 24);
  const ids = new Set();
  for (const patch of pending) {
    if (patch.reset) ids.clear();
    for (const id of patch.remove) ids.delete(id);
    for (const [id] of patch.add) ids.add(id);
  }
  assert.deepEqual([...ids], [...Array.from({length: LAN_FLOOR_BATCH}, (_, id) => id), LAN_FLOOR_BATCH + 198]);
});

test('LAN suspends a disconnected host, requires a new keyframe to resume, and aborts after the grace period', async t => {
  const origin = await setup(t, {reconnectMs: 1200, hostHeartbeatMs: 500});
  const [host, guest] = await Promise.all([connect(origin), connect(origin)]);
  const {roomId, payload: {resumeToken}} = await create(host);
  guest.send('room.join', {playerName: 'Игрок', role: 'player'}, roomId);
  await guest.next('room.entered');
  guest.send('room.ready', {ready: true}, roomId);
  await host.next('room.state', message => message.payload.canStart && message.payload.members.length === 2);
  host.send('match.start', {}, roomId);
  const {payload: {matchId}} = await guest.next('room.state', message => message.payload.phase === 'preparing');
  host.send('match.host-ready', {matchId, view: {starts: [[300, 350, 0], [400, 350, 3.14]]}}, roomId);
  await guest.next('room.state', message => message.payload.phase === 'loading');
  guest.send('match.loaded', {matchId}, roomId);
  await guest.next('room.state', message => message.payload.phase === 'running');
  const snapshot = battleSnapshot(matchId, 7);
  host.send('state.snapshot', snapshot, roomId);
  await guest.next('state.snapshot');
  host.socket.terminate();
  await guest.next('room.state', message => message.payload.phase === 'suspended');

  guest.send('match.resume', {matchId, snapshot: battleSnapshot(matchId, 8)}, roomId);
  assert.equal((await guest.next('error')).payload.code, 'host_only');
  const resumed = await connect(origin);
  resumed.send('session.resume', {token: resumeToken}, roomId);
  await resumed.next('room.entered');
  await resumed.next('room.state', message => message.payload.phase === 'suspended');
  resumed.send('match.resume', {matchId, snapshot}, roomId);
  resumed.send('match.resume', {matchId, snapshot: battleSnapshot(matchId, 8)}, roomId);
  assert.equal((await guest.next('state.snapshot')).payload.keyframe, true);
  await guest.next('room.state', message => message.payload.phase === 'running');
  resumed.send('match.heartbeat', {matchId}, roomId);
  assert.equal((await resumed.next('match.heartbeat')).payload.matchId, matchId);

  // The socket still answers WebSocket pings. Only the authoritative browser
  // heartbeat can keep the simulation running.
  await guest.next('room.state', message => message.payload.phase === 'suspended');
  const aborted = await guest.next('room.state', message => message.payload.phase === 'results');
  assert.deepEqual(aborted.payload.result, {winnerName: null, elapsedSec: 2, reason: 'aborted'});
  resumed.send('room.return', {matchId}, roomId);
  const lobby = await guest.next('room.state', message => message.payload.phase === 'waiting' && message.payload.matchId === null);
  assert.equal(lobby.payload.canStart, false);
});
