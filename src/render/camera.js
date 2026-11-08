import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { attr } from "./svg.js";
// Isotropic projection: rectangular viewports add space around the square
// camera rather than stretching the arena or changing collision coordinates.
export function fittedCamera(width,height,x,y,size) {
  const scale=Math.min(width,height)/size;
  return {scale,x:(width-size*scale)/2-x*scale,y:(height-size*scale)/2-y*scale};
}
export function cameraBounds(size, outset = 8) {
  return {min:-outset,max:700+outset-size};
}
export function cameraReset() {
  ctx.camera.x = -ctx.CAMERA_OUTSET;
  ctx.camera.y = -ctx.CAMERA_OUTSET;
  ctx.camera.size = ctx.CAMERA_FULL;
  cameraApply();
}
export function cameraApply() {
  const size = clamp(ctx.camera.size, ctx.CAMERA_MIN, ctx.CAMERA_FULL);
  const bounds = cameraBounds(size, ctx.CAMERA_OUTSET);
  const x = clamp(ctx.camera.x, bounds.min, bounds.max);
  const y = clamp(ctx.camera.y, bounds.min, bounds.max);
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
  const bounds = cameraBounds(ctx.camera.size, ctx.CAMERA_OUTSET);
  const moveX = clamp(cx - ctx.camera.size / 2, bounds.min, bounds.max);
  const moveY = clamp(cy - ctx.camera.size / 2, bounds.min, bounds.max);
  const moveBlend = 1 - Math.exp(-dt / .47);
  ctx.camera.x += (moveX - ctx.camera.x) * moveBlend;
  ctx.camera.y += (moveY - ctx.camera.y) * moveBlend;
  // Keep the viewport inside the complete arena, including its outer wall.
  ctx.camera.x = clamp(ctx.camera.x, bounds.min, bounds.max);
  ctx.camera.y = clamp(ctx.camera.y, bounds.min, bounds.max);
  cameraApply();
}
