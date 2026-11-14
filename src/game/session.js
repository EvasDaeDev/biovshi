import {garageOpen} from '../garage/ui.js';
import {bettingOpen} from '../betting/ui.js';
import {resetCombatLog} from '../ui/combat-log.js';
import {bakeRoundFloor} from '../render/floor-history.js';
import { setTimeScale } from "../ui/controls.js";
import { resetFrameClock } from "./clock.js";
import { ctx } from "./state.js";
import { resetCombatAccents } from "../render/effects.js";
import { attr } from "../render/svg.js";
import { rebuildRobots } from "./arena.js";
import { cameraReset } from "../render/camera.js";
import { bettingInit } from "../betting/ui.js";
import { CONFIG } from "../config.js";
import {note} from "./events.js";
import { paint } from "../render/frame.js";
import { random } from "../utils/random.js";
import { resetHitEffects } from '../render/hit-effects.js';
export async function resetRound(destination='betting') {
  if(ctx.floorBaking)return;
  if(ctx.combat.finished){
    ctx.floorBaking=true;
    ctx.resultsAgain.disabled=true;if(ctx.resultsProcedure)ctx.resultsProcedure.disabled=true;
    const controller=new AbortController();let timeout;
    ctx.lastFloorBakeError='';
    try{
      await Promise.race([
        bakeRoundFloor({signal:controller.signal}),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(Error('Floor baking timed out'));},5000);})
      ]);
    }
    catch(error){
      console.warn('Floor baking:',error);
      ctx.lastFloorBakeError='Следы последнего боя не удалось добавить. Предыдущий пол сохранён; можно продолжить игру.';
    }finally{clearTimeout(timeout);controller.abort();ctx.floorBaking=false;ctx.resultsAgain.disabled=false;if(ctx.resultsProcedure)ctx.resultsProcedure.disabled=false;}
  }
  ctx.afterSetup=destination;ctx.exhibition=false;resetCombatLog();ctx.streamerMascot?.reset();
  ctx.telemetryDirty = true;
  ctx.lastTelemetryAt = -Infinity;
  ctx.settledOilDrops = new WeakSet();
  ctx.round.elapsedSec = 0;
  ctx.resultsPanel.hidden = true;
  ctx.game.time = 0;
  resetCombatAccents();
  resetHitEffects();
  ctx.combat.unarmedDeadline.fill(null);
  ctx.combat.finished = false;
  ctx.combat.winner = null;
  ctx.combat.finishedAt = null;
  ctx.combat.celebrationUntil = 0;
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
  ctx.oilG.replaceChildren();
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
    headGuardUntil: 0,
    headGuardCooldownUntil: 0,
    lastHitAt: -100,
    profile: null,
    side: 0,
    sideUntil: 0,
    sideTarget: null,
    pursuitTarget: null,
    bestPursuitDistance: null,
    progressAt: 0,
    orbitBreakUntil: 0,
    orbitGoal: null,
    nextPounceDecisionAt: 0
  }));
  ctx.combat.escapeSide = ctx.combat.escapeSide.map(() => random() < .5 ? -1 : 1);
  ctx.intents = [];
  ctx.brainDebt = 0;
  ctx.pulses.length = 0;
  ctx.sparks.length = 0;
  ctx.paused = false;
  setTimeScale(1);
  ctx.button.textContent = 'Пауза';
  attr(ctx.button, 'aria-pressed', 'false');
  resetFrameClock();
  ctx.paintAt = -Infinity;
  rebuildRobots();
  cameraReset();
  if(destination==='procedure')garageOpen();else bettingOpen();
  ctx.arenaRenderer?.render();
}
// Новая случайная последовательность при каждой загрузке, без фиксированного seed.
export function advanceStartup(dt) {
  if (ctx.startup.phase !== 'spawning' || ctx.settingsOpen || ctx.tutorial?.active) return;
  ctx.startup.elapsed += dt;
  while (ctx.startup.nextIndex < ctx.startup.order.length && ctx.startup.elapsed + 1e-9 >= ctx.startup.nextIndex * CONFIG.startup.spawnIntervalSec) {
    const index = ctx.startup.nextIndex++;
    ctx.robots[ctx.startup.order[index]].setVisible(true,index*CONFIG.startup.spawnIntervalSec);
  }
  const landedAt = Math.max(0,ctx.startup.order.length-1)*CONFIG.startup.spawnIntervalSec + CONFIG.startup.spawnDurationSec;
  if (ctx.startup.nextIndex === ctx.startup.order.length && ctx.startup.elapsed+1e-9 >= landedAt) {
    ctx.startup.phase = 'running';
    note('combat-start', {});
    ctx.button.disabled = ctx.resetButton.disabled = false;
    ctx.speedButton.disabled=ctx.mode==='tower';
  }
  paint();
}
export function startSpawnSequence() {
  ctx.intro.hidden = true;
  ctx.startup.phase = 'spawning';
  ctx.startup.order = ctx.robots.map(r => r.id).sort(() => random() - .5);
  ctx.startup.elapsed = 0;
  ctx.startup.nextIndex = 0;
  ctx.button.disabled = ctx.speedButton.disabled = ctx.resetButton.disabled = true;
  advanceStartup(0);
}
export function beginGame() {
  if (ctx.startup.phase !== 'intro') return;
  bettingInit();
}
