import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {unzipSync} from 'fflate';
import WebSocket from 'ws';
import {lanMessage} from '../src/lan/protocol.js';

const archive = process.argv[2] ?? 'dist/lan/ECCEPRY-LAN.zip';
const work = await mkdtemp(path.join(tmpdir(), 'ECCEPRY LAN '));
let launcher, exited, socket;
try {
  const files = unzipSync(await readFile(archive));
  assert.ok(Object.keys(files).every(name => name.startsWith('ECCEPRY-LAN/') &&
    !name.split('/').some(part => ['..', 'node_modules', 'src'].includes(part))));
  for (const [name, content] of Object.entries(files)) {
    const destination = path.join(work, name);
    await mkdir(path.dirname(destination), {recursive: true});
    await writeFile(destination, content);
  }
  const root = path.join(work, 'ECCEPRY-LAN');
  assert.match(await readFile(path.join(root, 'Start-LAN.bat'), 'utf8'), /--prebuilt --start --open/);
  const settingsPath = path.join(root, 'server/settings.json');
  const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
  await writeFile(settingsPath, JSON.stringify({...settings, host: '127.0.0.1', gamePort: 18080}));
  // Run from outside the extracted folder to also verify module-relative paths.
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => !/^(path|node_path|npm_execpath)$/i.test(key)));
  launcher = spawn(process.execPath, [path.join(root, 'server/lan-launcher.mjs'), '--prebuilt', '--start', '--port', '0'],
    {cwd: work, env, stdio: ['ignore', 'pipe', 'pipe']});
  // Attach handlers immediately so a fast startup failure still cleans up.
  exited = once(launcher, 'exit');
  let output = '';
  launcher.stdout.on('data', data => { output += data; });
  launcher.stderr.on('data', data => { output += data; });
  let panel, game;
  for (let i = 0; i < 200; i++) {
    assert.equal(launcher.exitCode, null, output);
    panel ??= output.match(/http:\/\/127\.0\.0\.1:\d+\/lan\//)?.[0];
    if (panel) {
      const state = await (await fetch(panel + 'status')).json();
      assert.equal(state.defaults.port, 18080);
      assert.equal(state.defaults.host, '127.0.0.1');
      assert.notEqual(state.phase, 'building');
      assert.notEqual(state.phase, 'error', state.error);
      if (state.phase === 'running') {
        game = state.gameUrl;
        break;
      }
    }
    await delay(50);
  }
  assert.ok(game, output);
  const html = await (await fetch(game)).text();
  assert.match(html, /name="biovshi-lan"/);
  const entry = html.match(/<script[^>]+src="(\.\/assets\/[^"]+)"/)?.[1];
  assert.ok(entry);
  assert.equal((await fetch(new URL(entry, game))).status, 200);
  const qr = await fetch(panel + 'game-qr.png');
  assert.equal(qr.headers.get('content-type'), 'image/png');
  const {sourceCommit} = await (await fetch(game + '/build-info.json')).json();
  socket = new WebSocket(game.replace('http:', 'ws:') + '/lan/ws', {origin: game});
  try {
    await once(socket, 'open', {signal: AbortSignal.timeout(3000)});
    const reply = once(socket, 'message', {signal: AbortSignal.timeout(3000)});
    socket.send(JSON.stringify(lanMessage('hello', {build: sourceCommit})));
    const [bytes] = await reply;
    assert.equal(JSON.parse(bytes).type, 'hello');
  } finally {
    socket.terminate();
  }
  const stopped = await fetch(panel + 'stop', {method: 'POST', headers: {origin: new URL(panel).origin}});
  assert.equal(stopped.status, 202);
  console.log('Extracted LAN archive starts without npm and serves game, QR and WebSocket.');
} finally {
  if (launcher && launcher.exitCode === null) launcher.kill();
  await exited;
  await rm(work, {recursive: true, force: true});
}
