import {patientGarage} from '../game/patients.js';
import {statMultiplier,critChance} from '../garage/model.js';
import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { friendlyAction, segmentDisplayState } from './telemetry.js';
import { PORTRAIT_BONES,paintPatientPortrait } from './patient-portrait.js';
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const setClass = (node,key,on) => {if(node.classList.contains(key)!==on)node.classList.toggle(key,on);};

export function paintTelemetry() {
  if(ctx.telemetryEnabled===false||ctx.arenaExpanded)return;
  const now=ctx.telemetryNow?.()??performance.now()/1000;
  if (!ctx.telemetryDirty && ctx.telemetryRobots === ctx.robots[0] && now >= ctx.lastTelemetryAt && now - ctx.lastTelemetryAt < CONFIG.rendering.telemetryIntervalSec) return;
  ctx.telemetryDirty = false;
  ctx.telemetryRobots = ctx.robots[0];
  ctx.lastTelemetryAt = now;
  for (const r of ctx.robots) {
    const n = r.segmentCount;
    const card = ctx.cardNodes[r.id];
    if (card.card.hidden) card.card.hidden = false;
    setText(card.segments, `${n}/${r.segmentTotal}`);
    const actionText = friendlyAction(r);
    if (card.action.textContent !== actionText) card.action.textContent = actionText;
    const stats=patientGarage()?.[r.id]?.stats??[3,3,3];
    setText(card.strength,`${stats[1]} · ${Math.round(critChance(stats[1])*100)}% КРИТ`);
    setText(card.speed,`${stats[0]} · ${Math.round(statMultiplier(stats[0])*100)}%`);
    setText(card.maneuver,`${stats[2]} · ${Math.round(statMultiplier(stats[2])*100)}%`);
    setClass(card.card,'bleeding', ctx.combat.unarmedDeadline[r.id] !== null && r.mobile);
    setClass(card.card,'disabled', !r.mobile);
    paintPatientPortrait(card,r.id,PORTRAIT_BONES.map(({key})=>({key,...segmentDisplayState(r,key)})));
  }
}
