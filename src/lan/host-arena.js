import {installLanHostSync} from './host-sync.js';
import {note} from '../game/events.js';
import {startSpawnSequence} from '../game/session.js';
import {ctx} from '../game/state.js';
import {installTowerInput} from '../tower/input.js';
import {resetFrameClock} from '../game/clock.js';
import {LAN_HEARTBEAT_SEND_MS, LAN_HOST_HEARTBEAT_MS} from './protocol.js';
import {captureBattleStatistics, showResults} from '../ui/results.js';

export function installLanHostArena(match) {
  const root = ctx.root;
  const controls = root.querySelector('#tower-controls');
  const localId = match.fighters.findIndex(fighter => fighter.control === 'local');
  root.querySelector('#tower-wallet').hidden = true;
  root.querySelector('#tower-preparation').hidden = true;
  root.querySelector('#tower-reward-toast').hidden = true;
  controls.hidden = true;
  ctx.resetButton.hidden = false;
  ctx.resetButton.textContent = 'Завершить бой';
  match.finish = reason => {
    match.result = {winner: ctx.combat.winner, elapsedSec: ctx.round.elapsedSec, reason,
      statistics: captureBattleStatistics()};
    match.onFinish(match.result);
  };
  ctx.resetButton.onclick = () => {
    if (ctx.combat.finished || ctx.startup.phase !== 'running') return;
    match.endedManually = true;
    ctx.combat.finished = true;
    ctx.combat.finishedAt = ctx.game.time;
    ctx.combat.pending.fill(null);
    match.finish('manual');
    note('combat-end', {winner: null, outcome: 'manual', loser: null});
    showResults();
  };
  ctx.resultsAgain.onclick = match.onReturn;
  ctx.resultsProcedure.hidden = true;
  ctx.resultsProcedure.onclick = null;

  if (localId >= 0) installTowerInput({localId});
  const network = match.onSnapshot ? installLanHostSync(match) : null;
  const doc = root.ownerDocument;
  let phase = 'preparing', started = false, nextSignal = 0, lastHeartbeat = 0;
  const available = () => !doc.hidden && !ctx.appInactive && !ctx.orientationBlocked;

  function pause() {
    if (match.suspended) return;
    match.suspended = true;
    controls.hidden = true;
    ctx.clearTowerInput?.();
    network?.resetInputs();
    resetFrameClock();
  }

  function update(now, elapsed = 0) {
    if (!started || ctx.combat.finished && phase !== 'suspended') return;
    const lostServer = match.onHeartbeat && phase === 'running' && now - lastHeartbeat >= LAN_HOST_HEARTBEAT_MS;
    if (!available() || elapsed * 1000 >= LAN_HOST_HEARTBEAT_MS || lostServer) {
      pause();
      if (phase === 'running' && now >= nextSignal) {
        match.onSuspend?.();
        nextSignal = now + LAN_HEARTBEAT_SEND_MS;
      }
    } else if (phase === 'suspended' && now >= nextSignal) {
      network?.sendResume();
      nextSignal = now + LAN_HEARTBEAT_SEND_MS;
    } else if (phase === 'running' && !match.suspended && now >= nextSignal) {
      match.onHeartbeat?.();
      nextSignal = now + LAN_HEARTBEAT_SEND_MS;
    }
  }

  const visibility = () => { nextSignal = 0; update(performance.now()); };
  doc.addEventListener('visibilitychange', visibility);
  const dispose = root.__disposeTag;
  root.__disposeTag = () => { doc.removeEventListener('visibilitychange', visibility); dispose(); };
  match.updateHostAvailability = update;

  return {
    ...network,
    start() {
      started = true;
      controls.hidden = localId < 0;
      startSpawnSequence();
      update(performance.now());
    },
    pause,
    heartbeat() { lastHeartbeat = performance.now(); },
    phase(next) {
      if (phase === next) return;
      phase = next;
      nextSignal = 0;
      if (next === 'suspended') pause();
      if (next === 'running' && available()) {
        lastHeartbeat = performance.now();
        if (match.suspended) resetFrameClock();
        match.suspended = false;
        controls.hidden = !started || localId < 0;
      }
      update(performance.now());
    },
  };
}
