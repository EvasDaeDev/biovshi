import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { attr } from "./svg.js";

// Isotropic projection: rectangular viewports add space around the square
// camera rather than stretching the arena or changing collision coordinates.
export function fittedCamera(width, height, x, y, size) {
  const scale = Math.min(width, height) / size;
  return {
    scale,
    x: (width - size * scale) / 2 - x * scale,
    y: (height - size * scale) / 2 - y * scale
  };
}

export function cameraBounds(size, outset = 8) {
  return { min: -outset, max: 700 + outset - size };
}

export function cameraReset() {
  ctx.camera.x = (ctx.arenaDefinition?.left??0)-ctx.CAMERA_OUTSET;
  ctx.camera.y = (ctx.arenaDefinition?.top??0)-ctx.CAMERA_OUTSET;
  ctx.camera.size = ctx.CAMERA_FULL;
  cameraApply();
}

export function cameraApply() {
  const size = clamp(
    ctx.camera.size,
    ctx.CAMERA_MIN,
    ctx.CAMERA_FULL
  );

  // Camera position is no longer clamped to arena bounds.
  const x = ctx.camera.x;
  const y = ctx.camera.y;

  attr(
    ctx.svg,
    'viewBox',
    `${x.toFixed(3)} ${y.toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`
  );

  // The clock is a screen-space HUD: it must not leave the visible area on zoom.
  // Counter / markers remain anchored to their real arena coordinates.
  attr(ctx.timerOutput, 'x', (x + size / 2).toFixed(3));
  attr(ctx.timerOutput, 'y', (y + size * 38 / ctx.CAMERA_FULL).toFixed(3));

  attr(
    ctx.timerOutput,
    'transform',
    `translate(${(x + size / 2).toFixed(3)} ${(y + size * 38 / ctx.CAMERA_FULL).toFixed(3)}) scale(${(size / ctx.CAMERA_FULL).toFixed(5)}) translate(${(-(x + size / 2)).toFixed(3)} ${(-(y + size * 38 / ctx.CAMERA_FULL)).toFixed(3)})`
  );
}

export function cameraTargetBounds(robots, silhouetteMargin=42) {
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const r of robots) {
    if(!Number.isFinite(r.x)||!Number.isFinite(r.y))continue;
    left=Math.min(left,r.x-silhouetteMargin);
    right=Math.max(right,r.x+silhouetteMargin);
    top=Math.min(top,r.y-silhouetteMargin);
    bottom=Math.max(bottom,r.y+silhouetteMargin);
  }
  return {left,right,top,bottom};
}

export function cameraUpdate(dt) {
  if (
    ctx.startup.phase !== 'running' ||
    ctx.paused ||
    document.hidden ||
    ctx.combat.finished
  ) return;

  const active = ctx.robots.filter(r => r.visible && r.mobile);
  if (!active.length) return;

  // Follow patients' body positions, not their animated bone capsules.
  // Head turns, strikes and limb gestures used to make the framing "breathe"
  // even when every fighter was stationary. Allow a fixed silhouette margin
  // for the whole rig while keeping the existing arena-space framing margins.
  const {left,right,top,bottom}=cameraTargetBounds(active);
  if(!Number.isFinite(left))return;

  const width=ctx.fieldWidth||ctx.fieldSide||700,height=ctx.fieldHeight||ctx.fieldSide||700,short=Math.min(width,height);
  // Screen-axis margins: two metres horizontally and one vertically.
  const targetSize=clamp(Math.max((right-left+400)*short/width,(bottom-top+200)*short/height),ctx.CAMERA_MIN,ctx.CAMERA_FULL);

  const cx = (left + right) / 2,
    cy = (top + bottom) / 2;

  // Zoom out faster than zooming in so that escaping fighters stay visible.
  const zoomTau = targetSize > ctx.camera.size ? .28 : .95;
  const sizeBlend = 1 - Math.exp(-dt / zoomTau);

  ctx.camera.size +=
    (targetSize - ctx.camera.size) * sizeBlend;

  if (Math.abs(ctx.camera.size - targetSize) < .08) {
    ctx.camera.size = targetSize;
  }

  // Follow the fighters without arena boundary restrictions.
  const moveX = cx - ctx.camera.size / 2;
  const moveY = cy - ctx.camera.size / 2;

  const moveBlend = 1 - Math.exp(-dt / .47);

  ctx.camera.x += (moveX - ctx.camera.x) * moveBlend;
  ctx.camera.y += (moveY - ctx.camera.y) * moveBlend;

  cameraApply();
}
