import {LAN_FRAME_BYTES} from '../src/lan/battle-protocol.js';
import {createReadStream} from 'node:fs';
import {readFile, realpath, stat} from 'node:fs/promises';
import {createServer} from 'node:http';
import {isIPv4} from 'node:net';
import {networkInterfaces} from 'node:os';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import QRCode from 'qrcode';
import {WebSocketServer} from 'ws';
import {loadLocations} from '../src/game/arenas.js';
import {LAN_WS_PATH} from '../src/lan/protocol.js';
import {createLanRooms} from './lan-rooms.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const MIME = new Map(Object.entries({
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
  '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
}));

function localAddresses() {
  try {
    return Object.values(networkInterfaces()).flat()
      .filter(item => item?.family === 'IPv4' && !item.internal).map(item => item.address);
  } catch {
    return [];
  }
}

export async function startLanServer({host = '127.0.0.1', port = 8080, dist = DIST, reconnectMs,
  countdownMs, loadingMs, hostHeartbeatMs, compression = true} = {}) {
  if (!isIPv4(host) || host === '0.0.0.0' || !Number.isInteger(port) || port < 0 || port > 65535)
    throw Error('Укажите IPv4 выбранного сетевого интерфейса и корректный порт.');

  let root, index, buildInfo;
  try {
    root = await realpath(dist);
    [index, buildInfo] = await Promise.all([
      readFile(path.join(root, 'index.html'), 'utf8'),
      readFile(path.join(root, 'build-info.json'), 'utf8').then(JSON.parse),
    ]);
  } catch (error) {
    throw Error('Не удалось открыть сборку dist. Выполните npm run build:lan.', {cause: error});
  }
  const gamePage = index.replace('<head>', '<head><meta name="biovshi-lan" content="1">');
  const locationBase = pathToFileURL(path.join(root, 'locations') + path.sep);
  // Use the same active location parser in Node and the game browser.
  const arenas = await loadLocations(new URL('http://localhost/'), {
    fetcher: async url => {
      const filename = url.pathname.slice(1);
      try { return new Response(await readFile(new URL(filename, locationBase))); }
      catch (error) {
        if (error.code === 'ENOENT') return new Response(null, {status: 404});
        throw error;
      }
    },
  });

  const ws = new WebSocketServer({
    noServer: true, maxPayload: LAN_FRAME_BYTES,
    perMessageDeflate: compression && {
      serverNoContextTakeover: true, clientNoContextTakeover: true,
      threshold: 1024, concurrencyLimit: 4, zlibDeflateOptions: {level: 3},
    },
  });
  let rooms, origin, authorities;
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (!authorities.has(req.headers.host)) return res.writeHead(421).end();
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405, {Allow: 'GET, HEAD'}).end();
    if (!req.url?.startsWith('/') || req.url.startsWith('//')) return res.writeHead(400).end();
    try {
      const url = new URL(req.url, origin);
      const pathname = decodeURIComponent(url.pathname);
      if (pathname === '/' || pathname === '/index.html') {
        const html = gamePage.replace("connect-src 'self'", "connect-src 'self' ws://" + req.headers.host);
        return res.writeHead(200, {'Content-Type': MIME.get('.html'), 'Content-Length': Buffer.byteLength(html)})
          .end(req.method === 'HEAD' ? undefined : html);
      }
      if (pathname === '/lan/qr.png') {
        const id = url.searchParams.get('room');
        if (id !== null && !rooms.hasRoom(id)) return res.writeHead(404).end();
        const invite = new URL(origin);
        if (id) invite.searchParams.set('room', id);
        const png = await QRCode.toBuffer(invite.href, {width: 192, margin: 4});
        return res.writeHead(200, {'Content-Type': 'image/png', 'Content-Length': png.length})
          .end(req.method === 'HEAD' ? undefined : png);
      }
      if (pathname.includes('\\') || pathname.includes('\0')) return res.writeHead(400).end();
      const candidate = path.resolve(root, '.' + pathname);
      if (!candidate.startsWith(root + path.sep)) return res.writeHead(404).end();
      const file = await realpath(candidate);
      const type = MIME.get(path.extname(file).toLowerCase());
      if (!file.startsWith(root + path.sep) || !type) return res.writeHead(404).end();
      const info = await stat(file);
      if (!info.isFile()) return res.writeHead(404).end();
      res.writeHead(200, {'Content-Type': type, 'Content-Length': info.size});
      if (req.method === 'HEAD') return res.end();
      const stream = createReadStream(file);
      stream.on('error', error => res.destroy(error));
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy(error);
      const status = error instanceof URIError ? 400 :
        ['ENOENT', 'ENOTDIR'].includes(error.code) ? 404 : 500;
      res.writeHead(status).end();
    }
  });
  server.on('upgrade', (req, socket, head) => {
    const authority = req.headers.host;
    const browserOrigin = authorities.has(authority) ? new URL('http://' + authority).origin : null;
    if (req.url !== LAN_WS_PATH || !browserOrigin || req.headers.origin !== browserOrigin || ws.clients.size >= 128) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    ws.handleUpgrade(req, socket, head, connection => {
      connection.alive = true;
      connection.on('pong', () => { connection.alive = true; });
      connection.on('error', () => connection.terminate());
      rooms.attach(connection);
    });
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const boundPort = server.address().port;
      authorities = new Set([host + ':' + boundPort]);
      if (host === '127.0.0.1') authorities.add('localhost:' + boundPort);
      if (boundPort === 80) {
        for (const authority of [...authorities]) authorities.add(authority.slice(0, -3));
      }
      origin = new URL('http://' + host + ':' + boundPort).origin;
      rooms = createLanRooms({arenas, build: buildInfo.sourceCommit, origin, reconnectMs, countdownMs, loadingMs, hostHeartbeatMs});
      server.off('error', reject);
      resolve();
    });
  });
  const heartbeat = setInterval(() => {
    for (const connection of ws.clients) {
      if (!connection.alive) connection.terminate();
      else {
        connection.alive = false;
        connection.ping();
      }
    }
  }, 3000);
  return {
    origin,
    async close() {
      clearInterval(heartbeat);
      rooms.close();
      for (const connection of ws.clients) connection.terminate();
      ws.close();
      await new Promise(resolve => server.close(resolve));
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const {values} = parseArgs({options: {host: {type: 'string'}, port: {type: 'string'}}});
    const host = values.host ?? '127.0.0.1';
    const server = await startLanServer({host, port: Number(values.port ?? 8080)});
    console.log('ЭКЦЕПРИ · LAN · ' + server.origin);
    if (host === '127.0.0.1') {
      const addresses = localAddresses();
      if (addresses.length)
        console.log('Для игры по сети укажите IP нужного интерфейса через --host. Доступны: ' + addresses.join(', '));
    } else {
      console.log(await QRCode.toString(server.origin, {type: 'terminal', small: true}));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
