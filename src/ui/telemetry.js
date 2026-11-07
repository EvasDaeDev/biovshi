import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
export function makeRobotCard(id) {
  const card = document.createElement('section');
  card.className = 'robot-card';
  card.style.setProperty('--accent', ['#65eeff', '#ffb36b', '#ff397b', '#b961ff'][id]);
  card.innerHTML = `<div class="robot-card-header"><div class="robot-card-name"><strong>${String.fromCharCode(65 + id)}</strong></div><div class="robot-card-action">Ожидает выхода на арену</div><div class="robot-card-score"><div class="robot-card-segments">13/13</div></div></div><div class="robot-card-metrics"><div class="metric-box"><div class="metric-inline"><span class="metric-icon" aria-label="Давление масла" title="Давление масла">💧</span><span class="metric-value js-pressure-value">100%</span></div><div class="mini-track"><div class="mini-fill js-pressure-fill" style="width:100%"></div></div></div><div class="metric-box"><div class="metric-inline"><span class="metric-icon" aria-label="Ходовая часть" title="Ходовая часть">⚙</span><span class="metric-value js-mobility">4/4 · 100%</span></div><div class="mini-track"><div class="mini-fill js-mobility-fill" style="width:100%"></div></div></div></div><div class="robot-card-body"><div class="schematic-wrap"><svg class="robot-schematic" viewBox="0 0 260 106" preserveAspectRatio="xMidYMid meet" aria-label="Схема сегментов робота"><rect class="module-segment module-spine" data-segment="spine-0" x="156" y="40" width="19" height="24"/><rect class="module-segment module-spine" data-segment="spine-1" x="133" y="40" width="19" height="24"/><rect class="module-segment module-spine" data-segment="spine-2" x="110" y="40" width="19" height="24"/><rect class="module-segment module-spine" data-segment="spine-3" x="87" y="40" width="19" height="24"/><path class="module-segment module-limb" data-segment="arm--1-upper" d="M174 40 L198 18"/><path class="module-segment module-limb" data-segment="arm--1-lower" d="M198 18 L237 18"/><path class="module-segment module-limb" data-segment="arm-1-upper" d="M174 64 L198 88"/><path class="module-segment module-limb" data-segment="arm-1-lower" d="M198 88 L237 88"/><path class="module-segment module-limb" data-segment="leg--1-upper" d="M88 40 L64 18"/><path class="module-segment module-limb" data-segment="leg--1-lower" d="M64 18 L22 18"/><path class="module-segment module-limb" data-segment="leg-1-upper" d="M88 64 L64 88"/><path class="module-segment module-limb" data-segment="leg-1-lower" d="M64 88 L22 88"/><circle class="module-segment module-head" data-segment="head" cx="201" cy="52" r="17"/></svg></div></div>`;
  ctx.roles.appendChild(card);
  const moduleSegments = Array.from(card.querySelectorAll('[data-segment]'));
  return {
    card,
    segments: card.querySelector('.robot-card-segments'),
    action: card.querySelector('.robot-card-action'),
    pressureValue: card.querySelector('.js-pressure-value'),
    pressureFill: card.querySelector('.js-pressure-fill'),
    mobility: card.querySelector('.js-mobility'),
    mobilityFill: card.querySelector('.js-mobility-fill'),
    moduleSegments
  };
}
export function moduleSnapshot(robot, keys) {
  const max = keys.reduce((sum, key) => sum + robot.maxHp(key), 0);
  let sum = 0,
    alive = 0;
  for (const key of keys) {
    const value = Math.max(0, robot.hp.get(key) ?? 0);
    sum += value;
    if (value > 0) alive++;
  }
  const ratio = max ? sum / max : 0;
  return {
    sum,
    max,
    ratio,
    alive,
    count: keys.length
  };
}
export function classifyModule(snapshot) {
  if (snapshot.alive === 0) return 'off';
  if (snapshot.ratio > .66) return 'good';
  if (snapshot.ratio > .33) return 'warn';
  return 'bad';
}
export function moduleVisualColor(state) {
  return state === 'good' ? '#59f38a' : state === 'warn' ? '#ffd84a' : state === 'bad' ? '#ff6767' : '#738397';
}
export function segmentDisplayState(robot, key) {
  const group = ctx.schematicModuleMap[key] || [key];
  const values = group.map(k => Math.max(0, robot.hp.get(k) ?? 0));
  const health = Math.max(0, robot.hp.get(key) ?? 0);
  const total = values.reduce((a, b) => a + b, 0);
  const alive = values.filter(v => v > 0).length;
  const groupMax = group.reduce((sum, key) => sum + robot.maxHp(key), 0);
  if (health === 0) return {
    state: 'off',
    color: '#697c90',
    opacity: '0.65',
    dash: '3 3'
  };
  const ratio = groupMax ? total / groupMax : 0;
  const state = ratio > .66 ? 'good' : ratio > .33 ? 'warn' : 'bad';
  return {
    state,
    color: moduleVisualColor(state),
    opacity: alive < group.length ? '0.90' : '1',
    dash: 'none'
  };
}
export function moduleBadge(snapshot) {
  if (snapshot.alive === 0) return 'нет';
  if (snapshot.count === 1) return `${Math.round(snapshot.ratio * 100)}%`;
  return `${snapshot.alive}/${snapshot.count}`;
}
export function friendlyAction(robot) {
  const deadline = ctx.combat.unarmedDeadline[robot.id];
  if (!robot.visible) return 'Ожидает выхода на арену';
  if (!robot.mobile) return 'Обездвижен';
  if (deadline !== null) return `Истекает маслом · ${Math.ceil(Math.max(0, deadline - ctx.game.time))} с`;
  if (ctx.combat.pending[robot.id]) return 'Наносит удар';
  if (!robot.hasHead) return 'Слепой режим';
  const map = {
    wander: 'Ищет врага',
    retreat: 'Отступает',
    flank: 'Заходит во фланг',
    pursue: 'Преследует',
    hold: 'Держит дистанцию',
    circle: 'Маневрирует',
    fight: 'Ведёт бой',
    patrol: 'Патрулирует',
    investigate: 'Проверяет шум',
    flee: 'Убегает',
    escape: 'Уходит из контакта'
  };
  return map[robot.state] || String(robot.state || 'Маневрирует').replace(/-/g, ' ');
}
export function oilPressure(robot) {
  const total = robot.damageableHpTotal;
  let live = 0;
  for (const [key, value] of robot.hp) if (robot.isDamageable(key)) live += Math.max(0, value);
  let ratio = total ? live / total : 0;
  const deadline = ctx.combat.unarmedDeadline[robot.id];
  if (!robot.mobile) ratio = 0;else if (deadline !== null) {
    const panic = clamp((deadline - ctx.game.time) / 30, 0, 1);
    ratio = Math.min(ratio, panic);
  }
  return clamp(ratio, 0, 1);
}
