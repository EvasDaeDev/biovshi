import { ctx } from "../game/state.js";
import { el } from "./svg.js";
export function drawGrid() {
  const minor = [],
    major = [];
  for (let n = 0; n <= 70; n++) {
    const p = n * 10;
    (n % 10 ? minor : major).push(`M${p},0V700 M0,${p}H700`);
  }
  ctx.gridBaseMinor = minor.join(' ');
  ctx.gridBaseMajor = major.join(' ');
  ctx.gridMinorNode = el('path', {
    class: 'minor',
    d: ctx.gridBaseMinor
  }, ctx.grid);
  ctx.gridMajorNode = el('path', {
    class: 'major',
    d: ctx.gridBaseMajor
  }, ctx.grid);
  for (let m = 1; m <= 7; m++) {
    el('text', {
      x: m === 7 ? 690 : m * 100 + 4,
      y: m === 7 ? 30 : 16,
      'text-anchor': m === 7 ? 'end' : 'start'
    }, ctx.grid).textContent = m + ' м';
    el('text', {
      x: m === 7 ? 30 : 4,
      y: m === 7 ? 690 : m * 100 - 5
    }, ctx.grid).textContent = m + ' м';
  }
}
