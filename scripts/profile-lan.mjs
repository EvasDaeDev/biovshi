// Measure JSON payloads and WebSocket traffic over loopback while the arena runs
// in a headless DOM. GPU rendering and Wi-Fi latency are outside this benchmark.
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {connect as connectTcp} from 'node:net';
import {setImmediate as yieldIo, setTimeout as delay} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import {JSDOM} from 'jsdom';
import WebSocket from 'ws';
import {startLanServer} from '../server/lan-server.mjs';
import {initializeGame} from '../src/game/initialize.js';
import {step} from '../src/game/loop.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
import {createLanRoster} from '../src/lan/characters.js';
import {installLanHostArena} from '../src/lan/host-arena.js';
import {lanMessage} from '../src/lan/protocol.js';
import {paint} from '../src/render/frame.js';

const {values} = parseArgs({options: {
  seconds: {type: 'string', default: '8'},
  viewers: {type: 'string', default: '4'},
  'no-compression': {type: 'boolean'},
}});
const seconds = Number(values.seconds), viewerCount = Number(values.viewers);
if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60 ||
    !Number.isInteger(viewerCount) || viewerCount < 1 || viewerCount > 16)
  throw Error('Supply --seconds 1–60 and --viewers 1–16.');

const root = new URL('../', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const build = JSON.parse(await readFile(new URL('dist/build-info.json', root), 'utf8')).sourceCommit;
const compression = !values['no-compression'];
const server = await startLanServer({port: 0, countdownMs: 1, hostHeartbeatMs: 120_000, compression});
const percentile = (samples, fraction) => {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
};
const rounded = value => Number(value.toFixed(2));

async function waitFor(predicate) {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    const result = predicate();
    if (result) return result;
    await delay(5);
  }
  throw Error('Timed out waiting for the LAN benchmark room.');
}

async function connect() {
  let tcp;
  const socket = new WebSocket(server.origin.replace('http:', 'ws:') + '/lan/ws', {
    origin: server.origin,
    createConnection(options) {
      tcp = connectTcp({host: options.host, port: options.port});
      return tcp;
    },
  });
  const client = {socket, room: null, stats: {packets: 0, snapshots: [], floor: 0, total: 0},
    bytesRead: () => tcp.bytesRead};
  socket.on('message', bytes => {
    const {type, payload} = JSON.parse(bytes.toString());
    if (type === 'room.state') client.room = payload;
    if (!type.startsWith('state.')) return;
    client.stats.packets++;
    client.stats.total += bytes.length;
    if (type === 'state.floor') client.stats.floor += bytes.length;
    if (type === 'state.snapshot') client.stats.snapshots.push(bytes.length);
  });
  await once(socket, 'open');
  client.send = (type, payload, room = null) => socket.send(JSON.stringify(lanMessage(type, payload, room)));
  client.send('hello', {build});
  return client;
}

async function profile(fighterCount) {
  const clients = [];
  const dom = new JSDOM(html, {url: server.origin, pretendToBeVisual: true});
  const win = dom.window;
  for (const key of ['document', 'localStorage', 'Event']) globalThis[key] = win[key];
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({matches: false});
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try {
    const host = await connect();
    clients.push(host);
    host.send('room.create', {name: 'Benchmark', playerName: 'Хозяин', arenaId: 'columns'});
    const roomId = (await waitFor(() => host.room)).id;
    host.send('room.select', {role: 'spectator', profile: 'basic'}, roomId);
    await waitFor(() => host.room.members[0].role === 'spectator');
    const profiles = Array.from({length: fighterCount}, (_, index) => ['basic', 'fast', 'strong', 'agile'][index % 4]);
    host.send('room.configure', {name: 'Benchmark', arenaId: 'columns', slots: fighterCount, ai: profiles}, roomId);
    for (let i = 0; i < viewerCount; i++) {
      const viewer = await connect();
      clients.push(viewer);
      viewer.send('room.join', {playerName: 'Зритель ' + (i + 1), role: 'spectator'}, roomId);
      await waitFor(() => viewer.room);
    }
    host.send('match.start', {}, roomId);
    const room = await waitFor(() => host.room.phase === 'preparing' && host.room);
    let packets = 0, snapshots = 0;
    const transmit = (type, data) => {
      host.send(type, {...data, matchId: room.matchId}, roomId);
      if (type.startsWith('state.')) packets++;
      if (type === 'state.snapshot') snapshots++;
      return true;
    };
    const multiplayer = {fighters: createLanRoster(room, room.hostId),
      onSnapshot: data => transmit('state.snapshot', data),
      onRemains: data => transmit('state.remains', data),
      onFloor: data => transmit('state.floor', data),
      onReturn() {}, onFinish() {}};
    initializeGame({multiplayer, arenaId: 'columns'});
    ctx.seed = 1789;
    const arena = installLanHostArena(multiplayer);
    transmit('match.host-ready', {view: arena.view});
    for (const viewer of clients.slice(1)) {
      await waitFor(() => viewer.room.phase === 'loading');
      viewer.send('match.loaded', {matchId: room.matchId}, roomId);
    }
    await waitFor(() => clients.every(client => client.room.phase === 'running'));
    const viewers = clients.slice(1);
    const initialBytes = viewers.map(viewer => viewer.bytesRead());
    arena.start();
    advanceStartup(10);

    // Use the match's fixed step and normal 30 FPS paint cadence.
    const physics = [], render = [];
    const cpuBefore = process.cpuUsage();
    const wallStart = performance.now();
    for (let tick = 0; tick < seconds * 60; tick++) {
      const start = performance.now();
      step(1 / 60);
      physics.push(performance.now() - start);
      if (tick % 2) {
        const beforePaint = performance.now();
        paint();
        multiplayer.publishFrame(tick * 1000 / 60, true);
        render.push(performance.now() - beforePaint);
        const remaining = wallStart + (tick + 1) * 1000 / 60 - performance.now();
        if (remaining > 1) await delay(remaining);
        else await yieldIo();
      }
    }
    await waitFor(() => viewers.every(viewer => viewer.stats.packets === packets));
    const elapsed = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuBefore);
    const wireBytes = viewers.map((viewer, index) => viewer.bytesRead() - initialBytes[index]);
    const stats = viewers[0].stats;
    return {
      fighters: fighterCount, viewers: viewerCount, snapshots,
      snapshotP95Bytes: percentile(stats.snapshots, .95),
      perViewerKiBps: rounded(stats.total / seconds / 1024),
      floorKiBps: rounded(stats.floor / seconds / 1024),
      totalKiBps: rounded(viewers.reduce((sum, viewer) => sum + viewer.stats.total, 0) / seconds / 1024),
      wirePerViewerKiBps: rounded(wireBytes[0] / seconds / 1024),
      wireTotalKiBps: rounded(wireBytes.reduce((sum, bytes) => sum + bytes, 0) / seconds / 1024),
      compression: viewers[0].socket.extensions || 'off',
      physicsP95ms: rounded(percentile(physics, .95)), paintP95ms: rounded(percentile(render, .95)),
      wallSeconds: rounded(elapsed / 1000), processCpuMs: rounded((cpu.user + cpu.system) / 1000),
    };
  } finally {
    for (const client of clients) await new Promise(resolve => {
      if (client.socket.readyState === WebSocket.CLOSED) return resolve();
      client.socket.once('close', resolve);
      client.socket.terminate();
    });
    ctx.root?.__disposeTag?.();
    win.close();
  }
}

try {
  const results = [];
  for (const count of [2, 4, 6, 10]) results.push(await profile(count));
  console.table(results);
} finally {
  await server.close();
}
