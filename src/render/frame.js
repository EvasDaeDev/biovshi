import { formatRoundTime } from "../ui/results.js";
import { ctx } from "../game/state.js";
import { paintCombatAccents, paintDetachedAnatomy, paintOil, paintSwings, updateNeonGrid, updatePulses, updateSparks } from "./effects.js";
import { friendlyAction, oilPressure, segmentDisplayState } from "../ui/telemetry.js";
import { attr } from "./svg.js";
export function paint() {
  const clockText = formatRoundTime(ctx.round.elapsedSec);
  if (ctx.timerOutput.textContent !== clockText) ctx.timerOutput.textContent = clockText;
  updatePulses();
  updateSparks();
  updateNeonGrid();
  paintOil();
  paintDetachedAnatomy();
  paintSwings();
  for (const r of ctx.robots) {
    const n = r.segmentCount;
    r.paint(false);
    const card = ctx.cardNodes[r.id];
    card.card.hidden = false;
    card.segments.textContent = `${n}/${r.segmentTotal}`;
    const actionText = friendlyAction(r);
    if (card.action.textContent !== actionText) card.action.textContent = actionText;
    const pressure = oilPressure(r);
    const pressurePct = Math.round(pressure * 100);
    if (card.pressureValue.textContent !== pressurePct + '%') card.pressureValue.textContent = pressurePct + '%';
    card.pressureFill.style.width = pressurePct + '%';
    const mobilityPct = Math.round(r.locomotion * 100);
    card.mobility.textContent = `${r.movementLimbs}/4 · ${mobilityPct}%`;
    card.mobilityFill.style.width = mobilityPct + '%';
    card.card.classList.toggle('bleeding', ctx.combat.unarmedDeadline[r.id] !== null && r.mobile);
    card.card.classList.toggle('disabled', !r.mobile);
    for (const node of card.moduleSegments) {
      const segmentKey = node.getAttribute('data-segment');
      const display = segmentDisplayState(r, segmentKey);
      attr(node, 'stroke', display.color);
      attr(node, 'opacity', display.opacity);
      attr(node, 'stroke-dasharray', display.dash);
      if (node.tagName === 'path') {
        attr(node, 'stroke-width', display.state === 'off' ? '2.52' : '9');
      } else {
        attr(node, 'stroke-width', display.state === 'off' ? '2.16' : '3.6');
      }
    }
  }
  paintCombatAccents();
  let text = ctx.startup.phase === 'intro' ? 'Нажмите «начать»' : ctx.startup.phase === 'spawning' ? `Выход на арену · ${ctx.startup.nextIndex} / ${ctx.ROBOT_COUNT}` : 'Все против всех · осталось подвижных: ' + ctx.robots.filter(r => r.mobile).length;
  if (ctx.combat.finished) text = ctx.combat.winner === null ? 'НИЧЬЯ · все обездвижены' : `ПОБЕДИТЕЛЬ — ${String.fromCharCode(65 + ctx.combat.winner)}!`;
  ctx.status.title = text;
  const headerText = ctx.root.dataset.betRound ? 'Раунд ' + ctx.root.dataset.betRound : text;
  if (ctx.status.textContent !== headerText) ctx.status.textContent = headerText;
}
