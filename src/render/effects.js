import { clamp, smooth } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { attr, dot, el } from "./svg.js";
import { path } from "../utils/math.js";
import { strikeProgress } from "../systems/combat.js";
import { oilColor } from "../utils/colors.js";
import { random } from "../utils/random.js";
import { drawDetachedSkin } from './robot-skin.js';
import { createLiquidSprite, paintLiquidSprite } from './liquid-sprites.js';
export
// Эффекты Geometry Wars используют отдельные частицы и не влияют на ИИ.
function burst(x, y) {
  if (!CONFIG.rendering.sparks) return;
  for (let i = 0; i < CONFIG.effects.particleCount; i++) {
    const a = i * Math.PI * (3 - Math.sqrt(5)),
      speed = (45 + i % 7 * 14) * CONFIG.effects.particleSpread;
    ctx.sparks.push({
      x,
      y,
      time: ctx.game.time,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      kind: i % 3,
      color: ['#65eeff', '#ff397b', '#ffe66d', '#b961ff'][i % 4]
    });
  }
  while (ctx.sparks.length > CONFIG.effects.particleLimit) ctx.sparks.shift();
}
export function updateSparks() {
  if (!CONFIG.rendering.sparks) return;
  for (let i = ctx.sparks.length - 1; i >= 0; i--) if (ctx.game.time - ctx.sparks[i].time > CONFIG.effects.particleLifeSec) ctx.sparks.splice(i, 1);
  for (let i = 0; i < CONFIG.effects.particleLimit; i++) {
    const p = ctx.sparks[i],
      e = ctx.sparkNodes[i];
    if (!p) {
      attr(e, 'opacity', 0);
      continue;
    }
    const age = ctx.game.time - p.time,
      q = age / CONFIG.effects.particleLifeSec,
      x = p.x + p.vx * age,
      y = p.y + p.vy * age,
      z = 2.5 * (1 - q) + .6;
    const points = p.kind === 0 ? [{
      x: x - z,
      y
    }, {
      x,
      y: y - z
    }, {
      x: x + z,
      y
    }, {
      x,
      y: y + z
    }, {
      x: x - z,
      y
    }] : p.kind === 1 ? [{
      x: x - z,
      y: y + z
    }, {
      x,
      y: y - z
    }, {
      x: x + z,
      y: y + z
    }, {
      x: x - z,
      y: y + z
    }] : [{
      x,
      y
    }, {
      x: x - p.vx * .04,
      y: y - p.vy * .04
    }];
    attr(e, 'd', path(points));
    attr(e, 'stroke', p.color);
    attr(e, 'opacity', Math.pow(1 - q, 1.5));
  }
}
export function updatePulses() {
  for (let i = ctx.pulses.length - 1; i >= 0; i--) if (ctx.game.time - ctx.pulses[i].time > CONFIG.effects.waveSec) ctx.pulses.splice(i, 1);
  for (let i = 0; i < 6; i++) {
    const p = ctx.pulses[i];
    if (!p) {
      attr(ctx.pulseNodes[i], 'opacity', 0);
      continue;
    }
    const q = clamp((ctx.game.time - p.time) / CONFIG.effects.waveSec, 0, 1);
    dot(ctx.pulseNodes[i], p, 5 + q * 30);
    attr(ctx.pulseNodes[i], 'opacity', (1 - q) * .28);
  }
}
// Неудачная атака не должна немедленно возобновляться от того же касания лап.

