import {describeLanProfile, describeLanTower, lanAiName, lanProfiles} from './characters.js';
import {createLanClient} from './client.js';
import {LAN_ROOM_CODE} from './protocol.js';
import './lobby.css';

const phases = {waiting: 'Ожидание', preparing: 'Подготовка', running: 'Идёт бой', results: 'Результаты'};
const roles = {player: 'Боец', spectator: 'Наблюдатель'};
const SESSION_KEY = 'biovshi.lan.session.v1';

function node(tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(text, action, {disabled = false, key = text} = {}) {
  const element = node('button', text);
  element.type = 'button';
  element.disabled = disabled;
  element.dataset.lanFocus = key;
  element.onclick = action;
  return element;
}

function field(text, input) {
  const label = node('label');
  label.append(node('span', text), input);
  return label;
}

function options(entries, selected, disabled, key) {
  const select = node('select');
  select.dataset.lanFocus = key;
  for (const [value, text] of entries) select.add(new Option(text, value, false, value === selected));
  select.disabled = disabled;
  return select;
}

function readSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (data && LAN_ROOM_CODE.test(data.roomId) && typeof data.token === 'string') return data;
  } catch { /* Storage may be disabled. The open panel can still reconnect. */ }
  return null;
}

export function installLanLobby(root, {prepareMatch, leaveMatch, tower, unlock}) {
  const launch = root.querySelector('#launch-lan');
  const dialog = root.querySelector('#lan-lobby');
  const find = id => dialog.querySelector('#lan-' + id);
  const status = find('status');
  const browser = find('browser');
  const listing = find('rooms');
  const details = find('room');
  const create = find('create');
  const name = find('player-name');
  const roomName = find('room-name');
  const arenaSelect = find('arena');
  const refresh = find('refresh');
  const back = find('back');
  const code = new URL(location.href).searchParams.get('room')?.toUpperCase() ?? '';
  const invite = LAN_ROOM_CODE.test(code) ? code : '';
  let rooms = [], arenas = [], origin = location.origin, connected = false, room = null, memberId = null;
  let session = readSession();
  let activeMatch = null;
  let hostWork = Promise.resolve();
  let matchError = '';

  const client = createLanClient(onMessage);
  const arenaName = id => arenas.find(arena => arena.id === id)?.name ?? id;
  const send = (type, payload) => client.send(type, payload, room?.id);
  function storeSession(next) {
    session = next;
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* Reconnection still works while this tab stays open. */ }
  }

  function reconcileHost() {
    hostWork = hostWork.then(async () => {
      const desired = connected && room?.hostId === memberId ? room.matchId : null;
      if (activeMatch && activeMatch.id !== desired) {
        activeMatch = null;
        if (!dialog.open) dialog.showModal();
        await leaveMatch();
      }
      if (!room || !connected || room.hostId !== memberId) return;
      if (room.phase === 'preparing' && !activeMatch) {
        const matchId = room.matchId;
        const roomId = room.id;
        const current = () => connected && room?.matchId === matchId && room.hostId === memberId;
        const transmit = (type, payload = {}) => {
          if (current()) client.send(type, {...payload, matchId}, roomId);
        };
        const match = {id: matchId, runtime: null, started: false};
        activeMatch = match;
        try {
          match.runtime = await prepareMatch(room, memberId, {
            onFinish: result => transmit('match.finish', result),
            onReturn: () => transmit('room.return'),
          });
          transmit('match.host-ready');
        } catch (error) {
          console.error('LAN arena:', error);
          matchError = /Не удалось разместить|Башни недоступен/.test(error.message)
            ? error.message : 'Не удалось подготовить арену.';
          status.textContent = matchError;
          transmit('room.return');
        }
      }
      if (room?.phase === 'running' && activeMatch?.id === room.matchId &&
          activeMatch.runtime && !activeMatch.started) {
        activeMatch.started = true;
        dialog.close();
        activeMatch.runtime.start();
      }
    }).catch(error => {
      console.error('LAN scene transition:', error);
      status.textContent = 'Не удалось восстановить главное меню. Обновите страницу.';
    });
  }

  function renderList() {
    const sorted = [...rooms].sort((a, b) => Number(b.id === invite) - Number(a.id === invite));
    const entries = [];
    if (invite && !sorted.some(item => item.id === invite) && connected)
      entries.push(node('li', 'Комната ' + invite + ' по приглашению недоступна.'));
    for (const item of sorted) {
      const entry = node('li');
      if (item.id === invite) entry.classList.add('lan-invited');
      const row = node('div');
      row.className = 'lan-row';
      row.append(
        button('Войти бойцом', () => join(item, 'player'), {disabled: !connected || !item.joinable ||
          item.fighters >= item.slots, key: item.id + '-player'}),
        button('Наблюдать', () => join(item, 'spectator'), {disabled: !connected || !item.joinable,
          key: item.id + '-spectator'}),
      );
      entry.append(node('strong', item.name + ' · ' + item.id), node('small', [
        arenaName(item.arenaId), phases[item.phase], 'Бойцы ' + item.fighters + '/' + item.slots,
        'ИИ ' + item.ai, 'Зрители ' + item.spectators,
      ].join(' · ')), row);
      entries.push(entry);
    }
    if (!entries.length) entries.push(node('li', connected ? 'Открытых комнат пока нет.' : 'Список комнат недоступен.'));
    listing.replaceChildren(...entries);
  }

  function join(item, role) {
    if (!name.reportValidity()) return;
    client.send('room.join', {playerName: name.value, role}, item.id);
  }

  function renderSettings(locked, humans) {
    const form = node('form');
    const title = node('input');
    title.value = room.name;
    title.required = true;
    title.maxLength = 48;
    title.disabled = locked;
    title.dataset.lanFocus = 'room-name';
    const arena = options(arenas.map(item => [item.id, item.name]), room.arenaId, locked, 'room-arena');
    const slots = node('input');
    slots.type = 'number';
    slots.min = Math.max(1, humans + room.ai.length);
    slots.value = room.slots;
    slots.disabled = locked;
    slots.dataset.lanFocus = 'room-slots';
    const save = button('Применить', null, {disabled: locked});
    save.type = 'submit';
    function limitSlots() {
      slots.max = arenas.find(item => item.id === arena.value).capacity;
    }
    limitSlots();
    arena.onchange = () => {
      limitSlots();
      slots.value = Math.min(+slots.value, +slots.max);
      if (+slots.min > +slots.max) status.textContent = 'Для этой арены сократите состав бойцов.';
    };
    form.className = 'lan-fields';
    form.append(field('Название комнаты', title), field('Арена', arena), field('Места бойцов', slots), save);
    form.onsubmit = event => {
      event.preventDefault();
      send('room.configure', {name: title.value, arenaId: arena.value, slots: +slots.value, ai: room.ai});
    };
    return form;
  }

  function renderRoom() {
    const own = room.members.find(member => member.id === memberId);
    if (!own) return;
    const host = own.id === room.hostId;
    const locked = room.phase !== 'waiting' || !connected;
    const humans = room.fighters - room.ai.length;
    const title = node('h3', room.name + ' · ' + room.id);
    const configuration = node('p', [arenaName(room.arenaId), phases[room.phase], 'Бойцы ' + room.fighters +
      '/' + room.slots].join(' · '));
    const inviteUrl = new URL(origin);
    inviteUrl.searchParams.set('room', room.id);
    const invitation = node('details');
    invitation.open = details.querySelector('details')?.open ?? false;
    const address = node('a', inviteUrl.href);
    address.href = inviteUrl.href;
    address.target = '_blank';
    address.rel = 'noopener';
    const qr = node('img');
    qr.alt = 'QR-код приглашения';
    qr.loading = 'lazy';
    qr.width = qr.height = 144;
    qr.src = '/lan/qr.png?room=' + room.id;
    invitation.append(node('summary', 'Приглашение'), address, qr);
    const roster = node('ul');
    roster.className = 'lan-list';
    for (const member of room.members) {
      const item = node('li');
      const labels = [member.name, member.id === room.hostId ? 'Хозяин' : roles[member.role]];
      if (member.id === room.hostId) labels.push(roles[member.role]);
      if (!member.connected) labels.push('Нет связи');
      else if (member.id !== room.hostId && member.role === 'player') labels.push(member.ready ? 'Готов' : 'Не готов');
      item.append(node('strong', labels.join(' · ')));
      if (member.role === 'player') {
        const profile = describeLanProfile(member.profile);
        const detail = member.profileSummary ?? profile.detail;
        item.append(node('small', profile.name + ' · ' + detail));
      }
      if (host && member.id !== own.id && room.phase === 'waiting')
        item.append(button('Исключить', () => send('room.kick', {memberId: member.id}),
          {disabled: locked, key: 'kick-' + member.id}));
      roster.append(item);
    }

    const changeAi = ai => send('room.configure', {name: room.name, arenaId: room.arenaId, slots: room.slots, ai});
    room.ai.forEach((profile, index) => {
      const item = node('li');
      const info = describeLanProfile(profile);
      item.append(node('strong', lanAiName(profile, index)), node('small', info.detail));
      if (host && room.phase === 'waiting') {
        const select = options(lanProfiles, profile, locked, 'ai-profile-' + index);
        select.onchange = () => changeAi(room.ai.map((id, slot) => slot === index ? select.value : id));
        item.append(field('Профиль ИИ', select),
          button('Убрать ИИ', () => changeAi(room.ai.filter((_, slot) => slot !== index)),
            {disabled: locked, key: 'ai-remove-' + index}));
      }
      roster.append(item);
    });

    const ownOptions = node('div');
    ownOptions.className = 'lan-fields';
    const role = options(Object.entries(roles), own.role, locked, 'own-role');
    const ownProfiles = host && tower() ? [...lanProfiles, ['tower', 'Пациент из Башни']] : lanProfiles;
    const profile = options(ownProfiles, own.profile, locked, 'own-profile');
    role.onchange = profile.onchange = () => send('room.select', {role: role.value, profile: profile.value,
      profileSummary: profile.value === 'tower' && role.value === 'player' ? describeLanTower(tower()) : undefined});
    ownOptions.append(field('Ваша роль', role));
    if (own.role === 'player') ownOptions.append(field('Пациент', profile));

    const actions = node('footer');
    actions.className = 'paper-dialog-actions';
    if (room.phase === 'waiting') {
      if (host) {
        const start = button('Старт', () => {
          matchError = '';
          unlock();
          send('match.start');
        }, {disabled: locked || !room.canStart});
        start.className = 'paper-dialog-primary';
        actions.append(start);
      } else if (own.role === 'player') {
        actions.append(button(own.ready ? 'Не готов' : 'Готов', () => send('room.ready', {ready: !own.ready}),
          {disabled: locked, key: 'ready'}));
      }
    } else if (host && room.phase !== 'running') {
      actions.append(button('Вернуться в лобби', () => send('room.return', {matchId: room.matchId}), {disabled: !connected}));
    }
    actions.append(button(host ? 'Закрыть комнату' : 'Выйти из комнаты',
      () => send(host ? 'room.close' : 'room.leave'), {disabled: !connected}));

    const children = [title, configuration, invitation];
    if (room.phase === 'preparing') children.push(node('p', 'Хозяин загружает арену.'));
    if (room.phase === 'running') children.push(node('p', 'Бой идёт на устройстве хозяина. Здесь появится итог.'));
    if (room.phase === 'results') {
      const result = room.result;
      children.push(node('h4', result.reason === 'manual' ? 'Хозяин завершил бой' :
        result.winnerName === null ? 'Ничья' : 'Победитель · ' + result.winnerName),
        node('p', 'Длительность · ' + result.elapsedSec.toFixed(1) + ' с'));
    }
    if (room.phase === 'waiting') {
      if (host) {
        children.push(renderSettings(locked, humans));
        children.push(button('Добавить ИИ', () => changeAi([...room.ai, 'basic']),
          {disabled: locked || room.fighters >= room.slots}));
      }
      children.push(ownOptions);
    }
    children.push(roster, actions);
    details.replaceChildren(...children);
  }

  function render() {
    const focus = document.activeElement?.dataset.lanFocus;
    browser.hidden = Boolean(room);
    details.hidden = !room;
    back.hidden = connected && Boolean(room);
    refresh.disabled = !connected;
    create.querySelector('button').disabled = !connected || !arenas.length;
    if (room) renderRoom();
    else renderList();
    if (focus && document.activeElement === document.body) {
      [...dialog.querySelectorAll('[data-lan-focus]')].find(control =>
        control.dataset.lanFocus === focus && !control.disabled)?.focus({preventScroll: true});
    }
  }

  function onMessage({type, payload, roomId}) {
    switch (type) {
      case 'hello': {
        connected = true;
        status.textContent = '';
        origin = payload.origin;
        arenas = payload.arenas;
        arenaSelect.replaceChildren(...arenas.map(item => new Option(item.name, item.id)));
        find('address').textContent = origin;
        find('address').href = origin;
        find('server-qr').src = '/lan/qr.png';
        if (session) client.send('session.resume', {token: session.token}, session.roomId);
        else client.send('rooms.list');
        break;
      }
      case 'rooms.snapshot':
        rooms = payload.rooms;
        break;
      case 'room.entered':
        memberId = payload.memberId;
        status.textContent = '';
        storeSession({roomId, token: payload.resumeToken});
        return;
      case 'room.state':
        room = payload;
        status.textContent = room.phase === 'waiting' ? matchError : '';
        reconcileHost();
        break;
      case 'room.left':
        room = null;
        memberId = null;
        status.textContent = payload.reason;
        matchError = '';
        reconcileHost();
        storeSession(null);
        client.send('rooms.list');
        break;
      case 'error':
        status.textContent = payload.message;
        if (payload.code === 'resume_failed') {
          room = null;
          memberId = null;
          storeSession(null);
          reconcileHost();
          client.send('rooms.list');
        }
        break;
      case 'disconnected':
        connected = false;
        activeMatch?.runtime?.pause();
        reconcileHost();
        status.textContent = 'Связь с локальным сервером потеряна. Пробуем подключиться снова…';
        break;
    }
    render();
  }

  function open() {
    if (dialog.open) return;
    status.textContent = 'Подключаемся к локальному серверу…';
    dialog.showModal();
    client.open();
    render();
  }
  launch.hidden = false;
  launch.onclick = open;
  create.onsubmit = event => {
    event.preventDefault();
    if (name.reportValidity())
      client.send('room.create', {name: roomName.value, playerName: name.value, arenaId: arenaSelect.value});
  };
  refresh.onclick = () => client.send('rooms.list');
  function closeLobby() {
    connected = false;
    room = null;
    memberId = null;
    client.close();
    dialog.close();
  }
  back.onclick = closeLobby;
  dialog.oncancel = event => {
    event.preventDefault();
    if (!room || !connected) closeLobby();
  };

  if (invite || session) open();
  return Boolean(invite || session);
}
