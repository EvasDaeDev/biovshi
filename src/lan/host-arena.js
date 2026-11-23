import {installLanHostSync} from './host-sync.js';
import {note} from '../game/events.js';
import {startSpawnSequence} from '../game/session.js';
import {ctx} from '../game/state.js';
import {installTowerInput} from '../tower/input.js';
import {setPaused} from '../ui/controls.js';
import {showResults} from '../ui/results.js';

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
  ctx.resetButton.onclick = () => {
    if (ctx.combat.finished || ctx.startup.phase !== 'running') return;
    match.endedManually = true;
    ctx.combat.finished = true;
    ctx.combat.finishedAt = ctx.game.time;
    ctx.combat.pending.fill(null);
    match.onFinish({winner: null, elapsedSec: ctx.round.elapsedSec, reason: 'manual'});
    note('combat-end', {winner: null, outcome: 'manual', loser: null});
    showResults();
  };
  ctx.resultsAgain.onclick = match.onReturn;
  ctx.resultsProcedure.hidden = true;
  ctx.resultsProcedure.onclick = null;

  if (localId >= 0) installTowerInput({localId});
  const network = match.onSnapshot ? installLanHostSync(match) : null;
  return {
    ...network,
    start() {
      controls.hidden = localId < 0;
      startSpawnSequence();
    },
    pause() { setPaused(true); },
  };
}
