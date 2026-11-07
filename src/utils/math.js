import { ctx } from "../game/state.js";
export function fmt(p) {
  return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
}
export function path(ps) {
  return ps.map((p, i) => (i ? 'L' : 'M') + fmt(p)).join(' ');
}
export
// Геометрия: обратная кинематика сохраняет длины звеньев.
function ik(a, b, u, v, branch) {
  let dx = b.x - a.x,
    dy = b.y - a.y,
    d = Math.hypot(dx, dy);
  if (d < 1e-9) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const ux = dx / d,
    uy = dy / d,
    r = clamp(d, Math.abs(u - v) + 1e-5, u + v - 1e-5),
    end = {
      x: a.x + ux * r,
      y: a.y + uy * r
    },
    along = (u * u - v * v + r * r) / (2 * r),
    bend = Math.sqrt(Math.max(0, u * u - along * along));
  return {
    joint: {
      x: a.x + ux * along - uy * bend * branch,
      y: a.y + uy * along + ux * bend * branch
    },
    end
  };
}
// Без box проверяем все кубы; возвращаем ближайшее пересечение.
export function pointSegment(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    q = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(p.x - a.x - dx * q, p.y - a.y - dy * q);
}
export function segmentDistance(a, b, c, d) {
  const ux = b.x - a.x,
    uy = b.y - a.y,
    vx = d.x - c.x,
    vy = d.y - c.y,
    den = ux * vy - uy * vx;
  if (Math.abs(den) > 1e-10) {
    const q = ((c.x - a.x) * vy - (c.y - a.y) * vx) / den,
      r = ((c.x - a.x) * uy - (c.y - a.y) * ux) / den;
    if (q >= 0 && q <= 1 && r >= 0 && r <= 1) return 0;
  }
  return Math.min(pointSegment(a, c, d), pointSegment(b, c, d), pointSegment(c, a, b), pointSegment(d, a, b));
}

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
export function smooth(q) { q = clamp(q, 0, 1); return q * q * (3 - 2 * q); }
