const element = id => document.getElementById(id);
const form = element('settings');
const network = element('network');
const port = element('port');
const start = element('start');
const stop = element('stop');
const connection = element('connection');
const link = element('game-url');
const qr = element('qr');
const status = element('status');
const error = element('error');
const diagnostics = element('diagnostics');

const labels = {
  idle: 'Сервер остановлен',
  building: 'Собираем игру…',
  starting: 'Запускаем сервер…',
  running: 'Сервер работает',
  stopping: 'Останавливаем сервер…',
  error: 'Сервер не запущен',
};

let state;
let busy = false;
let requestError = '';
let connectionError = '';
let networkOptions = '';
let commandRevision = 0;

function render() {
  const editable = Boolean(state && !connectionError && !busy && ['idle', 'error'].includes(state.phase));
  network.disabled = port.disabled = start.disabled = !editable;
  stop.hidden = state?.phase !== 'running';
  stop.disabled = Boolean(busy || connectionError);
  const message = connectionError || labels[state?.phase] || 'Подключаемся к панели запуска…';
  if (status.textContent !== message) status.textContent = message;
  const problem = requestError || state?.error;
  error.hidden = !problem;
  if (error.textContent !== (problem ?? '')) error.textContent = problem ?? '';
  diagnostics.hidden = !state?.log;
  if (state?.log) element('log').textContent = state.log;
  if (!state) return;

  const signature = JSON.stringify(state.interfaces);
  if (signature !== networkOptions) {
    const previous = network.value;
    network.replaceChildren(...state.interfaces.map(({address, name}) => new Option(name + ' · ' + address, address)));
    const selection = previous || state.defaults.host;
    if (state.interfaces.some(entry => entry.address === selection)) network.value = selection;
    if (!networkOptions) port.value = state.defaults.port;
    networkOptions = signature;
  }
  const invite = state.phase === 'running' ? state.gameUrl : null;
  connection.hidden = !invite;
  if (invite && link.textContent !== invite) {
    const game = new URL(invite);
    network.value = game.hostname;
    port.value = game.port || 80;
    link.href = link.textContent = invite;
    qr.src = '/lan/game-qr.png';
  } else if (!invite && link.textContent) {
    link.textContent = '';
    link.removeAttribute('href');
    qr.removeAttribute('src');
  }
  const local = network.value === '127.0.0.1';
  element('network-hint').textContent = local
    ? 'Этот адрес открывается на компьютере, который запускает сервер.'
    : 'Выберите Wi-Fi или Ethernet, к которому подключены игроки.';
}

async function request(path, options) {
  const response = await fetch('/lan/' + path, options);
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}

async function refresh() {
  if (!busy) {
    const revision = commandRevision;
    try {
      const current = await request('status');
      if (!busy && revision === commandRevision) {
        state = current;
        connectionError = '';
        render();
      }
    } catch {
      if (!busy && revision === commandRevision) {
        connectionError = 'Нет связи с панелью запуска. Проверьте, открыто ли окно сервера.';
        render();
      }
    }
  }
  setTimeout(refresh, 1000);
}

async function command(path, body) {
  if (busy) return;
  busy = true;
  commandRevision++;
  requestError = '';
  render();
  try {
    state = await request(path, {
      method: 'POST',
      ...(body && {headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}),
    });
  } catch (error) {
    requestError = error.message;
  } finally {
    busy = false;
    render();
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  void command('start', {host: network.value, port: port.valueAsNumber});
});
network.addEventListener('change', render);
stop.addEventListener('click', () => void command('stop'));
void refresh();
