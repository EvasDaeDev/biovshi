import { wrap } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { rectHit, sightClear } from "./collision.js";
import { random } from "../utils/random.js";
export
// Лучи зрения обрезаются препятствием. Угол зависит от роли робота.
function visionOutline(o, heading, fov = CONFIG.vision.hunterAngleDeg * Math.PI / 180, samples = 48) {
  const angles = Array.from({
    length: samples + 1
  }, (_, i) => -fov / 2 + fov * i / samples);
  for (const b of ctx.obstacles) for (const {
    x,
    y
  } of b.points) {
    const a = wrap(Math.atan2(y - o.y, x - o.x) - heading);
    for (const e of [-1e-6, 0, 1e-6]) if (Math.abs(a + e) < fov / 2) angles.push(a + e);
  }
  angles.sort((a, b) => a - b);
  return angles.map(a => {
    const p = {
        x: o.x + Math.cos(heading + a) * CONFIG.vision.rangeCm,
        y: o.y + Math.sin(heading + a) * CONFIG.vision.rangeCm
      },
      q = rectHit(o, p) ?? 1;
    return {
      x: o.x + (p.x - o.x) * q,
      y: o.y + (p.y - o.y) * q
    };
  });
}
// Circular nearby light uses the same obstacle shadow test as the flashlight.
export function nearbyLightOutline(o, samples = 120) {
  const angles = Array.from({
    length: samples
  }, (_, i) => i * Math.PI * 2 / samples);
  for (const b of ctx.obstacles) for (const {
    x,
    y
  } of b.points) {
    const a = Math.atan2(y - o.y, x - o.x);
    for (const e of [-1e-6, 0, 1e-6]) angles.push(a + e);
  }
  angles.sort((a, b) => a - b);
  return angles.map(a => {
    const p = {
        x: o.x + Math.cos(a) * CONFIG.light.nearbyRadiusCm,
        y: o.y + Math.sin(a) * CONFIG.light.nearbyRadiusCm
      },
      hit = rectHit(o, p),
      q = hit === null ? 1 : Math.min(1, hit + .003);
    return {
      x: o.x + (p.x - o.x) * q,
      y: o.y + (p.y - o.y) * q
    };
  });
}
// Граф видимости: кратчайший обход углов всех кубов с запасом для лап.
export function updateFootsteps() {
  for (const r of ctx.robots) {
    if (!r.visible || !r.mobile) continue;
    const v = Math.hypot(r.velocity.x, r.velocity.y);
    if (v < ctx.HEARING.minMoveCmSec) continue;
    if (ctx.game.time < ctx.nextFootstepAt[r.id]) continue;
    ctx.soundEvents.push({
      robot: r.id,
      x: r.x,
      y: r.y,
      time: ctx.game.time
    });
    ctx.nextFootstepAt[r.id] = ctx.game.time + ctx.HEARING.stepMinSec + random() * (ctx.HEARING.stepMaxSec - ctx.HEARING.stepMinSec);
  }
  while (ctx.soundEvents.length && ctx.game.time - ctx.soundEvents[0].time > ctx.HEARING.memorySec) ctx.soundEvents.shift();
}
export function newestAudibleEvent(r, active) {
  let best = null;
  for (const sound of ctx.soundEvents) {
    if (!active.some(o => o.id === sound.robot)) continue;
    const d = Math.hypot(sound.x - r.x, sound.y - r.y);
    const blocked = !sightClear({
      x: r.x,
      y: r.y
    }, {
      x: sound.x,
      y: sound.y
    });
    if (d > (blocked ? ctx.HEARING.blockedRadiusCm : ctx.HEARING.radiusCm)) continue;
    if (!best || sound.time > best.time) best = sound;
  }
  return best;
}
export function notices(a, b) {
  return a.canSee({
    x: b.x,
    y: b.y
  }) || a.canSee(b.eye) || a.canSee(b.center);
}
