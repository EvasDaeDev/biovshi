import { emitGameEvent } from './event-bus.js';
import { ctx } from "./state.js";
export function note(type, data) {
  if (['hit', 'segment-broken', 'robot-immobilized', 'combat-end'].includes(type)) ctx.telemetryDirty = true;
  emitGameEvent(type, { ...data, time: ctx.game.time });
  ctx.game.events.push({
    type,
    time: ctx.game.time,
    ...data
  });
  if (ctx.game.events.length > 40) ctx.game.events.shift();
}
