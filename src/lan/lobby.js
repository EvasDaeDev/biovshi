import {describeLanProfile, lanTowerCopy, lanAiName, lanProfiles} from './characters.js';
import {queueFloorPatch} from './floor-sync.js';
import {createLanClient} from './client.js';
import {LAN_RECONNECT_MS, LAN_ROOM_CODE} from './protocol.js';
import {createLanWakeLock} from './wake-lock.js';
import {formatRoundTime, renderBattleStatistics} from '../ui/results.js';
import './lobby.css';

const phases = {waiting: 'Ожидание', preparing: 'Подготовка', loading: 'Загрузка', countdown: 'Отсчёт',
  running: 'Идёт бой', suspended: 'Ожидание хозяина', results: 'Результаты'};
const roles = {player: 'Боец', spectator: 'Наблюдатель'};
const SESSION_KEY = 'biovshi.lan.session.v1';
const wakeLockStatus = {
  active: 'Удержание экрана включено.',
  requesting: 'Запрашиваем удержание экрана…',
  hidden: 'Удержание экрана приостановлено до возврата во вкладку.',
  released: 'Удержание экрана отключено системой.',
  denied: 'Браузер отклонил запрос на удержание экрана.',
  unavailable: 'Удержание экрана недоступно по этому адресу или в этом браузере.',
};

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

