import { emitGameEvent } from './event-bus.js';
import { ctx } from "./state.js";
import { arenaAnnounce } from "../ui/announcements.js";
export function note(type, data) {
  if (['hit', 'segment-broken', 'robot-immobilized', 'combat-end'].includes(type)) ctx.telemetryDirty = true;
  emitGameEvent(type, { ...data, time: ctx.game.time });
  ctx.game.events.push({
    type,
    time: ctx.game.time,
    ...data
  });
  if (ctx.game.events.length > 40) ctx.game.events.shift();
  if (type === 'segment-broken') {
    const name = String.fromCharCode(65 + data.robot);
    if (data.segment === 'head') arenaAnnounce('РОБОТ ' + name, 'БЕЗ ГОЛОВЫ', 2, 2);else arenaAnnounce('РОБОТ ' + name, 'ПОТЕРЯЛ ЗВЕНО', 1, 1.3);
  } else if (type === 'robot-immobilized') arenaAnnounce('РОБОТ ' + String.fromCharCode(65 + data.robot), 'ВЫБЫЛ', 3, 2);else if (type === 'combat-end') arenaAnnounce(data.winner === null ? 'НИЧЬЯ' : 'ПОБЕДИТЕЛЬ', data.winner === null ? 'НЕТ ВЫЖИВШИХ' : 'РОБОТ ' + String.fromCharCode(65 + data.winner), 5, 4);
}
