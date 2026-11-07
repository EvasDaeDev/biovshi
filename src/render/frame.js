import { formatRoundTime } from "../ui/results.js";
import { ctx } from "../game/state.js";
import { paintCombatAccents, paintDetachedAnatomy, paintOil, paintSwings, updateNeonGrid, updatePulses, updateSparks } from "./effects.js";
import { paintTelemetry } from '../ui/paint-telemetry.js';
import { paintFloorWarp } from './floor-warp.js';
export function paint() {
  const clockText = formatRoundTime(ctx.round.elapsedSec);
  if (ctx.timerOutput.textContent !== clockText) ctx.timerOutput.textContent = clockText;
  updatePulses();
  paintFloorWarp();
  updateSparks();
  updateNeonGrid();
  paintOil();
  paintDetachedAnatomy();
  paintSwings();
  for (const r of ctx.robots) r.paint(false);
  paintTelemetry();
  paintCombatAccents();
  let text = ctx.startup.phase === 'intro' ? 'Нажмите «начать»' : ctx.startup.phase === 'spawning' ? `Выход на арену · ${ctx.startup.nextIndex} / ${ctx.ROBOT_COUNT}` : 'Все против всех · осталось подвижных: ' + ctx.robots.filter(r => r.mobile).length;
  if (ctx.combat.finished) text = ctx.combat.winner === null ? 'НИЧЬЯ · все обездвижены' : `ПОБЕДИТЕЛЬ — ${String.fromCharCode(65 + ctx.combat.winner)}!`;
  ctx.status.title = text;
  const headerText = ctx.root.dataset.betRound ? 'Раунд ' + ctx.root.dataset.betRound : text;
  if (ctx.status.textContent !== headerText) ctx.status.textContent = headerText;
}
