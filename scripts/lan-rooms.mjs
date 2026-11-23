import {randomBytes, randomUUID} from 'node:crypto';
import {lanAiName, validLanProfile} from '../src/lan/characters.js';
import {
  LAN_MAX_FIGHTERS, LAN_RECONNECT_MS, LAN_ROOM_CODE, isLanMessage, lanMessage,
} from '../src/lan/protocol.js';

const MAX_ROOMS = 32;
const MAX_MEMBERS = 64;
const ROLES = new Set(['player', 'spectator']);
const waiting = 'waiting';
const preparing = 'preparing';
const running = 'running';
const results = 'results';

class RoomError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function requireRoom(condition, code, message) {
  if (!condition) throw new RoomError(code, message);
}

function name(value, max) {
  const cleaned = typeof value === 'string' ? value.trim() : '';
  requireRoom(cleaned.length > 0 && cleaned.length <= max && !/[\u0000-\u001f\u007f]/u.test(cleaned),
    'invalid_name', 'Укажите имя длиной от 1 до ' + max + ' символов.');
  return cleaned;
}

function fighterCount(room) {
  return room.ai.length + [...room.members.values()].filter(member => member.role === 'player').length;
}

function canStart(room) {
  const players = [...room.members.values()].filter(member => member.socket && member.role === 'player');
  return room.phase === waiting && Boolean(room.members.get(room.hostId)?.socket) &&
    room.ai.length + players.length > 0 &&
    players.every(member => member.id === room.hostId || member.ready);
}

function summary(room) {
  return {id: room.id, name: room.name, arenaId: room.arenaId, phase: room.phase,
    slots: room.slots, fighters: fighterCount(room), ai: room.ai.length,
    spectators: [...room.members.values()].filter(member => member.role === 'spectator').length,
    joinable: room.phase === waiting && Boolean(room.members.get(room.hostId)?.socket) &&
      room.members.size < MAX_MEMBERS};
}

function state(room) {
  return {...summary(room), hostId: room.hostId, ai: room.ai, canStart: canStart(room),
    matchId: room.matchId, result: room.result,
    members: [...room.members.values()].map(({id, name, role, profile, profileSummary, ready, socket}) =>
      ({id, name, role, profile, profileSummary, ready, connected: Boolean(socket)}))};
}

