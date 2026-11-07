import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { arenaClearance, containsPoint, polygonPlanes } from "../game/arena.js";
import { segmentDistance } from "../utils/math.js";
export
// Геометрия: обратная кинематика сохраняет длины звеньев.

// Без box проверяем все кубы; возвращаем ближайшее пересечение.

// Лучи зрения обрезаются препятствием. Угол зависит от роли робота.

// Circular nearby light uses the same obstacle shadow test as the flashlight.
function rectHit(a, b, box = null, pad = 0) {
  if (!box) {
    const hits = ctx.obstacles.map(box => rectHit(a, b, box, pad)).filter(t => t !== null);
    return hits.length ? Math.min(...hits) : null;
  }
  let lo = 0,
    hi = 1;
  for (const n of polygonPlanes(box, pad)) {
    const distance = n.c - n.nx * a.x - n.ny * a.y;
    const slope = n.nx * (b.x - a.x) + n.ny * (b.y - a.y);
    if (Math.abs(slope) < 1e-10) {
      if (distance < 0) return null;
      continue;
    }
    const t = distance / slope;
    if (slope > 0) hi = Math.min(hi, t);else lo = Math.max(lo, t);
    if (lo > hi + 1e-10) return null;
  }
  return lo >= -1e-10 && lo <= 1 + 1e-10 ? clamp(lo, 0, 1) : null;
}
export function inside(p, pad = 0) {
  return ctx.obstacles.some(b => containsPoint(b, p, pad));
}
export function sightClear(a, b) {
  const q = rectHit(a, b);
  return !inside(b) && (q === null || q >= 1 - 1e-8);
}
export function nearestObstaclePoint(p, b) {
  let best = null,
    distance = Infinity;
  for (let i = 0; i < b.points.length; i++) {
    const a = b.points[i],
      z = b.points[(i + 1) % b.points.length],
      dx = z.x - a.x,
      dy = z.y - a.y;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const q = {
        x: a.x + t * dx,
        y: a.y + t * dy
      },
      d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < distance) {
      best = q;
      distance = d;
    }
  }
  return {
    point: best,
    distance: containsPoint(b, p) ? 0 : distance
  };
}
export function obstacleDistance(p) {
  return Math.min(...ctx.obstacles.map(b => nearestObstaclePoint(p, b).distance));
}
export function coreClearCircle(p, r) {
  return arenaClearance(p) >= r && obstacleDistance(p) > r;
}
export function coreClearBone(a, b, r) {
  return arenaClearance(a) >= r && arenaClearance(b) >= r && rectHit(a, b, null, r) === null;
}
export function touchGap(a, b) {
  let best = Infinity;
  if (Math.hypot(a.x - b.x, a.y - b.y) > 210) return best;
  for (const c of a.capsules) for (const d of b.capsules) {
    const rr = c.r + d.r + 3;
    if (c.maxX + rr < d.minX || c.minX - rr > d.maxX || c.maxY + rr < d.minY || c.minY - rr > d.maxY) continue;
    best = Math.min(best, segmentDistance(c.a, c.b, d.a, d.b) - c.r - d.r);
  }
  return best;
}
export function bodyGap(a, b) {
  let gap = Infinity;
  for (const c of a.capsules) for (const d of b.capsules) gap = Math.min(gap, segmentDistance(c.a, c.b, d.a, d.b) - c.r - d.r);
  return gap;
}
