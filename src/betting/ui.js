import {arenaPicker} from '../game/arenas.js';
import {patientName,skillSummary} from '../ui/patient.js';
import {ROBOT_COLORS} from '../utils/colors.js';
import {COIN_ICON} from '../ui/currency.js';
import {cleanFloor} from '../render/floor-history.js';
import {garageOpen} from '../garage/ui.js';
import { ctx } from "../game/state.js";
import { betCommit, betNewSession, betRefund, betResolve, betTopUp } from "./ledger.js";
import { bettingLoad, bettingSave } from "./storage.js";
import { startSpawnSequence } from "../game/session.js";
export function bettingModal(title) {
  ctx.intro.hidden = true;
  ctx.resultsPanel.hidden = true;
  ctx.startup.phase = 'betting';
  ctx.button.disabled = ctx.speedButton.disabled = ctx.resetButton.disabled = true;
  ctx.paused = false;
  ctx.debt = 0;
  ctx.betTitle.textContent = title;
  ctx.betOverlay.dataset.view='betting';
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
 <label>Стартовый капитал каждому<span class="chip-input"><input id="bet-capital" type="number" min="1" max="1000000" step="1" value="100" required>${COIN_ICON}</span></label></div>
 <div id="bet-names" class="bet-names"></div>
 <p class="bet-muted">От 1 до 16 игроков. Капитал выдаётся один раз, при создании игры.</p>
 <div id="bet-error" class="bet-error" role="status"></div>
 <div class="bet-actions">${ctx.betting ? '<button id="bet-back" type="button">Вернуться к ставкам</button>' : ''}<button type="submit" class="bet-primary">СОЗДАТЬ ИГРУ</button></div></form>`;
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
    ctx.arenaFloors?.clear();cleanFloor();
    bettingSave();
    if(ctx.afterSetup==='procedure')garageOpen();else bettingOpen();
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
    const stake = bet ? `Ставка: ${ctx.betFormat(bet.amount)} → ${patientName(bet.robot)}` : 'Без ставки';
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
  ctx.betContent.querySelector('#bet-bank').innerHTML = ctx.betFormat(bank);
  sums.forEach((sum, i) => {
    ctx.betContent.querySelector('#bet-pool-' + i).innerHTML = ctx.betFormat(sum);
    ctx.betContent.querySelector('#bet-odds-' + i).textContent = sum ? '×' + (bank / sum).toLocaleString('ru-RU', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) : 'нет ставок';
  });
  for (const [i, row] of [...ctx.betContent.querySelectorAll('[data-bet-player]')].entries()) {
    const b = bets[i],
      valid = Number.isInteger(b.amount) && b.amount >= 0 && b.amount <= ctx.betting.players[i].balance;
    row.querySelector('[data-remaining]').innerHTML = valid ? ctx.betFormat(ctx.betting.players[i].balance - b.amount) : '—';
  }
  ctx.betContent.querySelector('#bet-fight').textContent = 'В БОЙ!';
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
  ctx.selectedArenaId=ctx.betting.arenaId??ctx.arenaId??'ward';
  ctx.betContent.innerHTML = `${ctx.betNotice ? `<p class="bet-muted">${ctx.betEscape(ctx.betNotice)}</p>` : ''}
 <p class="bet-muted">Выберите робота для каждого игрока и сумму. Ставка 0 — пропустить раунд.</p>
 <p>Общий банк: <strong id="bet-bank">0</strong> · Джекпот: <strong>${ctx.betFormat(ctx.betting.jackpot)}</strong></p>
 <div class="bet-pools">${ctx.BET_COLORS.map((c, i) => `<div class="bet-pool" style="--fighter:${c}"><strong>${patientName(i,{short:true})}</strong><small>${skillSummary(ctx.betting.garage?.[i]?.stats)}</small><span id="bet-pool-${i}"></span><small id="bet-odds-${i}"></small></div>`).join('')}</div>
 <form id="bet-stakes-form"><div class="bet-table-wrap"><table class="bet-table"><thead><tr><th>Игрок</th><th>Баланс</th><th>Робот</th><th>Ставка</th><th>Останется</th></tr></thead><tbody>
 ${ctx.betting.players.map((p, i) => `<tr data-bet-player="${i}"><td>${ctx.betEscape(p.name)}</td><td><span data-balance>${ctx.betFormat(p.balance)}</span> <button type="button" class="bet-top-up" data-top-up="${i}" aria-label="Пополнить баланс — ${ctx.betEscape(p.name)}" title="Пополнить баланс">+</button></td><td><select style="color:${ROBOT_COLORS[i%4]}" aria-label="Робот — ${ctx.betEscape(p.name)}" ${p.balance === 0 ? 'disabled' : ''}>${['A', 'B', 'C', 'D'].map((r, j) => `<option style="color:${ROBOT_COLORS[j]}" value="${j}" ${j === i % 4 ? 'selected' : ''}>${r}</option>`).join('')}</select></td><td><input aria-label="Ставка — ${ctx.betEscape(p.name)}" type="number" value="0" min="0" max="${p.balance}" step="1" required ${p.balance === 0 ? 'disabled' : ''}> ${COIN_ICON}</td><td data-remaining></td></tr>`).join('')}
 </tbody></table></div>
 <div id="bet-error" class="bet-error" role="status"></div>
 <p class="bet-muted">Коэффициенты предварительные, выплата включает ставку. Банк делится между поставившими на победителя пропорционально суммам ставок. Ничья / отмена — возврат. Нет ставок на победителя — перенос банка. Остаток округления — в джекпот.</p>
 ${ctx.betting.players.every(p => p.balance === 0) ? '<p class="bet-muted" data-empty-balances>У всех закончились фишки. Можно смотреть бои без ставок или начать новую игру.</p>' : ''}
 <div class="bet-actions"><button id="bet-new" type="button">Новая игра</button>${arenaPicker(ctx.selectedArenaId)}<button id="bet-fight" class="bet-primary" type="button"></button></div>
 <p class="bet-muted">${bettingStorageNote()}</p></form>
 ${ctx.betting.history.length ? `<details><summary>История раундов (${ctx.betting.history.length})</summary>${ctx.betting.history.map(r => `<p class="bet-muted">Раунд ${Number(r.round)} · ${r.winner === null ? 'ничья' : 'победитель ' + patientName(r.winner)} · банк ${ctx.betFormat(Number(r.bank))}</p>`).join('')}</details>` : ''}`;
  const bindArenas=()=>ctx.betContent.querySelectorAll('[data-arena]').forEach(button=>button.onclick=()=>{
    ctx.selectedArenaId=button.dataset.arena;
    ctx.betContent.querySelector('.arena-picker').outerHTML=arenaPicker(ctx.selectedArenaId);bindArenas();
  });bindArenas();
  ctx.betContent.querySelectorAll('[data-bet-player] select').forEach(select=>select.onchange=()=>{select.style.color=ROBOT_COLORS[Number(select.value)];bettingPreview();});
  ctx.betContent.querySelectorAll('[data-top-up]').forEach(button=>button.onclick=()=>{
    const player=Number(button.dataset.topUp),raw=ctx.root.ownerDocument.defaultView.prompt('Сумма пополнения для '+ctx.betting.players[player].name+' (фишки):','100');
    if(raw===null)return;
    try{
      betTopUp(ctx.betting,player,Number(raw.trim()));bettingSave();bettingHud();
      const row=button.closest('[data-bet-player]'),balance=ctx.betting.players[player].balance;
      row.querySelector('[data-balance]').innerHTML=ctx.betFormat(balance);
      row.querySelector('input').max=balance;row.querySelector('input').disabled=false;row.querySelector('select').disabled=false;
      ctx.betContent.querySelector('#bet-error').textContent='';bettingPreview();
      ctx.betContent.querySelector('[data-empty-balances]')?.remove();
    }catch(error){ctx.betContent.querySelector('#bet-error').textContent=error.message;}
  });
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
  ctx.betContent.querySelector('#bet-fight').onclick = async e => {
    e.preventDefault();
    if (!stakesForm.reportValidity()) return;
    const draft=bettingReadDraft();
    e.currentTarget.disabled=true;
    try {
      const arenaId=ctx.selectedArenaId??ctx.arenaId??'ward';
      if(arenaId!==ctx.arenaId){if(!ctx.switchArena)throw Error('Подготовка арены недоступна.');await ctx.switchArena(arenaId);}
      betCommit(ctx.betting, draft);
    } catch (err) {
      ctx.betContent.querySelector('#bet-error').textContent = err.message;
      ctx.betContent.querySelector('#bet-fight').disabled=false;
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
  if (!ctx.betting || ctx.betting.phase !== 'running') return;
  ctx.betting.garage?.forEach((g,id)=>{if(id!==winner)g.head=null;});
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
 <div class="bet-table-wrap"><table class="bet-table"><thead><tr><th>Игрок</th><th>Ставка</th><th>Выплата</th><th title="Выплата минус ставка">Прибыль</th><th>Баланс</th></tr></thead><tbody>
 ${r.rows.map(p => {
    const net = p.payout - p.stake;
    const before=p.balance-net;
    const gain=p.payout>0?' bet-net-win':'';
    return `<tr><td>${ctx.betEscape(p.name)}</td><td>${p.robot === null ? '—' : patientName(p.robot,{short:true}) + ' · ' + ctx.betFormat(p.stake)}</td><td class="${gain}">${ctx.betFormat(p.payout)}</td><td><span class="bet-net${net < 0 ? ' bet-net-loss' : net > 0 ? ' bet-net-win' : ''}">${net > 0 ? '+' : ''}${ctx.betFormat(net)}</span></td><td class="bet-balance-equation"><span>${ctx.betFormat(before)}</span>${p.stake?` <span class="bet-net-loss">−${ctx.betFormat(p.stake)}</span>`:''}${p.payout?` <span class="bet-net-win">+${ctx.betFormat(p.payout)}</span>`:''} = <strong>${ctx.betFormat(p.balance)}</strong></td></tr>`;
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
