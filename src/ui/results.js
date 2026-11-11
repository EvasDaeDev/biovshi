import {towerResults} from '../tower/ui.js';
import {patientName} from './patient.js';
import { ctx } from "../game/state.js";
import { betWinnerNames } from "../betting/ledger.js";
import { bettingResults } from "../betting/ui.js";
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
  if(ctx.mode==='tower'){towerResults();return;}
  const winner = ctx.combat.winner;
  const names=betWinnerNames(ctx.betting,winner);
  ctx.resultsTitle.innerHTML=winner===null?'НИЧЬЯ — НЕТ ПОБЕДИТЕЛЯ':`ПОБЕДИТЕЛЬ — ${patientName(winner)}${names==='—'?'':' ('+ctx.betEscape(names)+')'}`;
  ctx.resultsSummary.textContent = `Бой завершён за ${formatRoundTime(ctx.round.elapsedSec)} · ${ctx.ROBOT_COUNT} пациента`;
  const removed = ctx.robots.reduce((sum, r) => sum + r.segmentTotal - r.segmentCount, 0);
  const totals = [['ЗАМАХОВ', ctx.combat.strikes], ['ПОПАДАНИЙ', ctx.combat.hits], ['ОТОРВАНО ЗВЕНЬЕВ', removed]];
  ctx.resultsTotals.replaceChildren();
  for (const [label, value] of totals) {
    const tile = document.createElement('div');
    tile.className = 'gladiator-result-total';
    const strong = document.createElement('strong');
    strong.textContent = String(value);
    const small = document.createElement('small');
    small.textContent = label;
    tile.append(strong, small);
    ctx.resultsTotals.appendChild(tile);
  }
  ctx.resultsRows.replaceChildren();
  for (const r of ctx.robots) {
    const row = document.createElement('tr');
    if (r.id === winner) row.className = 'is-winner';
    const cells = [String.fromCharCode(65 + r.id), `${r.segmentCount}/${r.segmentTotal}`, String(ctx.combat.fighterHits[r.id]), String(ctx.combat.fighterTaken[r.id]), resultPatientStatus(r, r.id === winner)];
    for (const [index,value] of cells.entries()) {
      const td = document.createElement('td');
      if(index===0)td.innerHTML=patientName(r.id,{short:true});else td.textContent = value;
      row.appendChild(td);
    }
    ctx.resultsRows.appendChild(row);
  }
  bettingResults();
  ctx.resultsPanel.hidden = false;
  ctx.resultsAgain.focus?.();
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
