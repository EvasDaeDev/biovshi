import {execFile, spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs, promisify} from 'node:util';
import QRCode from 'qrcode';
import {startLanServer} from './lan-server.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_DIST = fileURLToPath(new URL('../.lan-dist/', import.meta.url));
const LOOPBACK = '127.0.0.1';
const PANEL = new Map([
  ['/lan/', ['index.html', 'text/html; charset=utf-8']],
  ['/lan/panel.css', ['panel.css', 'text/css']],
  ['/lan/panel.js', ['panel.js', 'text/javascript']],
]);
const runFile = promisify(execFile);

function listInterfaces() {
  try {
    return Object.entries(networkInterfaces()).flatMap(([name, addresses]) => (addresses ?? [])
      .filter(entry => !entry.internal && entry.family === 'IPv4')
      .map(({address}) => ({name, address})));
  } catch {
    return [];
  }
}

function automaticHost(interfaces) {
  const local = interfaces.filter(({address}) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/.test(address));
  // Windows can enumerate VPN/virtual adapters before the physical Wi-Fi or Ethernet.
  const physical = local.find(({name}) => /wi-fi|wlan|ethernet|беспровод|локальной сети/i.test(name) &&
    !/virtual|vethernet|vpn|tap|wintun/i.test(name));
  return (physical ?? local[0])?.address ?? LOOPBACK;
}

function openWindowsBrowser(url) {
  const processHandle = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/c', 'start', url], {
    stdio: 'ignore', detached: true, windowsHide: true,
  });
  processHandle.on('error', error => console.error('Не удалось открыть браузер:', error.message));
  processHandle.unref();
}

async function buildGame(dist, signal) {
  const npm = process.env.npm_execpath;
  if (!npm) throw Error('Откройте панель командой npm run lan.');
  await runFile(process.execPath, [npm, 'run', 'build:lan', '--', '--outDir', dist, '--emptyOutDir'], {
    cwd: ROOT, signal, maxBuffer: 512 * 1024, windowsHide: true,
  });
}

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function readSettings(req) {
  if (req.headers['content-type']?.split(';', 1)[0].trim() !== 'application/json')
    throw new RequestError(415, 'Ожидались настройки в формате JSON.');
  let body = '';
  for await (const chunk of req.setEncoding('utf8')) {
    body += chunk;
    if (body.length > 512) throw new RequestError(413, 'Настройки слишком длинные.');
  }
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch { /* Report an invalid request below. */ }
  throw new RequestError(400, 'Не удалось прочитать настройки.');
}

function respond(res, status, payload) {
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(payload));
}

