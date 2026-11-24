import assert from 'node:assert/strict';
import {once} from 'node:events';
import {copyFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import WebSocket from 'ws';
import {startLanLauncher} from '../server/lan-launcher.mjs';
import {startLanServer} from '../server/lan-server.mjs';

async function waitFor(status, phase) {
  const deadline = Date.now() + 3000;
  do {
    const current = await status();
    if (current.phase === phase) return current;
    await delay(25);
  } while (Date.now() < deadline);
  assert.fail('Timed out waiting for ' + phase);
}

async function launch(t, options) {
  const launcher = await startLanLauncher({port: 0, getInterfaces: () => [], ...options});
  t.after(() => launcher.close());
  const status = async () => (await fetch(launcher.origin + '/lan/status')).json();
  const command = (name, body, origin = launcher.origin) => fetch(launcher.origin + '/lan/' + name, {
    method: 'POST', headers: {Origin: origin, ...(body && {'Content-Type': 'application/json'})},
    ...(body && {body: JSON.stringify(body)}),
  });
  return {launcher, status, command};
}

async function buildFixture(dist) {
  await mkdir(path.join(dist, 'locations'), {recursive: true});
  await Promise.all([
    writeFile(path.join(dist, 'index.html'), '<html><head></head><body>Fixture</body></html>'),
    writeFile(path.join(dist, 'build-info.json'), JSON.stringify({sourceCommit: 'test-build'})),
    writeFile(path.join(dist, 'locations/active.json'), JSON.stringify({version: 1, active: ['ward']})),
    copyFile(new URL('../public/locations/ward.json', import.meta.url), path.join(dist, 'locations/ward.json')),
  ]);
}

test('the local panel starts a fresh build on demand, publishes the LAN URL and QR, and stops the game', async t => {
  const work = await mkdtemp(path.join(tmpdir(), 'biovshi-launcher-'));
  t.after(() => rm(work, {recursive: true, force: true}));
  const dist = path.join(work, 'missing-until-build');
  const pending = Promise.withResolvers();
  let builds = 0;
  t.after(() => pending.resolve());
  const {launcher, status, command} = await launch(t, {
    dist,
    async runBuild(folder) {
      builds++;
      assert.equal(folder, dist);
      await pending.promise;
      await buildFixture(folder);
    },
    startGame: settings => startLanServer({...settings, port: 0}),
  });
  const page = await fetch(launcher.origin + '/');
  assert.match(page.url, /\/lan\/$/);
  assert.match(await page.text(), /Запустить сервер/);
  assert.deepEqual((await status()).interfaces.map(entry => entry.address), ['127.0.0.1']);
  assert.equal(builds, 0);

  const settings = {host: '127.0.0.1', port: 8080};
  assert.equal((await command('start', settings, 'http://example.com')).status, 403);
  assert.equal((await command('start', {...settings, host: '0.0.0.0'})).status, 400);
  const panelPort = Number(new URL(launcher.origin).port);
  assert.equal((await command('start', {...settings, port: panelPort})).status, 409);
  assert.equal(builds, 0);

  assert.equal((await command('start', settings)).status, 202);
  assert.equal((await status()).phase, 'building');
  assert.equal((await command('start', settings)).status, 409);
  pending.resolve();
  const {gameUrl} = await waitFor(status, 'running');
  assert.equal(builds, 1);
  assert.notEqual(gameUrl, launcher.origin);
  assert.match(await (await fetch(gameUrl)).text(), /name="biovshi-lan"/);
  const gameQr = await fetch(launcher.origin + '/lan/game-qr.png');
  assert.equal(Buffer.from(await gameQr.arrayBuffer()).subarray(1, 4).toString(), 'PNG');
  assert.equal((await fetch(gameUrl + '/lan/status')).status, 404);

  const guest = new WebSocket(gameUrl.replace('http:', 'ws:') + '/lan/ws', {origin: gameUrl});
  await once(guest, 'open');
  const socketClosed = once(guest, 'close');
  assert.equal((await command('stop')).status, 202);
  await socketClosed;
  await waitFor(status, 'idle');
  assert.equal((await fetch(launcher.origin + '/lan/game-qr.png')).status, 404);
  await assert.rejects(fetch(gameUrl));
});

test('build and bind errors leave the launcher available for a retry', async t => {
  let attempts = 0;
  const {status, command} = await launch(t, {
    getInterfaces: () => [{name: 'Ethernet', address: '192.168.0.20'}],
    async runBuild() {
      if (++attempts === 1) throw Object.assign(Error('Failed'), {stderr: 'Fixture build error'});
    },
    async startGame(settings) {
      assert.equal(settings.host, '192.168.0.20');
      if (attempts === 2) throw Object.assign(Error('In use'), {code: 'EADDRINUSE'});
      return {origin: 'http://192.168.0.20:8083', async close() {}};
    },
  });
  const settings = {host: '192.168.0.20', port: 8083};
  assert.equal((await command('start', settings)).status, 202);
  assert.match((await waitFor(status, 'error')).log, /Fixture build error/);
  assert.equal((await command('start', settings)).status, 202);
  assert.match((await waitFor(status, 'error')).error, /порт уже занят/);
  assert.equal((await command('start', settings)).status, 202);
  assert.equal((await waitFor(status, 'running')).gameUrl, 'http://192.168.0.20:8083');
});

test('one-click startup chooses a physical LAN interface and retries a busy default game port', async t => {
  const ports = [];
  let builds = 0;
  const {status} = await launch(t, {
    autoStart: true,
    getInterfaces: () => [
      {name: 'Public interface', address: '209.10.20.30'},
      {name: 'vEthernet (Default Switch)', address: '172.23.0.1'},
      {name: 'Wi-Fi', address: '192.168.1.25'},
    ],
    async runBuild() { builds++; },
    async startGame({host, port}) {
      assert.equal(host, '192.168.1.25');
      ports.push(port);
      if (port === 8080) throw Object.assign(Error('In use'), {code: 'EADDRINUSE'});
      return {origin: 'http://192.168.1.25:49000', async close() {}};
    },
  });
  assert.equal((await waitFor(status, 'running')).gameUrl, 'http://192.168.1.25:49000');
  assert.equal(builds, 1);
  assert.deepEqual(ports, [8080, 0]);
});
