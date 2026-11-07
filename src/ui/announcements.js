import { ctx } from "../game/state.js";
export function arenaAnnounce(top, bottom, priority = 1, duration = 1.5) {
  const old = ctx.arenaAccent.message;
  if (old && ctx.game.time < old.until && (old.priority > priority || old.priority === priority && ctx.game.time - old.started < .8)) return;
  ctx.arenaAccent.message = {
    lines: [top, bottom],
    priority,
    started: ctx.game.time,
    until: ctx.game.time + duration
  };
}
