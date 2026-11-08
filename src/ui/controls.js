import { resetFrameClock } from "../game/clock.js";
import { ctx } from "../game/state.js";
import { attr } from "../render/svg.js";
export
// Sidebar is BESIDE the arena, not above it. Never subtract the cards' height.
function fitField() {
  const main = ctx.root.querySelector('.tag7hop-main');
  const columnWidth = main.getBoundingClientRect().width || 700;
  // Fill the centre column, including on wide displays. A square may scroll
  // vertically rather than leaving an unused strip beside a height-capped arena.
  // Compact touch screens still keep the whole square visible in landscape.
  const win=ctx.root.ownerDocument.defaultView;
  const compactTouch=ctx.touchDevice&&win.innerWidth<=1050;
  const viewportHeight=win.visualViewport?.height||win.innerHeight;
  const toolbarHeight=ctx.root.querySelector('.atmosphere-controls').getBoundingClientRect().height;
  const side = Math.max(1, Math.floor(compactTouch?Math.min(columnWidth,Math.max(220,viewportHeight-toolbarHeight-32)):columnWidth));
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
export function setPaused(paused) {
  ctx.paused = Boolean(paused);
  resetFrameClock();
  ctx.button.textContent = ctx.paused ? 'Продолжить' : 'Пауза';
  attr(ctx.button, 'aria-pressed', String(ctx.paused));
}
export function togglePause() {
  if (ctx.startup.phase !== 'running' || ctx.settingsOpen) return;
  setPaused(!ctx.paused);
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
