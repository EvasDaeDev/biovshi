import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { friendlyAction, oilPressure, segmentDisplayState } from './telemetry.js';
import { attr } from '../render/svg.js';
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const setClass = (node,key,on) => {if(node.classList.contains(key)!==on)node.classList.toggle(key,on);};
const setWidth = (node, value) => { if (node.style.width !== value) node.style.width = value; };

export function paintTelemetry() {
  if(ctx.telemetryEnabled===false)return;
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
    const pressure = oilPressure(r);
    const pressurePct = Math.round(pressure * 100);
    if (card.pressureValue.textContent !== pressurePct + '%') card.pressureValue.textContent = pressurePct + '%';
    setWidth(card.pressureFill, pressurePct + '%');
    const mobilityPct = Math.round(r.locomotion * 100);
    setText(card.mobility, `${r.movementLimbs}/4 · ${mobilityPct}%`);
    setWidth(card.mobilityFill, mobilityPct + '%');
    setClass(card.card,'bleeding', ctx.combat.unarmedDeadline[r.id] !== null && r.mobile);
    setClass(card.card,'disabled', !r.mobile);
    for (const node of card.moduleSegments) {
      const segmentKey = node.getAttribute('data-segment');
      const display = segmentDisplayState(r, segmentKey);
      attr(node, 'stroke', display.color);
      attr(node, 'opacity', display.opacity);
      attr(node, 'stroke-dasharray', display.dash);
      if (node.tagName === 'path') {
        attr(node, 'stroke-width', display.state === 'off' ? '2.52' : '9');
      } else {
        attr(node, 'stroke-width', display.state === 'off' ? '2.16' : '3.6');
      }
    }
  }
}
