import { clamp, smooth } from './math.js';
import { ctx } from "../game/state.js";
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
// #800000 = HSL(0°, 100%, 25.098%); preserve the original 20° hue spacing.
export function oilColor(robotId, alpha = .82, lightness = 128 / 255 * 50) {
  return `hsla(${ctx.OIL_HUES[robotId % ctx.OIL_HUES.length]} 100% ${lightness}% / ${alpha})`;
}
