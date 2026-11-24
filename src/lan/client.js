import {isLanMessage, lanMessage, LAN_RECONNECT_MS, LAN_SERVER_PULSE_MS, LAN_WS_PATH} from './protocol.js';

const build = typeof __BUILD_SOURCE__ === 'undefined' ? null : __BUILD_SOURCE__;

export function createLanClient(onEvent) {
  const url = new URL(LAN_WS_PATH, location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let socket, retry, timeout, deadline, active = false, ready = false;

  function close() {
    active = ready = false;
    clearTimeout(retry);
    clearTimeout(timeout);
    const connection = socket;
    socket = null;
    connection?.close();
  }

  function failed(payload) {
    close();
    onEvent({type: 'connection.failed', payload});
  }

  function lost(connection) {
    if (socket !== connection) return;
    socket = null;
    clearTimeout(timeout);
    connection.close();
    if (ready) {
      ready = false;
      deadline = Date.now() + LAN_RECONNECT_MS;
      onEvent({type: 'disconnected'});
    }
    if (active) retry = setTimeout(connect, Math.min(700, Math.max(0, deadline - Date.now())));
  }

  function connect() {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return failed();
    const connection = new WebSocket(url);
    socket = connection;
    timeout = setTimeout(() => lost(connection), Math.min(LAN_SERVER_PULSE_MS, remaining));
    connection.addEventListener('open', () => {
      if (socket === connection) connection.send(JSON.stringify(lanMessage('hello', {build})));
    });
    connection.addEventListener('message', event => {
      if (socket !== connection) return;
      let message;
      try { message = JSON.parse(event.data); }
      catch { return; }
      if (!isLanMessage(message)) return;
      if (!ready && message.type === 'error') return failed(message.payload);
      if (message.type === 'hello') ready = true;
      if (ready) {
        clearTimeout(timeout);
        timeout = setTimeout(() => lost(connection), 2 * LAN_SERVER_PULSE_MS + 1000);
      }
      if (message.type !== 'server.pulse') onEvent(message);
    });
    connection.addEventListener('close', () => lost(connection));
  }

  return {
    open() {
      if (active) return;
      active = true;
      deadline = Date.now() + LAN_RECONNECT_MS;
      connect();
    },
    close,
    send(type, payload, roomId) {
      if (!ready || socket?.readyState !== WebSocket.OPEN) return false;
      if (socket.bufferedAmount > 128 * 1024 && ['state.snapshot', 'state.floor', 'game.event'].includes(type)) return false;
      socket.send(JSON.stringify(lanMessage(type, payload, roomId)));
      return true;
    },
  };
}
