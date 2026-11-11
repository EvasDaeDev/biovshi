import { resetFrameClock } from "../game/clock.js";
import { ctx } from "../game/state.js";
import { attr } from "../render/svg.js";
export
// Sidebar is BESIDE the arena, not above it. Never subtract the cards' height.
function fitField() {
  const main = ctx.root.querySelector('.tag7hop-main');
  const columnWidth = main.getBoundingClientRect().width || 700;
  const win=ctx.root.ownerDocument.defaultView;
  const viewportHeight=win.visualViewport?.height||win.innerHeight;
  const toolbarHeight=ctx.root.querySelector('.atmosphere-controls').getBoundingClientRect().height;
  // The WINDOW is rectangular; the camera fits the square arena inside it.
  const width=Math.max(1,Math.floor(columnWidth));
  const height=ctx.arenaExpanded?Math.max(1,Math.floor(viewportHeight-toolbarHeight-36)):
    Math.max(1,Math.floor(Math.min(width*.8,Math.max(220,viewportHeight-toolbarHeight-48))));
  if(width!==ctx.fieldWidth||height!==ctx.fieldHeight){
    ctx.fieldWidth=width;ctx.fieldHeight=height;ctx.fieldSide=Math.min(width,height);
    ctx.stage.style.width=width+'px';ctx.stage.style.height=height+'px';
    ctx.svg.style.height='100%';ctx.svg.style.aspectRatio='auto';
    ctx.svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  }
  sizeLabels();
  ctx.arenaRenderer?.resize();
}
export function sizeLabels() {
  const bounds=(ctx.arenaRenderer?.canvas??ctx.svg).getBoundingClientRect();
  const width=Math.min(bounds.width||ctx.fieldSide||700,bounds.height||ctx.fieldSide||700);
  ctx.root.style.setProperty('--tag-label-size', 12 * 716 / width + 'px');
  ctx.root.style.setProperty('--score-label-size', Math.min(12 * 716 / width, 24) + 'px');
}
export function setPaused(paused) {
  ctx.paused = Boolean(paused);
  ctx.clearTowerInput?.();
  const label=ctx.root.querySelector('.arena-pause-label');
  if(label)label.hidden=!ctx.paused;
  resetFrameClock();
  ctx.button.textContent = ctx.paused ? 'Продолжить' : 'Пауза';
  attr(ctx.button, 'aria-pressed', String(ctx.paused));
  ctx.audio?.sync();
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
  if (ctx.startup.phase !== 'running'||ctx.mode==='tower') return;
  setTimeScale(ctx.timeScale === 2 ? 1 : 2);
}