export async function startLanLauncher({
  port = 8081, dist, autoStart = false, runBuild = buildGame,
  getInterfaces = listInterfaces, startGame = startLanServer,
} = {}) {
  const assets = new Map(await Promise.all([...PANEL].map(async ([route, [file, type]]) =>
    [route, {body: await readFile(new URL('./lan-panel/' + file, import.meta.url)), type}])));
  const lifetime = new AbortController();
  const interfaces = () => [...new Map([
    ...getInterfaces(), {name: 'Только этот компьютер', address: LOOPBACK},
  ].map(entry => [entry.address, entry])).values()];
  let origin;
  let game = null;
  let job = null;
  let closing = null;
  let state = {phase: 'idle', gameUrl: null, error: null, log: null};
  const status = () => ({...state, interfaces: interfaces()});

  function start(settings, allowAlternatePort = false) {
    state = {phase: 'building', gameUrl: null, error: null, log: null};
    const buildDir = dist ?? path.join(DEFAULT_DIST, new URL(origin).port || '80');
    job = (async () => {
      try {
        await runBuild(buildDir, lifetime.signal);
        if (lifetime.signal.aborted) return;
        state.phase = 'starting';
        try {
          game = await startGame({...settings, dist: buildDir});
        } catch (error) {
          if (!allowAlternatePort || error.code !== 'EADDRINUSE' || lifetime.signal.aborted) throw error;
          game = await startGame({...settings, port: 0, dist: buildDir});
        }
        state = {phase: 'running', gameUrl: game.origin, error: null, log: null};
      } catch (error) {
        if (lifetime.signal.aborted) return;
        const output = [error.stderr, error.stdout].filter(Boolean).join('\n').trim();
        const detail = error.code === 'EADDRINUSE' ? 'Этот порт уже занят. Укажите другой.' :
          error.code === 'EADDRNOTAVAIL' ? 'Интерфейс отключён. Выберите доступный IP.' :
          output ? 'Не удалось собрать игру. Подробности есть в журнале.' : error.message;
        state = {phase: 'error', gameUrl: null, error: detail, log: output.slice(-6000) || null};
      }
    })();
  }

  function stop() {
    state.phase = 'stopping';
    job = (async () => {
      try {
        await game.close();
        game = null;
        state = {phase: 'idle', gameUrl: null, error: null, log: null};
      } catch (error) {
        state = {phase: 'running', gameUrl: game.origin, error: error.message, log: null};
      }
    })();
  }

  const server = createServer({requestTimeout: 10_000}, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
    if (req.headers.host !== new URL(origin).host) return res.writeHead(421).end();

    try {
      const route = req.url;
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (route === '/' || route === '/lan') return res.writeHead(302, {Location: '/lan/'}).end();
        const asset = assets.get(route);
        if (asset) {
          return res.writeHead(200, {'Content-Type': asset.type, 'Content-Length': asset.body.length})
            .end(req.method === 'HEAD' ? undefined : asset.body);
        }
        if (req.method === 'GET' && route === '/lan/status') return respond(res, 200, status());
        if (route === '/lan/game-qr.png' && state.phase === 'running') {
          const png = await QRCode.toBuffer(state.gameUrl, {width: 240, margin: 4});
          return res.writeHead(200, {'Content-Type': 'image/png', 'Content-Length': png.length})
            .end(req.method === 'HEAD' ? undefined : png);
        }
      }

      if (req.method === 'POST' && (route === '/lan/start' || route === '/lan/stop')) {
        if (req.headers.origin !== origin) throw new RequestError(403, 'Откройте панель по её локальному адресу.');
        if (lifetime.signal.aborted) throw new RequestError(503, 'Панель завершает работу.');
        if (route === '/lan/start') {
          const {host, port: gamePort} = await readSettings(req);
          if (lifetime.signal.aborted) throw new RequestError(503, 'Панель завершает работу.');
          if (!interfaces().some(entry => entry.address === host) ||
              !Number.isInteger(gamePort) || gamePort < 1 || gamePort > 65535)
            throw new RequestError(400, 'Выберите локальный IP и укажите порт от 1 до 65535.');
          if (state.phase !== 'idle' && state.phase !== 'error')
            throw new RequestError(409, 'Дождитесь завершения текущей операции.');
          if (host === LOOPBACK && Number(new URL(origin).port || 80) === gamePort)
            throw new RequestError(409, 'Этот порт занят панелью. Укажите другой порт игры.');
          start({host, port: gamePort});
        } else {
          if (state.phase !== 'running') throw new RequestError(409, 'Игровой сервер сейчас не запущен.');
          stop();
        }
        return respond(res, 202, status());
      }

      respond(res, 404, {error: 'Страница не найдена.'});
    } catch (error) {
      if (res.writableEnded || res.destroyed) return;
      respond(res, error.status ?? 500, {error: error.status ? error.message : 'Ошибка панели LAN.'});
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, LOOPBACK, () => {
      origin = new URL('http://' + LOOPBACK + ':' + server.address().port).origin;
      server.off('error', reject);
      resolve();
    });
  });
  if (autoStart) {
    const host = automaticHost(interfaces());
    start({host, port: host === LOOPBACK && port === 8080 ? 0 : 8080}, true);
  }
  return {
    origin,
    close() {
      if (closing) return closing;
      lifetime.abort();
      const closed = new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      closing = Promise.all([closed, (async () => {
        await job;
        await game?.close();
      })()]);
      return closing;
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {values} = parseArgs({options: {
      port: {type: 'string'}, start: {type: 'boolean'}, open: {type: 'boolean'},
    }});
    const panel = await startLanLauncher({port: Number(values.port ?? 8081), autoStart: values.start});
    const panelUrl = panel.origin + '/lan/';
    console.log('Панель запуска LAN: ' + panelUrl);
    if (values.open && process.platform === 'win32') openWindowsBrowser(panelUrl);
    const close = () => panel.close().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
