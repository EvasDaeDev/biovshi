import {isLanMessage, lanMessage, LAN_WS_PATH} from './protocol.js';

const build = typeof __BUILD_SOURCE__ === 'undefined' ? null : __BUILD_SOURCE__;

export function createLanClient(onEvent) {
  const url = new URL(LAN_WS_PATH, location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket, retry, active = false, ready = false;

  function connect() {
    const connection = new WebSocket(url);
    socket = connection;
    connection.addEventListener('open', () => {
      if (socket === connection) connection.send(JSON.stringify(lanMessage('hello', {build})));
    });
    connection.addEventListener('message', event => {
      if (socket !== connection) return;
      let message;
      try { message = JSON.parse(event.data); }
      catch { return; }
      if (!isLanMessage(message)) return;
      if (message.type === 'hello') ready = true;
      onEvent(message);
    });
    connection.addEventListener('close', () => {
      if (socket !== connection) return;
      ready = false;
      onEvent({type: 'disconnected'});
      if (active) retry = setTimeout(connect, 700);
    });
  }

  return {
    open() {
      if (active) return;
      active = true;
      connect();
    },
    close() {
      active = ready = false;
      clearTimeout(retry);
      const connection = socket;
      socket = null;
      connection?.close();
    },
    send(type, payload, roomId) {
      if (!ready || socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(lanMessage(type, payload, roomId)));
      return true;
    },
  };
}
