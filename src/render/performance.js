import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';

const STORAGE_KEY = 'biovshi.graphics.v1';
const FULL = Object.freeze({ name:'full', nearSamples:120, coneSamples:48, lightInterval:0 });
const LIGHT = Object.freeze({ name:'light', nearSamples:40, coneSamples:20, lightInterval:1/15 });

export function chooseRenderProfile(mode, touchDevice) {
  return mode === 'light' || (mode === 'auto' && touchDevice) ? LIGHT : FULL;
}
export function renderProfile() { return ctx.renderProfile ?? FULL; }
export function initializePerformance() {
  const control = ctx.root.querySelector('#graphics-quality');
  let mode = CONFIG.rendering.quality;
  try { mode = localStorage.getItem(STORAGE_KEY) || mode; } catch { /* Storage is optional. */ }
  if (!['auto','full','light'].includes(mode)) mode = 'auto';
  const touchDevice = globalThis.matchMedia?.('(any-pointer: coarse)').matches ||
    (globalThis.navigator?.platform === 'MacIntel' && globalThis.navigator.maxTouchPoints > 1);
  const apply = value => {
    ctx.renderProfile = chooseRenderProfile(value, touchDevice);
    ctx.root.classList.toggle('render-light', ctx.renderProfile.name === 'light');
    ctx.root.dataset.graphics = ctx.renderProfile.name;
    ctx.telemetryDirty = true;
    if (control) {
      control.value = value;
      control.title = 'Активный режим: ' + (ctx.renderProfile.name === 'light' ? 'лёгкий' : 'полный');
    }
  };
  apply(mode);
  if (control) control.onchange = () => {
    apply(control.value);
    try { localStorage.setItem(STORAGE_KEY, control.value); } catch { /* Storage is optional. */ }
  };
  ctx.fpsOutput = ctx.root.querySelector('#render-fps');
  ctx.frameStats = { started:null, paints:0 };
  ctx.lastTelemetryAt = -Infinity;
  ctx.telemetryRobots = null;
  ctx.settledOilDrops = new WeakSet();
}

// Counts rendered frames, rather than assuming requestAnimationFrame is the game FPS.
export function recordFrame(now, painted) {
  const stats = ctx.frameStats;
  if (!stats) return;
  const active = ctx.startup.phase === 'running' && !ctx.paused && !document.hidden;
  const meter = ctx.fpsOutput;
  if (!active) {
    stats.started = null; stats.paints = 0;
    if (meter && meter.textContent !== '— FPS') meter.textContent = '— FPS';
    return;
  }
  if (stats.started === null) stats.started = now;
  else if (now - stats.started >= 1000) {
    if (meter) meter.textContent = Math.round(stats.paints * 1000 / (now - stats.started)) + ' FPS';
    stats.started = now; stats.paints = 0;
  }
  if (painted) stats.paints++;
}
