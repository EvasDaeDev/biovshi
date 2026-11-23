import {towerResults} from '../tower/ui.js';
import {fighterLabel} from '../game/patients.js';
import {patientName} from './patient.js';
import { ctx } from "../game/state.js";
import { betWinnerNames } from "../betting/ledger.js";
import { bettingResults } from "../betting/ui.js";
import {replayPlayerBalanceChanges} from "./currency-animation.js";
// A knocked-out patient keeps the head and accumulated progress; a dead one
// has lost the head. Do not infer both outcomes from the mobile flag alone.
export function resultPatientStatus(robot, isWinner = false) {
  if (isWinner) return 'ПОБЕДИЛ';
  if (!robot.hasHead) return 'ПОГИБ';
  if (!robot.mobile) return 'В КОМАТОЗЕ';
  return 'ПОДВИЖЕН';
}
export function showResults() {
  if (!ctx.combat.finished || !ctx.resultsPanel.hidden) return;
  if(ctx.mode==='tower'){renderBattleStatistics();towerResults();return;}
  if(ctx.mode==='multiplayer'){
    const winner=ctx.combat.winner;
    ctx.root.querySelector('#tower-results-player').hidden=true;
    ctx.root.querySelector('#tower-controls').hidden=true;
    ctx.root.querySelector('#bet-result-summary').replaceChildren();
    ctx.resultsTitle.textContent=winner!==null?'ПОБЕДИТЕЛЬ — '+fighterLabel(winner):
      ctx.multiplayer.endedManually?'БОЙ ЗАВЕРШЁН ХОЗЯИНОМ':'НИЧЬЯ';
    ctx.resultsSummary.textContent=`Длительность боя · ${formatRoundTime(ctx.round.elapsedSec)}`;
    ctx.resultsAgain.textContent='В ЛОББИ';
    renderBattleStatistics();
    ctx.resultsPanel.hidden=false;
    ctx.resultsAgain.focus?.();
    return;
  }
  ctx.root.querySelector('#tower-results-player').hidden=true;
  const winner = ctx.combat.winner;
  const names=betWinnerNames(ctx.betting,winner);
  ctx.resultsTitle.innerHTML=winner===null?'НИЧЬЯ — НЕТ ПОБЕДИТЕЛЯ':`ПОБЕДИТЕЛЬ — ${patientName(winner)}${names==='—'?'':' ('+ctx.betEscape(names)+')'}`;
  ctx.resultsSummary.textContent = `Бой завершён за ${formatRoundTime(ctx.round.elapsedSec)} · ${ctx.ROBOT_COUNT} пациента`;
  renderBattleStatistics();
  bettingResults();
  ctx.resultsPanel.hidden = false;
  // Combat pays out immediately but the results sheet opens seconds later.
  replayPlayerBalanceChanges(ctx.betting,ctx.betting?.lastResult?.rows.flatMap((p,id)=>
    p.payout>0?[{id,from:p.balance-p.payout,to:p.balance}]:[])??[],ctx.root,'#gladiator-results');
  ctx.resultsAgain.focus?.();
}
export function captureBattleStatistics() {
  const {strikes, hits, fighterHits, fighterTaken} = ctx.combat;
  return {strikes, hits, fighters: ctx.robots.map(robot => ({
    segments: robot.segmentCount, total: robot.segmentTotal, hits: fighterHits[robot.id],
    taken: fighterTaken[robot.id], hasHead: robot.hasHead, mobile: robot.mobile,
  }))};
}

export function renderBattleStatistics({
  statistics = ctx.multiplayer?.result?.statistics ?? captureBattleStatistics(),
  winner = ctx.combat.winner,
  totalsNode = ctx.resultsTotals,
  rowsNode = ctx.resultsRows,
  paintName = (cell, id) => { cell.innerHTML = patientName(id, {short: true}); },
} = {}) {
  const removed = statistics.fighters.reduce((sum, fighter) => sum + fighter.total - fighter.segments, 0);
  const totals = [['ЗАМАХОВ', statistics.strikes], ['ПОПАДАНИЙ', statistics.hits], ['ОТОРВАНО ЗВЕНЬЕВ', removed]];
  totalsNode.replaceChildren();
  for (const [label, value] of totals) {
    const tile = document.createElement('div');
    tile.className = 'gladiator-result-total';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const small = document.createElement('small');
    small.textContent = label;
    tile.append(strong, small);
    totalsNode.appendChild(tile);
  }
  rowsNode.replaceChildren();
  for (const [id, fighter] of statistics.fighters.entries()) {
    const row = document.createElement('tr');
    const won = id === winner;
    if (won) row.className = 'is-winner';
    const name = document.createElement('td');
    paintName(name, id);
    row.appendChild(name);
    const cells = [`${fighter.segments}/${fighter.total}`, fighter.hits, fighter.taken, resultPatientStatus(fighter, won)];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = String(value);
      row.appendChild(td);
    }
    rowsNode.appendChild(row);
  }
}
export function formatRoundTime(seconds) {
  const total = Math.max(0, Math.floor(seconds * 100 + 1e-7));
  const hours = Math.floor(total / 360000);
  const minutes = Math.floor(total / 6000) % 60;
  const secs = Math.floor(total / 100) % 60;
  const hundredths = total % 100;
  const pad = n => String(n).padStart(2, '0');
  // Не показываем ведущие нулевые часы и минуты. Внутренние разряды сохраняем.
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(secs)}:${pad(hundredths)}`;
  if (minutes > 0) return `${minutes}:${pad(secs)}:${pad(hundredths)}`;
  return `${secs}:${pad(hundredths)}`;
}
