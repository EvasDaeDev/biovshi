import {patientName} from './patient.js';
import { TELEMETRY_COLOURS } from './telemetry-colours.js';
import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { ROBOT_COLORS } from '../utils/colors.js';
export function makeRobotCard(id) {
  const card = document.createElement('section');
  card.className = 'robot-card';
  card.style.setProperty('--accent', ROBOT_COLORS[id]);
  card.innerHTML = `<div class="robot-card-header"><div class="robot-card-name"><strong>${patientName(id,{short:true})}</strong></div><div class="robot-card-action">Ожидает выхода на арену</div><div class="robot-card-score"><span aria-hidden="true">🦴</span> <span class="robot-card-segments">13/13</span></div></div>
  <div class="robot-card-body"><div class="portrait-wrap"><canvas class="patient-portrait" width="280" height="224" role="img" aria-label="Пациент ${String.fromCharCode(65+id)}"></canvas></div>
  <div class="patient-skills" aria-label="Умения пациента">
  <div aria-label="Сила" title="Сила определяет шанс критического урона (КРИТ)"><span aria-hidden="true">💪</span><span class="js-strength">3 · 15% КРИТ</span></div>
  <div aria-label="Скорость" title="Скорость движения"><span aria-hidden="true">→</span><span class="js-speed">3 · 100%</span></div>
  <div aria-label="Маневренность" title="Маневренность · скорость поворота"><span aria-hidden="true">↻</span><span class="js-maneuver">3 · 100%</span></div></div></div>`;
  ctx.roles.appendChild(card);
  return {
    card,
    segments: card.querySelector('.robot-card-segments'),
    action: card.querySelector('.robot-card-action'),
    strength:card.querySelector('.js-strength'),
    speed:card.querySelector('.js-speed'),
    maneuver:card.querySelector('.js-maneuver'),
    portrait:card.querySelector('.patient-portrait')
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
  return TELEMETRY_COLOURS[state];
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
  if (!robot.hasHead) return 'Погиб';
  if (!robot.mobile) return 'Без сознания';
  if (deadline !== null) return `Теряет сознание · ${Math.ceil(Math.max(0, deadline - ctx.game.time))} с`;
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
