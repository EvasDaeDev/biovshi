import { resetFrameClock } from "../game/clock.js";
import { ctx } from "../game/state.js";
import { attr } from "../render/svg.js";
export
// Sidebar is BESIDE the arena, not above it. Never subtract the cards' height.
function fitField() {
  const viewportHeight = globalThis.visualViewport?.height || globalThis.innerHeight || 900;
  const main = ctx.root.querySelector('.tag7hop-main');
  const controls = ctx.root.querySelector('.atmosphere-controls');
  const controlsHeight = controls.getBoundingClientRect().height || 0;
  const infoHeight = ctx.info.getBoundingClientRect().height || 0;
  const columnWidth = Math.max(320, main.getBoundingClientRect().width || 700);
  const availableHeight = Math.max(380, viewportHeight - controlsHeight - infoHeight - 65);
  const side = Math.max(320, Math.floor(Math.min(columnWidth, availableHeight, 920)));
  if (side !== ctx.fieldSide) {
    ctx.fieldSide = side;
    ctx.stage.style.width = side + 'px';
  }
  sizeLabels();
  ctx.arenaRenderer?.resize();
}
export function sizeLabels() {
  const width = (ctx.arenaRenderer?.canvas??ctx.svg).getBoundingClientRect().width || 700;
  ctx.root.style.setProperty('--tag-label-size', 12 * 716 / width + 'px');
  ctx.root.style.setProperty('--score-label-size', Math.min(12 * 716 / width, 24) + 'px');
}
export function togglePause() {
  if (ctx.startup.phase !== 'running') return;
  ctx.paused = !ctx.paused;
  resetFrameClock();
  ctx.button.textContent = ctx.paused ? 'Продолжить' : 'Пауза';
  attr(ctx.button, 'aria-pressed', String(ctx.paused));
}

export function setTimeScale(value) {
  ctx.timeScale = value;
  attr(ctx.speedButton, 'aria-pressed', String(value === 2));
  attr(ctx.speedButton, 'title', value === 2 ? 'Вернуть обычную скорость' : 'Ускорить бой в 2 раза');
}
export function toggleSpeed() {
  if (ctx.startup.phase !== 'running') return;
  setTimeScale(ctx.timeScale === 2 ? 1 : 2);
}
