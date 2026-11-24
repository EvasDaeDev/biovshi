export const LAN_VERSION = 10;
export const LAN_COUNTDOWN_MS = 3_000;
export const LAN_LOADING_MS = 30_000;
export const LAN_HOST_HEARTBEAT_MS = 2_500;
export const LAN_HEARTBEAT_SEND_MS = 500;
export const LAN_RECONNECT_MS = 10_000;
export const LAN_SERVER_PULSE_MS = 3_000;
export const LAN_MAX_FIGHTERS = 10;
export const LAN_WS_PATH = '/lan/ws';
export const LAN_ROOM_CODE = /^[A-Z0-9]{4}$/;

export const lanMessage = (type, payload = {}, roomId = null) =>
  ({v: LAN_VERSION, type, roomId, payload});

export function isLanMessage(message) {
  return message !== null && typeof message === 'object' && message.v === LAN_VERSION &&
    typeof message.type === 'string' && message.type.length <= 32 &&
    (message.roomId === null || (typeof message.roomId === 'string' && LAN_ROOM_CODE.test(message.roomId))) &&
    message.payload !== null && typeof message.payload === 'object' && !Array.isArray(message.payload);
}
