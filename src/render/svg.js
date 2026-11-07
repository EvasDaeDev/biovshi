import { ctx } from "../game/state.js";
export function attr(e, k, v) {
  v = String(v);
  let m = ctx.cache.get(e);
  if (!m) {
    m = new Map();
    ctx.cache.set(e, m);
  }
  if (m.get(k) !== v) {
    e.setAttribute(k, v);
    m.set(k, v);
  }
}
export function el(tag, attrs, parent) {
  const e = document.createElementNS(ctx.NS, tag);
  for (const [k, v] of Object.entries(attrs)) attr(e, k, v);
  parent.appendChild(e);
  return e;
}
export function dot(e, p, r) {
  attr(e, 'cx', p.x);
  attr(e, 'cy', p.y);
  if (r !== undefined) attr(e, 'r', r);
}
// Геометрия: обратная кинематика сохраняет длины звеньев.