export function createLanRooms({arenas, build, origin, reconnectMs = LAN_RECONNECT_MS}) {
  const rooms = new Map();
  const sessions = new Map();
  const clients = new Map();
  const catalog = Object.values(arenas).map(({id, name, capacity}) =>
    ({id, name, capacity: Math.min(capacity, LAN_MAX_FIGHTERS)}));

  function send(socket, type, payload, roomId) {
    if (socket?.readyState !== 1) return;
    if (socket.bufferedAmount > 256 * 1024) {
      socket.terminate();
      return;
    }
    socket.send(JSON.stringify(lanMessage(type, payload, roomId)));
  }

  const list = () => ({rooms: [...rooms.values()].map(summary)});
  function publishList() {
    const payload = list();
    for (const [socket, client] of clients) {
      if (client.hello && !client.member) send(socket, 'rooms.snapshot', payload);
    }
  }

  function publishRoom(room) {
    const payload = state(room);
    for (const member of room.members.values()) send(member.socket, 'room.state', payload, room.id);
    publishList();
  }

  function resetReady(room) {
    for (const member of room.members.values()) member.ready = false;
  }

  function returnToLobby(room) {
    if (room.phase === waiting) return;
    room.phase = waiting;
    room.matchId = null;
    room.result = null;
    room.matchFighters = null;
    resetReady(room);
  }

  function cancelPreparation(room) {
    if (room.phase === preparing) returnToLobby(room);
  }

  function removeMember(room, member, reason) {
    clearTimeout(member.timer);
    sessions.delete(member.token);
    room.members.delete(member.id);
    if (member.socket) {
      clients.get(member.socket).member = null;
      send(member.socket, 'room.left', {reason}, room.id);
      member.socket = null;
    }
  }

  function closeRoom(room, reason) {
    rooms.delete(room.id);
    for (const member of room.members.values()) removeMember(room, member, reason);
    publishList();
  }

  function expire(room, member) {
    if (member.id === room.hostId) {
      closeRoom(room, 'Хозяин отключился. Комната закрыта.');
      return;
    }
    removeMember(room, member, '');
    if (member.role === 'player') {
      cancelPreparation(room);
      resetReady(room);
    }
    publishRoom(room);
  }

  function addMember(room, socket, playerName, role) {
    const member = {id: randomUUID(), token: randomBytes(24).toString('base64url'),
      roomId: room.id, name: playerName, role, profile: 'basic', ready: false, socket};
    room.members.set(member.id, member);
    sessions.set(member.token, member);
    clients.get(socket).member = member;
    send(socket, 'room.entered', {memberId: member.id, resumeToken: member.token}, room.id);
    return member;
  }

  function createRoom(socket, payload) {
    requireRoom(rooms.size < MAX_ROOMS, 'room_limit', 'Достигнут лимит комнат.');
    const roomName = name(payload.name, 48);
    const playerName = name(payload.playerName, 24);
    const arena = catalog.find(item => item.id === payload.arenaId);
    requireRoom(arena, 'invalid_arena', 'Выберите доступную арену.');
    let id;
    do { id = randomBytes(2).toString('hex').toUpperCase(); } while (rooms.has(id));
    const room = {id, name: roomName, arenaId: arena.id, slots: arena.capacity,
      ai: [], phase: waiting, matchId: null, result: null, hostId: null, members: new Map()};
    rooms.set(id, room);
    room.hostId = addMember(room, socket, playerName, 'player').id;
    publishRoom(room);
  }

  function joinRoom(socket, id, payload) {
    const room = rooms.get(id);
    requireRoom(room, 'room_missing', 'Комната не найдена.');
    requireRoom(summary(room).joinable, 'room_unavailable', 'Комната сейчас недоступна для входа.');
    const playerName = name(payload.playerName, 24);
    requireRoom(ROLES.has(payload.role), 'invalid_role', 'Выберите роль.');
    requireRoom(payload.role === 'spectator' || fighterCount(room) < room.slots,
      'slots_full', 'Все места бойцов заняты. Можно войти наблюдателем.');
    addMember(room, socket, playerName, payload.role);
    if (payload.role === 'player') resetReady(room);
    publishRoom(room);
  }

  function resume(socket, id, payload) {
    const member = typeof payload.token === 'string' ? sessions.get(payload.token) : null;
    const room = rooms.get(id);
    requireRoom(room && member?.roomId === id && !member.socket && Date.now() < member.resumeUntil,
      'resume_failed', 'Срок восстановления истёк или сессия уже активна.');
    clearTimeout(member.timer);
    member.socket = socket;
    member.resumeUntil = null;
    clients.get(socket).member = member;
    send(socket, 'room.entered', {memberId: member.id, resumeToken: member.token}, room.id);
    publishRoom(room);
  }

  function configure(room, payload) {
    const roomName = name(payload.name, 48);
    const arena = catalog.find(item => item.id === payload.arenaId);
    requireRoom(arena, 'invalid_arena', 'Выберите доступную арену.');
    requireRoom(Array.isArray(payload.ai) && payload.ai.length <= LAN_MAX_FIGHTERS &&
      payload.ai.every(validLanProfile), 'invalid_profile', 'Выберите доступные профили ИИ.');
    const humans = fighterCount(room) - room.ai.length;
    requireRoom(Number.isInteger(payload.slots) && payload.slots >= Math.max(1, humans + payload.ai.length) &&
      payload.slots <= arena.capacity, 'invalid_slots', 'Состав превышает число мест или вместимость арены.');
    const changed = room.arenaId !== arena.id || room.slots !== payload.slots ||
      room.ai.length !== payload.ai.length || room.ai.some((profile, index) => profile !== payload.ai[index]);
    Object.assign(room, {name: roomName, arenaId: arena.id, slots: payload.slots, ai: payload.ai});
    if (changed) resetReady(room);
  }

  function select(room, member, payload) {
    requireRoom(ROLES.has(payload.role) && (validLanProfile(payload.profile) ||
      (member.id === room.hostId && payload.profile === 'tower')),
      'invalid_profile', 'Выберите доступную роль и профиль.');
    requireRoom(member.role === 'player' || payload.role === 'spectator' || fighterCount(room) < room.slots,
      'slots_full', 'Все места бойцов заняты.');
    const profileSummary = payload.role === 'player' && payload.profile === 'tower'
      ? name(payload.profileSummary, 180) : undefined;
    if (member.role !== payload.role || member.profile !== payload.profile || member.profileSummary !== profileSummary) {
      Object.assign(member, {role: payload.role, profile: payload.profile, profileSummary});
      resetReady(room);
    }
  }

  function handle(socket, message) {
    const client = clients.get(socket);
    const {type, roomId, payload} = message;
    if (type === 'hello') {
      requireRoom(payload.build === build, 'build_mismatch', 'Версия игры изменилась. Обновите страницу.');
      client.hello = true;
      send(socket, 'hello', {arenas: catalog, origin});
      return;
    }
    requireRoom(client.hello, 'hello_required', 'Сначала подключитесь к LAN-серверу.');
    if (type === 'rooms.list') {
      send(socket, 'rooms.snapshot', list());
      return;
    }
    const member = client.member;
    if (!member) {
      if (type === 'room.create') return createRoom(socket, payload);
      if (type === 'room.join') return joinRoom(socket, roomId, payload);
      if (type === 'session.resume') return resume(socket, roomId, payload);
    }
    requireRoom(member && roomId === member.roomId, 'room_required', 'Откройте свою комнату.');
    const room = rooms.get(member.roomId);
    const host = member.id === room.hostId;
    if (['room.close', 'room.configure', 'room.kick', 'match.start', 'match.host-ready', 'match.finish', 'room.return'].includes(type)) {
      requireRoom(host, 'host_only', 'Это действие доступно только хозяину.');
    }
    if (type === 'room.close' || (type === 'room.leave' && host))
      return closeRoom(room, 'Хозяин закрыл комнату.');
    if (type === 'room.leave') {
      removeMember(room, member, '');
      if (member.role === 'player') {
        cancelPreparation(room);
        resetReady(room);
      }
      return publishRoom(room);
    }
    if (type === 'room.return') {
      if (room.phase === running || room.phase === results)
        requireRoom(payload.matchId === room.matchId, 'match_mismatch', 'Этот бой уже завершён.');
      returnToLobby(room);
      return publishRoom(room);
    }
    if (type === 'match.host-ready' || type === 'match.finish') {
      requireRoom(room.matchId && payload.matchId === room.matchId, 'match_mismatch', 'Этот бой уже завершён.');
      if (type === 'match.host-ready') {
        requireRoom(room.phase === preparing, 'invalid_phase', 'Комната уже вышла из подготовки.');
        room.phase = running;
      } else {
        requireRoom(room.phase === running, 'invalid_phase', 'Бой ещё не начался или уже завершён.');
        const {winner, elapsedSec, reason} = payload;
        const allowedWinner = winner === null || (Number.isInteger(winner) && winner >= 0 &&
          winner < room.matchFighters.length);
        requireRoom(allowedWinner && Number.isFinite(elapsedSec) && elapsedSec >= 0 &&
          (reason === 'combat' || reason === 'manual') && (reason !== 'manual' || winner === null),
          'invalid_result', 'Некорректный результат боя.');
        room.phase = results;
        room.result = {winnerName: winner === null ? null : room.matchFighters[winner], elapsedSec, reason};
      }
      return publishRoom(room);
    }
    requireRoom(room.phase === waiting, 'room_locked', 'Комната закрыта на время подготовки.');
    switch (type) {
      case 'room.configure':
        configure(room, payload);
        break;
      case 'room.select':
        select(room, member, payload);
        break;
      case 'room.ready':
        requireRoom(!host && member.role === 'player' && typeof payload.ready === 'boolean',
          'invalid_ready', 'Готовность подтверждают гости-игроки.');
        member.ready = payload.ready;
        break;
      case 'room.kick': {
        const guest = room.members.get(payload.memberId);
        requireRoom(guest && guest.id !== room.hostId, 'invalid_member', 'Участник не найден.');
        removeMember(room, guest, 'Хозяин исключил вас из комнаты.');
        if (guest.role === 'player') resetReady(room);
        break;
      }
      case 'match.start':
        requireRoom(canStart(room), 'not_ready', 'Нужен хотя бы один боец. Подключённые гости-игроки должны быть готовы.');
        for (const guest of room.members.values()) {
          if (guest.role === 'player' && !guest.socket) removeMember(room, guest, '');
        }
        room.phase = preparing;
        room.matchId = randomUUID();
        room.matchFighters = [
          ...[...room.members.values()].filter(member => member.role === 'player').map(member => member.name),
          ...room.ai.map(lanAiName),
        ];
        break;
      default:
        throw new RoomError('unknown_type', 'Неизвестная команда LAN.');
    }
    publishRoom(room);
  }

  return {
    hasRoom: id => LAN_ROOM_CODE.test(id) && rooms.has(id),
    attach(socket) {
      const client = {hello: false, member: null, messages: 0, windowStart: Date.now()};
      clients.set(socket, client);
      socket.on('message', (data, binary) => {
        const now = Date.now();
        if (now - client.windowStart >= 1000) {
          client.windowStart = now;
          client.messages = 0;
        }
        if (++client.messages > 30) {
          socket.close(1008, 'Too many messages');
          return;
        }
        try {
          requireRoom(!binary, 'invalid_message', 'Ожидалось текстовое сообщение.');
          const message = JSON.parse(data.toString());
          requireRoom(isLanMessage(message), 'invalid_message', 'Неподдерживаемое сообщение LAN.');
          handle(socket, message);
        } catch (error) {
          if (error instanceof RoomError) send(socket, 'error', {code: error.code, message: error.message});
          else if (error instanceof SyntaxError) send(socket, 'error', {code: 'invalid_message', message: 'Некорректный JSON.'});
          else {
            console.error('LAN room error:', error);
            socket.close(1011, 'Room error');
          }
        }
      });
      socket.on('close', () => {
        clients.delete(socket);
        const {member} = client;
        if (!member) return;
        const room = rooms.get(member.roomId);
        member.socket = null;
        member.resumeUntil = Date.now() + reconnectMs;
        if (member.role === 'player') member.ready = false;
        if (member.id === room.hostId && room.phase === running) returnToLobby(room);
        if (member.id === room.hostId || member.role === 'player') cancelPreparation(room);
        member.timer = setTimeout(() => expire(room, member), reconnectMs);
        publishRoom(room);
      });
    },
    close() {
      for (const room of rooms.values()) closeRoom(room, '');
    },
  };
}
