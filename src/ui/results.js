import { ctx } from "../game/state.js";
import { betWinnerNames } from "../betting/ledger.js";
import { bettingResults } from "../betting/ui.js";
export function showResults() {
  if (!ctx.combat.finished || !ctx.resultsPanel.hidden) return;
  const winner = ctx.combat.winner;
  ctx.resultsTitle.textContent = winner === null ? 'НИЧЬЯ — НИКТО НЕ ВЫЖИЛ' : `ПОБЕДИТЕЛЬ — ${String.fromCharCode(65 + winner)} - ${betWinnerNames(ctx.betting, winner)}`;
  ctx.resultsSummary.textContent = `Бой завершён за ${formatRoundTime(ctx.round.elapsedSec)} - ${ctx.ROBOT_COUNT} пациента`;
  const removed = ctx.robots.reduce((sum, r) => sum + r.segmentTotal - r.segmentCount, 0);
  const totals = [['ЗАМАХОВ', ctx.combat.strikes], ['ПОПАДАНИЙ', ctx.combat.hits], ['ОТОРВАНО КОНЕЧНОСТЕЙ', removed]];
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
    const cells = [String.fromCharCode(65 + r.id), `${r.segmentCount}/${r.segmentTotal}`, String(ctx.combat.fighterHits[r.id]), String(ctx.combat.fighterTaken[r.id]), r.id === winner ? 'ВЫЖИЛ' : r.mobile ? 'ПОДВИЖЕН' : 'РАЗОРВАН'];
    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
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
