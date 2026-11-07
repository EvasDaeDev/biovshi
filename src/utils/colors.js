import { clamp, smooth } from './math.js';
import { ctx } from "../game/state.js";
import { CONFIG } from '../config.js';
export const ROBOT_COLORS = Object.freeze(['#65eeff', '#ffb36b', '#ff397b', '#b961ff']);
export function mixColor(from, to, t) {
  return `rgb(${ctx.mixChannel(from[0], to[0], t)} ${ctx.mixChannel(from[1], to[1], t)} ${ctx.mixChannel(from[2], to[2], t)})`;
}
export function victoryBodyColor(elapsed) {
  // Smooth blue → red → yellow → blue, using the robot's existing paint.
  const colors = [[65, 145, 255], [255, 69, 69], [255, 225, 70]];
  const phase = Math.max(0, elapsed) / .65,
    index = Math.floor(phase) % colors.length;
  return mixColor(colors[index], colors[(index + 1) % colors.length], smooth(phase - Math.floor(phase)));
}
export function limbColor(limbs, total = 4) {
  const q = clamp(limbs / Math.max(1, total), 0, 1);
  if (q >= 0.5) return mixColor(ctx.WARNING_LIMB_COLOR, ctx.SAFE_LIMB_COLOR, (q - .5) / .5);
  return mixColor(ctx.CRITICAL_LIMB_COLOR, ctx.WARNING_LIMB_COLOR, q / .5);
}
// Fresh dark red slowly settles into a muted brown-black stain.
export function oilColor(robotId, alpha = .9, age = 0) {
  const q=clamp(age,0,1),offset=ctx.OIL_HUES[robotId % ctx.OIL_HUES.length];
  const hue=(CONFIG.oil.baseHue+offset+(8-offset*.65)*q)%360;
  const saturation=CONFIG.oil.saturation+(45-CONFIG.oil.saturation)*q;
  const lightness=CONFIG.oil.lightness+(6-CONFIG.oil.lightness)*q;
  return `hsla(${hue} ${saturation}% ${lightness}% / ${alpha})`;
}