function renderResult({result, view}) {
  const section = node('section');
  section.className = 'lan-results';
  section.append(node('h4', result.reason === 'aborted' ? 'Бой прерван. Связь с хозяином потеряна.' :
    result.reason === 'manual' ? 'Хозяин завершил бой' :
    result.winnerName === null ? 'Ничья' : 'Победитель · ' + result.winnerName),
    node('p', 'Длительность боя · ' + formatRoundTime(result.elapsedSec)));
  if (!result.statistics) {
    section.append(node('p', 'Итоговая статистика недоступна.'));
    return section;
  }

  const names = [...view.players.map(player => player.name), ...view.ai.map(lanAiName)];
  const totals = node('div');
  totals.className = 'gladiator-results-totals';
  const wrap = node('div');
  wrap.className = 'gladiator-results-table-wrap';
  const table = node('table');
  table.className = 'gladiator-results-table';
  table.setAttribute('aria-label', 'Статистика пациентов');
  const header = table.createTHead().insertRow();
  for (const label of ['Пациент', 'Сегменты', 'Попадания', 'Получено', 'Итог']) {
    const cell = node('th', label);
    cell.scope = 'col';
    header.append(cell);
  }
  renderBattleStatistics({statistics: result.statistics, winner: result.winner,
    totalsNode: totals, rowsNode: table.createTBody(),
    paintName: (cell, id) => { cell.textContent = names[id]; },
  });
  wrap.append(table);
  section.append(totals, wrap);
  return section;
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
  const retry = find('retry');
  const back = find('back');
  const code = new URL(location.href).searchParams.get('room')?.toUpperCase() ?? '';
  const invite = LAN_ROOM_CODE.test(code) ? code : '';
  let rooms = [], arenas = [], origin = location.origin, connected = false, room = null, memberId = null;
  let session = readSession();
  let activeMatch = null;
  let pendingSnapshot, pendingRemains;
  const pendingFloor = [], pendingEvents = [];
  let matchWork = Promise.resolve();
  let matchError = '';
  let lobbyActive = false, connectionFailed = false, countdownTimer, resumeTimer, resumeUntil;

  const client = createLanClient(onMessage);
  const screenStatus = find('wake-lock');
  const wakeLock = createLanWakeLock(root.ownerDocument, state => {
    screenStatus.textContent = wakeLockStatus[state] ?? '';
    screenStatus.hidden = !state;
  });
  const arenaName = id => arenas.find(arena => arena.id === id)?.name ?? id;
  const send = (type, payload) => client.send(type, payload, room?.id);
  function storeSession(next) {
    session = next;
    try {
      if (next) sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* Reconnection still works while this tab stays open. */ }
  }

  function reconcileMatch() {
    matchWork = matchWork.then(async () => {
      const belongs = Boolean(room?.matchId);
      if (activeMatch && (!belongs || activeMatch.id !== room.matchId)) {
        activeMatch = null;
        if (lobbyActive && !dialog.open) dialog.showModal();
        await leaveMatch();
      }
      if (!room || !connected) return;
      const host = room.hostId === memberId;
      const preparingHost = host && room.phase === 'preparing';
      const joiningGuest = !host && room.view && ['loading', 'countdown', 'running', 'suspended'].includes(room.phase);
      if (!activeMatch && (preparingHost || joiningGuest)) {
        const {matchId, id: roomId} = room;
        const current = () => connected && room?.matchId === matchId;
        const transmit = (type, payload = {}) => current() && client.send(type, {...payload, matchId}, roomId);
        const match = {id: matchId, replica: !host, runtime: null, started: false};
        activeMatch = match;
        try {
          match.runtime = await prepareMatch(room, memberId, host ? {
            onFinish: result => {
              match.result = result;
              if (room?.phase === 'running') match.resultSent = transmit('match.finish', result);
            },
            onSuspend: () => transmit('match.pause'),
            onResume: snapshot => transmit('match.resume', {snapshot}),
            onHeartbeat: () => transmit('match.heartbeat'),
            onSnapshot: snapshot => transmit('state.snapshot', snapshot),
            onBattleEvents: packet => transmit('game.event', packet),
            onRemains: remains => transmit('state.remains', remains),
            onFloor: floor => transmit('state.floor', floor),
            onReturn: () => transmit('room.return'),
          } : {
            onInput: input => transmit('input', input),
            onReturn: () => transmit('room.leave'),
          }, {replica: match.replica});
          if (host) transmit('match.host-ready', {view: match.runtime.view});
          else {
            if (pendingSnapshot?.matchId === matchId) match.runtime.snapshot(pendingSnapshot);
            match.runtime.events(pendingEvents.splice(0));
            if (pendingRemains?.matchId === matchId) match.runtime.remains(pendingRemains);
            for (const patch of pendingFloor.splice(0)) match.runtime.floor(patch);
            transmit('match.loaded');
          }
        } catch (error) {
          console.error('LAN arena:', error);
          matchError = /Не удалось разместить|Башни недоступен/.test(error.message)
            ? error.message : 'Не удалось подготовить арену.';
          if (current()) status.textContent = matchError;
          transmit('match.load-failed');
        }
      }
      if (!connected || !room || activeMatch?.id !== room.matchId || !activeMatch.runtime) return;
      if (!activeMatch.replica) activeMatch.runtime.phase(room.phase);
      if (room.phase === 'suspended') {
        activeMatch.resultSent = false;
        if (activeMatch.replica) activeMatch.runtime.pause();
        if (!dialog.open) dialog.showModal();
      }
      if (room.phase === 'running') {
        if (!activeMatch.started) {
          activeMatch.started = true;
          activeMatch.runtime.start();
        } else if (activeMatch.replica) activeMatch.runtime.resume();
        if (activeMatch.result && !activeMatch.resultSent)
          activeMatch.resultSent = send('match.finish', {...activeMatch.result, matchId: room.matchId});
        if (dialog.open) dialog.close();
      }
      if (room.phase === 'results' && room.result?.reason === 'aborted' && !activeMatch.replica) {
        activeMatch.runtime.pause();
        if (!dialog.open) dialog.showModal();
      }
      if (room.phase === 'results' && activeMatch.replica && !activeMatch.results) {
        const resultMatch = activeMatch;
        resultMatch.results = true;
        activeMatch.runtime.finish();
        // Let the buffered final impact play before covering the arena.
        setTimeout(() => {
          if (activeMatch === resultMatch && room?.phase === 'results' && !dialog.open) dialog.showModal();
        }, 350);
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
      item.append(node('strong', labels.join(' · ')));
      if (member.connected && member.id !== room.hostId && member.role === 'player') {
        const readiness = node('span', member.ready ? 'Готов' : 'Не готов');
        readiness.className = 'lan-readiness';
        readiness.dataset.ready = String(member.ready);
        item.append(readiness);
      }
      if (member.role === 'player') {
        const profile = describeLanProfile(member.profile);
        const detail = member.profileSummary ?? profile.detail;
        item.append(node('small', profile.name + ' · ' + detail));
        if (member.equipment?.length) item.append(node('small', member.equipment.join(' / ')));
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
    const towerRun = tower();
    const ownProfiles = towerRun ? [...lanProfiles, ['tower', 'Пациент из Башни']] : lanProfiles;
    const profile = options(ownProfiles, own.profile, locked, 'own-profile');
    role.onchange = profile.onchange = () => send('room.select', {role: role.value, profile: profile.value,
      tower: profile.value === 'tower' && role.value === 'player' ? lanTowerCopy(towerRun) : undefined});
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
    if (room.phase === 'loading') children.push(node('p', 'Загрузили арену ' + room.loaded + ' из ' + room.loadingTotal));
    if (room.phase === 'suspended') children.push(node('p', 'Бой приостановлен. Ждём хозяина.'));
    if (room.phase === 'running') children.push(node('p', 'Подключаемся к арене…'));
    if (room.phase === 'results') children.push(renderResult(room));
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
    browser.hidden = Boolean(room) || connectionFailed;
    details.hidden = !room;
    back.hidden = connected && Boolean(room);
    retry.hidden = !connectionFailed;
    refresh.disabled = !connected;
    create.querySelector('button').disabled = !connected || !arenas.length;
    if (room) renderRoom();
    else renderList();
    if (focus && document.activeElement === document.body) {
      [...dialog.querySelectorAll('[data-lan-focus]')].find(control =>
        control.dataset.lanFocus === focus && !control.disabled)?.focus({preventScroll: true});
    }
  }

  function updateCountdown(ms) {
    clearInterval(countdownTimer);
    if (ms === null || ms === undefined) return;
    const deadline = performance.now() + ms;
    const update = () => {
      const seconds = Math.ceil((deadline - performance.now()) / 1000);
      const text = seconds > 0 ? 'До начала боя · ' + seconds : 'Начинаем бой…';
      if (status.textContent !== text) status.textContent = text;
    };
    update();
    countdownTimer = setInterval(update, 100);
  }

  function abandonResume() {
    wakeLock.setEnabled(false);
    room = null;
    memberId = null;
    pendingSnapshot = pendingRemains = undefined;
    pendingFloor.length = 0;
    pendingEvents.length = 0;
    matchError = '';
    storeSession(null);
    reconcileMatch();
    client.send('rooms.list');
  }

  function onMessage({type, payload, roomId}) {
    switch (type) {
      case 'hello': {
        connected = true;
        connectionFailed = false;
        status.textContent = '';
        origin = payload.origin;
        arenas = payload.arenas;
        arenaSelect.replaceChildren(...arenas.map(item => new Option(item.name, item.id)));
        find('address').textContent = origin;
        find('address').href = origin;
        find('server-qr').src = '/lan/qr.png';
        if (session) {
          resumeUntil = performance.now() + LAN_RECONNECT_MS;
          client.send('session.resume', {token: session.token}, session.roomId);
        }
        else client.send('rooms.list');
        break;
      }
      case 'rooms.snapshot':
        rooms = payload.rooms;
        break;
      case 'room.entered':
        clearTimeout(resumeTimer);
        memberId = payload.memberId;
        status.textContent = '';
        storeSession({roomId, token: payload.resumeToken});
        return;
      case 'room.state':
        if (room?.matchId !== payload.matchId) {
          pendingSnapshot = pendingRemains = undefined;
          pendingFloor.length = 0;
          pendingEvents.length = 0;
          matchError = payload.phase === 'waiting' ? matchError : '';
        }
        room = payload;
        wakeLock.setEnabled(connected && room.hostId === memberId);
        status.textContent = matchError || payload.notice;
        updateCountdown(payload.countdownMs);
        reconcileMatch();
        break;
      case 'state.snapshot':
        if (roomId !== room?.id || payload.matchId !== room.matchId) return;
        if (payload.keyframe) pendingEvents.length = 0;
        if (activeMatch?.runtime?.snapshot) activeMatch.runtime.snapshot(payload);
        else {
          pendingEvents.push(...payload.events);
          pendingSnapshot = {...payload, events: []};
        }
        return;
      case 'game.event':
        if (roomId !== room?.id || payload.matchId !== room.matchId) return;
        if (activeMatch?.runtime?.events) activeMatch.runtime.events(payload.events);
        else pendingEvents.push(...payload.events);
        return;
      case 'state.remains':
        if (roomId !== room?.id || payload.matchId !== room.matchId) return;
        pendingRemains = payload;
        activeMatch?.runtime?.remains?.(payload);
        return;
      case 'state.floor':
        if (roomId !== room?.id || payload.matchId !== room.matchId) return;
        if (activeMatch?.runtime?.floor) activeMatch.runtime.floor(payload);
        else queueFloorPatch(pendingFloor, payload);
        return;
      case 'match.heartbeat':
        if (roomId === room?.id && payload.matchId === activeMatch?.id) activeMatch.runtime?.heartbeat?.();
        return;
      case 'input':
      case 'input.reset':
        if (roomId !== room?.id || payload.matchId !== activeMatch?.id) return;
        if (type === 'input') activeMatch.runtime?.input(payload);
        else activeMatch.runtime?.resetInput(payload.memberId);
        return;
      case 'room.left':
        wakeLock.setEnabled(false);
        updateCountdown(null);
        room = null;
        memberId = null;
        status.textContent = payload.reason;
        matchError = '';
        reconcileMatch();
        storeSession(null);
        client.send('rooms.list');
        break;
      case 'error':
        status.textContent = payload.message;
        if (payload.code === 'resume_failed') abandonResume();
        if (payload.code === 'resume_busy' && session) {
          if (performance.now() >= resumeUntil) abandonResume();
          else resumeTimer = setTimeout(() => {
            if (connected && session) client.send('session.resume', {token: session.token}, session.roomId);
          }, 500);
        }
        break;
      case 'disconnected':
        pendingEvents.length = 0;
        wakeLock.setEnabled(false);
        updateCountdown(null);
        clearTimeout(resumeTimer);
        connected = false;
        if (activeMatch) activeMatch.resultSent = false;
        activeMatch?.runtime?.pause();
        if (activeMatch && !dialog.open) dialog.showModal();
        reconcileMatch();
        status.textContent = 'Связь с локальным сервером потеряна. Пробуем подключиться снова…';
        break;
      case 'connection.failed':
        updateCountdown(null);
        clearTimeout(resumeTimer);
        connected = false;
        connectionFailed = true;
        rooms = [];
        abandonResume();
        status.textContent = payload?.message ??
          'Локальный сервер недоступен. Проверьте, запущен ли он и подключены ли вы к той же сети.';
        if (!dialog.open) dialog.showModal();
        render();
        retry.focus();
        return;
    }
    render();
  }

  function open() {
    if (dialog.open) return;
    lobbyActive = true;
    dialog.showModal();
    connect();
  }
  function connect() {
    connectionFailed = false;
    status.textContent = 'Подключаемся к локальному серверу…';
    client.open();
    render();
  }
  retry.onclick = () => {
    connect();
    status.focus();
  };
  launch.hidden = false;
  launch.onclick = open;
  create.onsubmit = event => {
    event.preventDefault();
    if (name.reportValidity())
      client.send('room.create', {name: roomName.value, playerName: name.value, arenaId: arenaSelect.value});
  };
  refresh.onclick = () => client.send('rooms.list');
  function closeLobby() {
    wakeLock.setEnabled(false);
    updateCountdown(null);
    clearTimeout(resumeTimer);
    lobbyActive = false;
    connected = false;
    room = null;
    memberId = null;
    client.close();
    reconcileMatch();
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
