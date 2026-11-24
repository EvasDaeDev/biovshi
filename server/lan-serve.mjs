import {networkInterfaces} from 'node:os';
import {parseArgs} from 'node:util';
import QRCode from 'qrcode';
import {startLanServer} from './lan-server.mjs';

function localAddresses() {
  try {
    return Object.values(networkInterfaces()).flat()
      .filter(item => item?.family === 'IPv4' && !item.internal).map(item => item.address);
  } catch {
    return [];
  }
}

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
