import { timed } from '../render/diagnostics.js';
import { updateOilLeaks } from '../render/effects.js';
import { recordFrame } from '../render/performance.js';
import { ctx } from "./state.js";
import { showResults } from "../ui/results.js";
import { CONFIG } from "../config.js";
import { random } from "../utils/random.js";
import { note } from "./events.js";
import { activeOpponents, fighterIntent, fleeAllAttackers, patrol, tacticalEscape } from "../systems/ai.js";
import { updateFootsteps } from "../systems/perception.js";
import { combatAttacks } from "../systems/combat.js";
import { advanceStartup } from "./session.js";
import { paint } from "../render/frame.js";
import { cameraUpdate } from "../render/camera.js";
export function step(dt) {
  if (ctx.startup.phase !== 'running' || ctx.orientationBlocked || ctx.settingsOpen) return;
  if (ctx.combat.finished) {
    // Отдельный таймер не нужен: продолжаем время анимации, не меняя итоговую длительность боя.
    ctx.game.time += dt;
    // Keep the victorious patient's chosen idle gesture moving beneath the glow.
    const winner=ctx.robots[ctx.combat.winner];
    if(winner?.mobile)winner.tick(dt,{mode:'wander',speed:0,goal:{x:winner.center.x,y:winner.center.y},lookPoint:null});
    if (ctx.combat.finishedAt !== null && ctx.game.time - ctx.combat.finishedAt >= 3) showResults();
    return;
  }
  ctx.round.elapsedSec += dt;
  ctx.game.time += dt;
  ctx.brainDebt += dt;
  for (const r of ctx.robots) {
    if (!r.visible || !r.mobile) {
      ctx.combat.unarmedDeadline[r.id] = null;
      continue;
    }
    if (r.movementLimbs > 0) {
      ctx.combat.unarmedDeadline[r.id] = null;
      continue;
    }
    if (ctx.combat.unarmedDeadline[r.id] === null) {
      const cfg = CONFIG.combat;
      const duration = cfg.unarmedFailureMinSec + random() * (cfg.unarmedFailureMaxSec - cfg.unarmedFailureMinSec);
      ctx.combat.unarmedDeadline[r.id] = ctx.game.time + duration;
      note('unarmed-failure-start', {
        robot: r.id,
        duration
      });
    } else if (ctx.game.time >= ctx.combat.unarmedDeadline[r.id]) {
      r.failFromOilLoss();
    }
  }
  if (ctx.brainDebt >= .1 || !ctx.intents.length) {
    ctx.brainDebt = 0;
    ctx.intents = ctx.robots.map(fighterIntent);
  }
  for (const r of ctx.robots) r.tick(dt, ctx.intents[r.id]);
  updateFootsteps();
  // Detect an actual locomotion deadlock (not just lack of a target).
  // Change navigation goal and flank, rather than leaving the AI in speed=0 mode.
  for (const r of ctx.robots) {
    if (!r.visible || !r.mobile) continue;
    const id = r.id,
      old = ctx.combat.lastPositions[id];
    if (old) {
      const moved = Math.hypot(r.x - old.x, r.y - old.y);
      const wantsMove = ctx.intents[id]?.speed > 5;
      if (wantsMove && moved < Math.max(.035, r.locomotion * .09) || !wantsMove && ctx.intents[id]?.mode === 'держит дистанцию' && ctx.game.time - ctx.combat.lastHitTime > 2) ctx.combat.stationaryFor[id] += dt;else ctx.combat.stationaryFor[id] = Math.max(0, ctx.combat.stationaryFor[id] - dt * 2);
      if (ctx.combat.stationaryFor[id] > 2.5) {
        const foe = activeOpponents(id).sort((a, b) => Math.hypot(a.x - r.x, a.y - r.y) - Math.hypot(b.x - r.x, b.y - r.y))[0];
        ctx.combat.escapeSide[id] *= -1;
        ctx.combat.escapeGoal[id] = !r.attackSources.length && activeOpponents(id).some(o => o.attackSources.length) ? fleeAllAttackers(r, activeOpponents(id).filter(o => o.attackSources.length)) : foe ? tacticalEscape(r, foe) : patrol(r);
        ctx.combat.escapeUntil[id] = ctx.game.time + 4;
        ctx.agentAI[id].goal = null;
        ctx.agentAI[id].searchHoldUntil = 0;
        // Отключаем прежний маршрут и выдаём новое направление без фиксации позиции.
        ctx.combat.stationaryFor[id] = 0;
        note('combat-unstuck', {
          robot: id
        });
      }
    }
    ctx.combat.lastPositions[id] = {
      x: r.x,
      y: r.y
    };
  }
  combatAttacks();
  updateOilLeaks();
}
export function frame(now) {
  if (ctx.disposed) return;
  if (ctx.root.isConnected === false) {
    ctx.root.__disposeTag?.();
    return;
  }
  const elapsed = ctx.last === null ? 0 : Math.max(0, (now - ctx.last) / 1000);
  ctx.last = now;
  let painted = false;
  const resultsOpen=ctx.combat.finished&&!ctx.resultsPanel.hidden;
  ctx.cameraDebt = (ctx.cameraDebt || 0) + elapsed;
  if (ctx.startup.phase !== 'running') {
    if (!document.hidden && !ctx.orientationBlocked && !ctx.settingsOpen && ctx.startup.phase === 'spawning') { advanceStartup(elapsed); painted = true; }
    ctx.debt = 0;
    ctx.paintAt = now;
  } else if (!ctx.paused && !ctx.settingsOpen && !ctx.orientationBlocked && !document.hidden && !resultsOpen) {
    // Physics always advances in 1/60 s steps, independently of the paint cap.
    // Keep excess debt after a long active-frame stall instead of losing time.
    ctx.debt += elapsed * ctx.timeScale;
    const n = Math.min(60, Math.floor((ctx.debt + 1e-9) * 60));
    timed('simulation',()=>{for (let i = 0; i < n; i++) step(1 / 60);});
    ctx.debt = Math.max(0, ctx.debt - n / 60);
    const paintInterval = 1000 / 30;
    if (now - ctx.paintAt >= paintInterval - .1) {
      timed('animation',paint);
      painted = true;
      // Preserve the scheduled phase instead of restarting the timer on each
      // callback. A 75/144 Hz display or small jitter must not lower the cap.
      // Paint even when this callback had no step: previous callbacks may have
      // advanced the pose since the last paint.
      ctx.paintAt = Number.isFinite(ctx.paintAt)
        ? ctx.paintAt + Math.max(1,Math.floor((now-ctx.paintAt+.1)/paintInterval))*paintInterval
        : now;
    }
  } else {
    ctx.debt = 0;
    ctx.paintAt = now;
  }
  // Changing viewBox repaints the whole arena. Do it only with a new game frame.
  if (painted) {
    cameraUpdate(ctx.cameraDebt);
    timed('webgl',()=>ctx.arenaRenderer?.render());
    ctx.cameraDebt = 0;
  } else if (ctx.paused || ctx.settingsOpen || ctx.orientationBlocked || document.hidden || resultsOpen) ctx.cameraDebt = 0;
  ctx.audio?.sync();
  recordFrame(now, painted);
  ctx.frameId = requestAnimationFrame(frame);
}
