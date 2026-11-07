import { ctx } from "./state.js";
import { resetCombatAccents } from "../render/effects.js";
import { attr } from "../render/svg.js";
import { rebuildRobots } from "./arena.js";
import { cameraReset } from "../render/camera.js";
import { bettingInit, bettingOpen } from "../betting/ui.js";
import { CONFIG } from "../config.js";
import { arenaAnnounce } from "../ui/announcements.js";
import { paint } from "../render/frame.js";
import { random } from "../utils/random.js";
export function resetRound() {
  ctx.telemetryDirty = true;
  ctx.lastTelemetryAt = -Infinity;
  ctx.settledOilDrops = new WeakSet();
  // Каждый новый раунд заново разыгрывает роль водящего между всеми четырьмя.
  const hunter = -1;
  ctx.round.elapsedSec = 0;
  ctx.resultsPanel.hidden = true;
  Object.assign(ctx.game, {
    time: 0,
    hunter,
    tags: 0,
    readyAt: 0,
    ceremony: null,
    target: null,
    pursuitAt: 0,
    pursuitDistance: 0,
    lastSeen: null,
    lostFor: 0,
    cornerReleases: 0,
    switches: 0
  });
  ctx.game.scores.fill(0);
  ctx.game.immune.fill(0);
  ctx.game.lastPursued.fill(-99);
  resetCombatAccents();
  ctx.combat.unarmedDeadline.fill(null);
  ctx.combat.finished = false;
  ctx.combat.winner = null;
  ctx.combat.finishedAt = null;
  ctx.combat.nextStrike.fill(0);
  ctx.combat.pending.fill(null);
  ctx.combat.retreatUntil.fill(0);
  ctx.combat.retreatFrom.fill(-1);
  ctx.combat.focus.fill(-1);
  ctx.combat.focusUntil.fill(0);
  ctx.combat.strikes = 0;
  ctx.combat.hits = 0;
  ctx.combat.lastHitTime = 0;
  ctx.combat.fighterHits.fill(0);
  ctx.combat.fighterTaken.fill(0);
  ctx.combat.fighterSwings.fill(0);
  ctx.combat.lastPositions.fill(null);
  ctx.combat.stationaryFor.fill(0);
  ctx.combat.escapeUntil.fill(0);
  ctx.combat.escapeGoal.fill(null);
  ctx.combat.debris.length = 0;
  ctx.combat.detached.length = 0;
  ctx.detachedG.replaceChildren();
  ctx.combat.oilLeaks.length = 0;
  ctx.combat.oilDrops.length = 0;
  ctx.debrisG.replaceChildren();
  ctx.oilG.replaceChildren();
  ctx.game.bans.forEach(row => row.fill(0));
  ctx.game.events.length = 0;
  ctx.agentAI.forEach((ai, id) => Object.assign(ai, {
    goal: null,
    goalUntil: 0,
    patrolIndex: id,
    nextChoice: 0,
    threat: null,
    threatUntil: 0,
    yieldUntil: 0,
    yieldFrom: null,
    stuckAt: 0,
    lastPosition: null,
    moved: 0,
    seeingHunter: false,
    seenHunterId: null,
    wasFleeing: false,
    sensedPoint: null,
    sensedUntil: 0,
    sensedId: null,
    sensedType: null,
    searchHoldUntil: 0,
    lastSoundAt: -Infinity
  }));
  ctx.soundEvents.length = 0;
  ctx.nextFootstepAt.fill(0);
  ctx.intents = [];
  ctx.brainDebt = 0;
  ctx.pulses.length = 0;
  ctx.sparks.length = 0;
  ctx.paused = false;
  ctx.button.textContent = 'Пауза';
  attr(ctx.button, 'aria-pressed', 'false');
  ctx.debt = 0;
  ctx.paintAt = -Infinity;
  rebuildRobots();
  cameraReset();
  bettingOpen();
}
// Новая случайная последовательность при каждой загрузке, без фиксированного seed.
export function advanceStartup(dt) {
  if (ctx.startup.phase !== 'spawning') return;
  ctx.startup.elapsed += dt;
  while (ctx.startup.nextIndex < ctx.startup.order.length && ctx.startup.elapsed + 1e-9 >= ctx.startup.nextIndex * CONFIG.startup.spawnIntervalSec) {
    ctx.robots[ctx.startup.order[ctx.startup.nextIndex++]].setVisible(true);
  }
  if (ctx.startup.nextIndex === ctx.startup.order.length) {
    ctx.startup.phase = 'running';
    arenaAnnounce('БОЙ', 'НАЧАЛСЯ', 1, 1.4);
    ctx.button.disabled = ctx.resetButton.disabled = false;
  }
  paint();
}
export function startSpawnSequence() {
  ctx.intro.hidden = true;
  ctx.startup.phase = 'spawning';
  ctx.startup.order = ctx.robots.map(r => r.id).sort(() => random() - .5);
  ctx.startup.elapsed = 0;
  ctx.startup.nextIndex = 0;
  ctx.button.disabled = ctx.resetButton.disabled = true;
  advanceStartup(0);
}
export function beginGame() {
  if (ctx.startup.phase !== 'intro') return;
  bettingInit();
}
