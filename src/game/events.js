import {fighterLabel} from './patients.js';
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
    const name = fighterLabel(data.robot);
    if (data.segment === 'head') arenaAnnounce('ПАЦИЕНТ ' + name, 'БЕЗ ГОЛОВЫ', 2, 2);else arenaAnnounce('ПАЦИЕНТ ' + name, 'ПОТЕРЯЛ КОНЕЧНОСТЬ', 1, 1.3);
  } else if (type === 'robot-immobilized') arenaAnnounce('ПАЦИЕНТ ' + fighterLabel(data.robot), 'ВЫБЫЛ', 3, 2);else if(type==='combat-end'&&ctx.mode==='tower')arenaAnnounce('БАШНЯ',data.winner===0?'ПОБЕДА':'ПОРАЖЕНИЕ',5,4);else if (type === 'combat-end') arenaAnnounce(data.winner === null ? 'НИЧЬЯ' : 'ПОБЕДИТЕЛЬ', data.winner === null ? 'НЕТ ВЫЖИВШИХ' : 'ПАЦИЕНТ ' + fighterLabel(data.winner), 5, 4);
}
