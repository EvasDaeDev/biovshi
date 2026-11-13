import {patientCombatStats} from '../game/patients.js';
import {SKILLS,skillValue,skillHint} from './patient.js';
import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { friendlyAction, segmentDisplayState } from './telemetry.js';
import { PORTRAIT_BONES,paintPatientPortrait } from './patient-portrait.js';
const setText = (node, value) => { if (node.textContent !== value) node.textContent = value; };
const setClass = (node,key,on) => {if(node.classList.contains(key)!==on)node.classList.toggle(key,on);};
const formatTrauma = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:1});
const setAttribute = (node,key,value) => {if(node.getAttribute(key)!==value)node.setAttribute(key,value);};

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
    const stats=patientCombatStats(r.id,r);
    for(const [index,node] of [[0,card.speed],[1,card.strength],[2,card.maneuver]]){
      const value=skillValue(stats,index),field=node.parentElement;
      setText(node,value);
      setClass(field,'is-prosthetic',stats.count>0);
      setAttribute(field,'data-hint',skillHint(stats,index));
      setAttribute(field,'aria-label',`${SKILLS[index].name}: ${value}`);
    }
    const {enabled,threshold}=CONFIG.combat.trauma;
    const traumaHidden=!enabled;
    if(card.trauma.hidden!==traumaHidden)card.trauma.hidden=traumaHidden;
    if(enabled){
      const value=Math.min(threshold,Math.max(0,r.trauma??0)),ratio=value/threshold;
      setText(card.traumaValue,`${formatTrauma.format(value)} / ${formatTrauma.format(threshold)}`);
      setAttribute(card.traumaTrack,'aria-valuemax',String(threshold));
      setAttribute(card.traumaTrack,'aria-valuenow',String(value));
      setAttribute(card.traumaTrack,'aria-valuetext',`${formatTrauma.format(value)} из ${formatTrauma.format(threshold)}${r.unconscious?' · без сознания':!r.hasHead?' · погиб':''}`);
      setAttribute(card.trauma,'data-severity',ratio>=.75?'critical':ratio>=.5?'warning':'low');
      const fill=`scaleX(${ratio})`;
      if(card.traumaFill.style.transform!==fill)card.traumaFill.style.transform=fill;
    }
    setClass(card.card,'bleeding', ctx.combat.unarmedDeadline[r.id] !== null && r.mobile);
    setClass(card.card,'disabled', !r.mobile);
    paintPatientPortrait(card,r.id,PORTRAIT_BONES.map(({key})=>({key,...segmentDisplayState(r,key)})));
  }
}