// Выполняется после движения: охотник доводит прыжок к актуальному положению жертвы.
export function paintSwings() {
  for (let id = 0; id < ctx.ROBOT_COUNT; id++) {
    const e = ctx.swingLines[id],
      p = ctx.combat.pending[id];
    if (!p) {
      attr(e, 'opacity', 0);
      continue;
    }
    const r = ctx.robots[id],
      pose = r.attackPose(p);
    if (!pose) {
      attr(e, 'opacity', 0);
      continue;
    }
    // Короткий след именно за ударяющей конечностью, а не «луч к цели».
    const from = pose.kind === 'arm' ? pose.shoulder : pose.base;
    attr(e, 'd', path([from, pose.tip]));
    const phase = strikeProgress(p);
    attr(e, 'opacity', phase.phase === 'thrust' ? .28 : 0);
  }
}
export function createOilDrop(robotId, x, y, baseRadius) {
  const sprite=createLiquidSprite(robotId,x,y,baseRadius);
  const node = sprite?.node??el('circle', {
    cx: x,
    cy: y,
    r: baseRadius,
    fill: oilColor(robotId),
    opacity: .92
  }, ctx.oilG);
  ctx.combat.oilDrops.push({
    node,
    sprite,
    robot: robotId,
    born: ctx.game.time,
    x,
    y,
    baseRadius,
    maxRadius: baseRadius * CONFIG.oil.growFactor,
    baseOpacity: .92
  });
}
export function paintOil() {
  for (const leak of ctx.combat.oilLeaks) {
    const robot = ctx.robots[leak.robot];
    if (!robot?.visible || !robot.mobile) continue;
    while (ctx.game.time >= leak.nextAt) {
      const origin = robot.leakOrigin(leak.key);
      const angle = random() * Math.PI * 2,
        distance = random() * 4.5;
      const x = origin.x + Math.cos(angle) * distance,
        y = origin.y + Math.sin(angle) * distance;
      const jitter = 1 + (random() * 2 - 1) * CONFIG.oil.sizeJitter;
      const baseRadius = (2.8 + random() * 1.8) * jitter * 0.7 * CONFIG.oil.dropSizeScale;
      createOilDrop(leak.robot, x, y, baseRadius);
      leak.nextAt += CONFIG.oil.minIntervalSec + random() * (CONFIG.oil.maxIntervalSec - CONFIG.oil.minIntervalSec);
    }
  }
  for (const drop of ctx.combat.oilDrops) {
    if (ctx.settledOilDrops?.has(drop)) continue;
    const q = smooth((ctx.game.time - drop.born) / CONFIG.oil.spreadSec);
    const radius = drop.baseRadius + (drop.maxRadius - drop.baseRadius) * q;
    const opacity = drop.baseOpacity * (1 - 0.5 * q);
    const dry=smooth((ctx.game.time-drop.born)/CONFIG.oil.drySec);
    if(drop.sprite)paintLiquidSprite(drop,radius,dry);
    else {
      attr(drop.node,'fill',oilColor(drop.robot,.9,dry));
      attr(drop.node, 'r', radius.toFixed(2));
    }
    attr(drop.node, 'opacity', opacity.toFixed(3));
    if (q >= 1 && dry >= 1) ctx.settledOilDrops?.add(drop);
  }
}
export function paintDetachedAnatomy() {
  // Remains on the arena for the whole round. World-space snapshot; no collisions.
  for (let i = ctx.detachedG.childNodes.length; i < ctx.combat.detached.length; i++) {
    const part = ctx.combat.detached[i];
    const group = el('g', {
      'data-owner': String(part.id),
      'data-detached-by': part.cause
    }, ctx.detachedG);
    for (const piece of part.pieces) {
      if (piece.skin&&drawDetachedSkin(piece.skin,group)) continue;
      const g = piece.geometry;
      if (g.kind === 'head') el('circle', {
        cx: g.x,
        cy: g.y,
        r: g.r,
        fill: '#06141b',
        stroke: '#7796a0',
        'stroke-width': 2.2,
        opacity: .88
      }, group);else el('path', {
        d: path([g.a, g.b]),
        fill: 'none',
        stroke: '#7796a0',
        'stroke-width': g.w,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        opacity: .82
      }, group);
    }
  }
}
export function flashSeveredParts(geometries) {
  if (!geometries.length) return;
  // One short-lived group per severing, bounded even during simultaneous hits.
  while (ctx.arenaAccent.flashes.length >= 6) ctx.arenaAccent.flashes.shift().node.remove();
  const node = el('g', {
    fill: 'none',
    stroke: '#fff7db',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  }, ctx.severFlashG);
  for (const g of geometries) {
    if (g.kind === 'head') el('circle', {
      cx: g.x,
      cy: g.y,
      r: g.r,
      'stroke-width': 3
    }, node);else el('path', {
      d: path([g.a, g.b]),
      'stroke-width': Math.max(3, g.w + 2)
    }, node);
  }
  ctx.arenaAccent.flashes.push({
    node,
    at: ctx.game.time
  });
}
export function resetCombatAccents() {
  ctx.arenaAccent.message = null;
  ctx.arenaAccent.lastActive = ctx.ROBOT_COUNT;
  ctx.arenaAccent.flashes.length = 0;
  ctx.severFlashG.replaceChildren();
  ctx.scoreNodes.forEach(n => n.textContent = '');
  attr(ctx.scoreG, 'aria-label', 'Объявления арены');
}
export function paintCombatAccents() {
  for (let i = ctx.arenaAccent.flashes.length - 1; i >= 0; i--) {
    const f = ctx.arenaAccent.flashes[i],
      age = ctx.game.time - f.at;
    if (age >= .12) {
      f.node.remove();
      ctx.arenaAccent.flashes.splice(i, 1);
    } else attr(f.node, 'opacity', Math.max(0, 1 - age / .12).toFixed(2));
  }
  const message = ctx.arenaAccent.message,
    active = message && ctx.game.time < message.until;
  ctx.scoreNodes.forEach((node, i) => {
    const text = active ? message.lines[i] : '';
    if (node.textContent !== text) node.textContent = text;
    if (text.length > 11) attr(node, 'textLength', 106);else node.removeAttribute('textLength');
    node.style.setProperty('fill', active && message.priority === 5 ? '#e1cf9a' : '#d2d5bf');
    attr(node, 'opacity', active ? Math.min(1, (message.until - ctx.game.time) / .25) : 0);
  });
  attr(ctx.scoreG, 'aria-label', active ? message.lines.join(' · ') : 'Объявления арены');
}
