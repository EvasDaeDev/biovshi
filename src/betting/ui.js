import { ctx } from "../game/state.js";
import { betCommit, betNewSession, betRefund, betResolve } from "./ledger.js";
import { bettingLoad, bettingSave } from "./storage.js";
import { startSpawnSequence } from "../game/session.js";
export function bettingModal(title) {
  ctx.intro.hidden = true;
  ctx.resultsPanel.hidden = true;
  ctx.startup.phase = 'betting';
  ctx.button.disabled = ctx.resetButton.disabled = true;
  ctx.paused = false;
  ctx.debt = 0;
  ctx.betTitle.textContent = title;
  ctx.betOverlay.hidden = false;
}
export function bettingStorageNote() {
  return ctx.betStorageAvailable ? 'Балансы сохраняются в этом браузере. При прерывании боя ставки возвращаются.' : 'Сохранение в браузере недоступно. Балансы сохранятся только до закрытия страницы.';
}
export function bettingSetup() {
  bettingModal('Новая игра');
  ctx.betContent.innerHTML = `<p class="bet-muted">Один компьютер · виртуальные фишки · общий банк без комиссии</p>
 <form id="bet-setup-form">
 <div class="bet-fields"><label>Количество игроков<input id="bet-count" type="number" min="1" max="16" step="1" value="${ctx.betting?.players.length || 2}" required></label>
 <label>Стартовый капитал каждому<input id="bet-capital" type="number" min="1" max="1000000" step="1" value="100" required></label></div>
 <div id="bet-names" class="bet-names"></div>
 <p class="bet-muted">От 1 до 16 игроков. Капитал выдаётся один раз, при создании игры.</p>
 <div id="bet-error" class="bet-error" role="status"></div>
 <div class="bet-actions">${ctx.betting ? '<button id="bet-back" type="button">Вернуться к ставкам</button>' : ''}<button type="submit" class="bet-primary">СОЗДАТЬ ИГРУ · К СТАВКАМ</button></div></form>`;
  const count = ctx.betContent.querySelector('#bet-count'),
    names = ctx.betContent.querySelector('#bet-names');
  function renderNames() {
    const old = [...names.querySelectorAll('input')].map(n => n.value);
    const n = Number(count.value);
    if (!Number.isInteger(n) || n < 1 || n > 16) return;
    names.innerHTML = Array.from({
      length: n
    }, (_, i) => `<label>Игрок ${i + 1}<input maxlength="32" value="${ctx.betEscape(old[i] ?? ctx.betting?.players[i]?.name ?? 'Игрок ' + (i + 1))}" autocomplete="off"></label>`).join('');
  }
  count.oninput = renderNames;
  renderNames();
  ctx.betContent.querySelector('#bet-back')?.addEventListener('click', bettingOpen);
  ctx.betContent.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const n = Number(count.value),
      capital = Number(ctx.betContent.querySelector('#bet-capital').value);
    if (!Number.isInteger(n) || n < 1 || n > 16 || !Number.isInteger(capital) || capital < 1 || capital > 1000000) return;
    if (ctx.betting && !confirm('Начать новую игру? Текущие балансы, джекпот и история будут сброшены.')) return;
    ctx.betting = betNewSession([...names.querySelectorAll('input')].map((el, i) => el.value.trim() || 'Игрок ' + (i + 1)), capital);
    ctx.betNotice = '';
    bettingSave();
    bettingOpen();
  };
  count.focus();
}
export function bettingHud() {
  if (!ctx.betting) {
    ctx.betHud.hidden = true;
    delete ctx.root.dataset.betRound;
    return;
  }
  ctx.betHud.hidden = false;
  ctx.root.dataset.betRound = String(ctx.betting.round);
  ctx.status.textContent = 'Раунд ' + ctx.betting.round;
  const inRound = ctx.betting.phase === 'running' || ctx.betting.phase === 'settled';
  // The settled bank is a receipt, already paid to the players; keep it visible
  // until the next round opens. A carried jackpot is shown separately.
  const bank = ctx.betting.phase === 'running' ? ctx.betting.lockedJackpot + ctx.betting.bets.reduce((n, b) => n + b.amount, 0) : ctx.betting.phase === 'settled' ? ctx.betting.lastResult.bank : 0;
  ctx.betHud.innerHTML = `<div class="bet-hud-bank">Банк: <strong>${ctx.betFormat(bank)}</strong>${!inRound && ctx.betting.jackpot ? `<div class="bet-muted">Джекпот: ${ctx.betFormat(ctx.betting.jackpot)}</div>` : ''}</div>` + ctx.betting.players.map(p => {
    const bet = inRound ? ctx.betting.bets.find(b => b.player === p.id) : null;
    const color = bet ? ctx.BET_COLORS[bet.robot] : '#29485c';
    const stake = bet ? `Ставка: ${ctx.betFormat(bet.amount)} → робот ${'ABCD'[bet.robot]}` : 'Без ставки';
    return `<div class="bet-hud-player" style="--fighter:${color}"><div class="bet-hud-player-name">${ctx.betEscape(p.name)}</div><div class="bet-hud-player-balance">Баланс: <strong>${ctx.betFormat(p.balance)}</strong></div><div class="bet-hud-player-stake">${stake}</div></div>`;
  }).join('');
}
export function bettingReadDraft() {
  return [...ctx.betContent.querySelectorAll('[data-bet-player]')].map(row => ({
    player: Number(row.dataset.betPlayer),
    robot: Number(row.querySelector('select').value),
    amount: row.querySelector('input').value.trim() === '' ? NaN : Number(row.querySelector('input').value)
  }));
}
export function bettingPreview() {
  const bets = bettingReadDraft(),
    sums = [0, 0, 0, 0];
  for (const b of bets) if (Number.isInteger(b.amount) && b.amount >= 0 && b.amount <= ctx.betting.players[b.player].balance) sums[b.robot] += b.amount;
  const bank = ctx.betting.jackpot + sums.reduce((n, x) => n + x, 0);
  ctx.betContent.querySelector('#bet-bank').textContent = ctx.betFormat(bank);
  sums.forEach((sum, i) => {
    ctx.betContent.querySelector('#bet-pool-' + i).textContent = ctx.betFormat(sum) + ' фишек';
    ctx.betContent.querySelector('#bet-odds-' + i).textContent = sum ? '×' + (bank / sum).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) : 'нет ставок';
  });
  for (const [i, row] of [...ctx.betContent.querySelectorAll('[data-bet-player]')].entries()) {
    const b = bets[i],
      valid = Number.isInteger(b.amount) && b.amount >= 0 && b.amount <= ctx.betting.players[i].balance;
    row.querySelector('[data-remaining]').textContent = valid ? ctx.betFormat(ctx.betting.players[i].balance - b.amount) : '—';
  }
  const any = bets.some(b => b.amount > 0);
  ctx.betContent.querySelector('#bet-fight').textContent = any ? 'ЗАКРЫТЬ СТАВКИ · НАЧАТЬ БОЙ' : 'НАЧАТЬ БОЙ БЕЗ СТАВОК';
}
export function bettingOpen() {
  if (!ctx.betting) {
    bettingSetup();
    return;
  }
  if (ctx.betting.phase === 'settled') {
    ctx.betting.round++;
    ctx.betting.phase = 'betting';
    ctx.betting.bets = [];
  }
  bettingSave();
  bettingModal('Ставки · раунд ' + ctx.betting.round);
  bettingHud();
  ctx.betContent.innerHTML = `${ctx.betNotice ? `<p class="bet-muted">${ctx.betEscape(ctx.betNotice)}</p>` : ''}
 <p class="bet-muted">Выберите робота для каждого игрока и сумму. Ставка 0 — пропустить раунд.</p>
 <p>Общий банк: <strong id="bet-bank">0</strong> · Джекпот: <strong>${ctx.betFormat(ctx.betting.jackpot)}</strong></p>
 <div class="bet-pools">${ctx.BET_COLORS.map((c, i) => `<div class="bet-pool" style="--fighter:${c}"><strong>${'ABCD'[i]}</strong><span id="bet-pool-${i}"></span><small id="bet-odds-${i}"></small></div>`).join('')}</div>
 <form id="bet-stakes-form"><div class="bet-table-wrap"><table class="bet-table"><thead><tr><th>Игрок</th><th>Баланс</th><th>Робот</th><th>Ставка</th><th>Останется</th></tr></thead><tbody>
 ${ctx.betting.players.map((p, i) => `<tr data-bet-player="${i}"><td>${ctx.betEscape(p.name)}</td><td>${ctx.betFormat(p.balance)}</td><td><select aria-label="Робот — ${ctx.betEscape(p.name)}" ${p.balance === 0 ? 'disabled' : ''}>${['A', 'B', 'C', 'D'].map((r, j) => `<option value="${j}" ${j === i % 4 ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><input aria-label="Ставка — ${ctx.betEscape(p.name)}" type="number" value="0" min="0" max="${p.balance}" step="1" required ${p.balance === 0 ? 'disabled' : ''}></td><td data-remaining></td></tr>`).join('')}
 </tbody></table></div>
 <div id="bet-error" class="bet-error" role="status"></div>
 <p class="bet-muted">Коэффициенты предварительные, выплата включает ставку. Банк делится между поставившими на победителя пропорционально суммам ставок. Ничья / отмена — возврат. Нет ставок на победителя — перенос банка. Остаток округления — в джекпот.</p>
 ${ctx.betting.players.every(p => p.balance === 0) ? '<p class="bet-muted">У всех закончились фишки. Можно смотреть бои без ставок или начать новую игру.</p>' : ''}
 <div class="bet-actions"><button id="bet-new" type="button">Новая игра</button><button id="bet-fight" class="bet-primary" type="button"></button></div>
 <p class="bet-muted">${bettingStorageNote()}</p></form>
 ${ctx.betting.history.length ? `<details><summary>История раундов (${ctx.betting.history.length})</summary>${ctx.betting.history.map(r => `<p class="bet-muted">Раунд ${Number(r.round)} · ${r.winner === null ? 'ничья' : 'победитель ' + ('ABCD'[r.winner] || '?')} · банк ${ctx.betFormat(Number(r.bank))}</p>`).join('')}</details>` : ''}`;
  ctx.betContent.querySelector('#bet-new').onclick = bettingSetup;
  ctx.betContent.querySelector('#bet-stakes-form').oninput = bettingPreview;
  const stakesForm = ctx.betContent.querySelector('#bet-stakes-form');
  stakesForm.onsubmit = e => e.preventDefault();
  stakesForm.onkeydown = e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  ctx.betContent.querySelector('#bet-fight').onclick = e => {
    e.preventDefault();
    if (!stakesForm.reportValidity()) return;
    try {
      betCommit(ctx.betting, bettingReadDraft());
    } catch (err) {
      ctx.betContent.querySelector('#bet-error').textContent = err.message;
      return;
    }
    bettingSave();
    bettingHud();
    ctx.betOverlay.hidden = true;
    ctx.betNotice = '';
    startSpawnSequence();
  };
  bettingPreview();
  ctx.betContent.querySelector('input:not(:disabled)')?.focus();
}
export function bettingSettle(winner) {
  if (!ctx.betting) return;
  betResolve(ctx.betting, winner);
  bettingSave();
  bettingHud();
}
export function bettingCancel() {
  if (!ctx.betting) return;
  if (betRefund(ctx.betting)) ctx.betNotice = 'Бой отменён: все ставки возвращены. Джекпот сохранён.';
  bettingSave();
}
export function bettingResults() {
  const el = ctx.root.querySelector('#bet-result-summary'),
    r = ctx.betting?.lastResult;
  if (!r) {
    el.replaceChildren();
    return;
  }
  el.innerHTML = `<strong>ТОТАЛИЗАТОР · БАНК ${ctx.betFormat(r.bank)}</strong><p>${ctx.betEscape(r.message)}</p>
 <div class="bet-table-wrap"><table class="bet-table"><thead><tr><th>Игрок</th><th>Ставка</th><th>Выплата</th><th>Итог</th><th>Баланс</th></tr></thead><tbody>
 ${r.rows.map(p => {
    const net = p.payout - p.stake;
    return `<tr><td>${ctx.betEscape(p.name)}</td><td>${p.robot === null ? '—' : 'ABCD'[p.robot] + ' · ' + ctx.betFormat(p.stake)}</td><td>${ctx.betFormat(p.payout)}</td><td><span class="bet-net${net < 0 ? ' bet-net-loss' : net > 0 ? ' bet-net-win' : ''}">${net > 0 ? '+' : ''}${ctx.betFormat(net)}</span></td><td>${ctx.betFormat(p.balance)}</td></tr>`;
  }).join('')}
 </tbody></table></div><p>Джекпот следующего раунда: ${ctx.betFormat(r.jackpot)}</p>`;
}
export function bettingInit() {
  ctx.betting = bettingLoad();
  if (ctx.betting) {
    bettingSave();
    bettingOpen();
  } else bettingSetup();
}
