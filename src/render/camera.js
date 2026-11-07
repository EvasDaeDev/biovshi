import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { attr } from "./svg.js";
export function cameraReset() {
  ctx.camera.x = -8;
  ctx.camera.y = -8;
  ctx.camera.size = ctx.CAMERA_FULL;
  cameraApply();
}
export function cameraApply() {
  const size = clamp(ctx.camera.size, ctx.CAMERA_MIN, ctx.CAMERA_FULL);
  const min = 700 - size;
  const x = size >= 700 ? (700 - size) / 2 : clamp(ctx.camera.x, 0, 700 - size);
  const y = size >= 700 ? (700 - size) / 2 : clamp(ctx.camera.y, 0, 700 - size);
  attr(ctx.svg, 'viewBox', `${x.toFixed(3)} ${y.toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`);
  // The clock is a screen-space HUD: it must not leave the visible area on zoom.
  // Counter / markers remain anchored to their real arena coordinates.
  attr(ctx.timerOutput, 'x', (x + size / 2).toFixed(3));
  attr(ctx.timerOutput, 'y', (y + size * 38 / ctx.CAMERA_FULL).toFixed(3));
  attr(ctx.timerOutput, 'transform', `translate(${(x + size / 2).toFixed(3)} ${(y + size * 38 / ctx.CAMERA_FULL).toFixed(3)}) scale(${(size / ctx.CAMERA_FULL).toFixed(5)}) translate(${(-(x + size / 2)).toFixed(3)} ${(-(y + size * 38 / ctx.CAMERA_FULL)).toFixed(3)})`);
}
export function cameraUpdate(dt) {
  if (ctx.startup.phase !== 'running' || ctx.paused || document.hidden || ctx.combat.finished) return;
  const active = ctx.robots.filter(r => r.visible && r.mobile);
  if (!active.length) return;
  let left = Infinity,
    right = -Infinity,
    top = Infinity,
    bottom = -Infinity;
  for (const r of active) {
    left = Math.min(left, r.x);
    right = Math.max(right, r.x);
    top = Math.min(top, r.y);
    bottom = Math.max(bottom, r.y);
  }
  const span = Math.max(right - left, bottom - top);
  // 200 cm on each side of the active fighters, unless an arena wall
  // makes that physically impossible. Never zoom out beyond full arena.
  const targetSize = clamp(span + 2 * ctx.CAMERA_MARGIN, ctx.CAMERA_MIN, ctx.CAMERA_FULL);
  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;
  // Zoom out faster than zooming in so that escaping fighters stay visible.
  const zoomTau = targetSize > ctx.camera.size ? .28 : .95;
  const sizeBlend = 1 - Math.exp(-dt / zoomTau);
  ctx.camera.size += (targetSize - ctx.camera.size) * sizeBlend;
  if (Math.abs(ctx.camera.size - targetSize) < .08) ctx.camera.size = targetSize;
  const currentMax = Math.max(0, 700 - ctx.camera.size);
  const moveX = clamp(cx - ctx.camera.size / 2, 0, currentMax);
  const moveY = clamp(cy - ctx.camera.size / 2, 0, currentMax);
  const moveBlend = 1 - Math.exp(-dt / .47);
  ctx.camera.x += (moveX - ctx.camera.x) * moveBlend;
  ctx.camera.y += (moveY - ctx.camera.y) * moveBlend;
  // Include startup's 8 cm outer viewBox margin until camera is inside arena.
  if (ctx.camera.size >= 700) {
    ctx.camera.x = (700 - ctx.camera.size) / 2;
    ctx.camera.y = (700 - ctx.camera.size) / 2;
  } else {
    ctx.camera.x = clamp(ctx.camera.x, 0, currentMax);
    ctx.camera.y = clamp(ctx.camera.y, 0, currentMax);
  }
  cameraApply();
}
