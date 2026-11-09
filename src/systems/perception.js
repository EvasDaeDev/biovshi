import { ctx } from "../game/state.js";
import { sightClear } from "./collision.js";
import { emitGameEvent } from '../game/event-bus.js';
import { random } from "../utils/random.js";
export function updateFootsteps() {
  for (const r of ctx.robots) {
    if (!r.visible || !r.mobile) continue;
    const v = Math.hypot(r.velocity.x, r.velocity.y);
    if (v < ctx.HEARING.minMoveCmSec) continue;
    if (ctx.game.time < ctx.nextFootstepAt[r.id]) continue;
    emitGameEvent('footstep',{robot:r.id,dragging:!r.limbs.some(l=>l.kind==='leg'),time:ctx.game.time});
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
