import {ASSETS, assetUrl} from '../assets/manifest.js';
import {ctx} from '../game/state.js';
import {emitGameEvent} from '../game/event-bus.js';
import {installTowerInput} from '../tower/input.js';
import {showCrit} from '../render/crit.js';
import {spawnHitEffect} from '../render/hit-effects.js';
import {LAN_INPUT_MS, LAN_INPUT_TIMEOUT_MS} from './battle-protocol.js';
import {createFloorReplica} from './floor-replica.js';
import {createSnapshotBuffer} from './snapshot-buffer.js';

function restoreRemainsPiece({bone, skin}) {
  const [ax, ay, bx, by, width] = bone;
  const geometry = bone.length === 3 ? {kind: 'head', x: ax, y: ay, r: bx} :
    {kind: 'segment', a: {x: ax, y: ay}, b: {x: bx, y: by}, w: width};
  if (!skin || !Object.hasOwn(ASSETS.textures, skin.asset)) return {geometry};
  const [col, row] = skin.tile;
  return {geometry, skin: {
    key: skin.key, part: {col, row}, url: assetUrl(ASSETS.textures[skin.asset]), rarity: skin.rarity,
    transform: 'matrix(' + skin.matrix.join(' ') + ')', hat: skin.hat,
  }};
}

export function installLanGuestArena(match) {
  const {root} = ctx;
  const controls = root.querySelector('#tower-controls');
  const localId = match.fighters.findIndex(fighter => fighter.control === 'local');
  root.querySelector('#tower-wallet').hidden = true;
  root.querySelector('#tower-preparation').hidden = true;
  root.querySelector('#tower-reward-toast').hidden = true;
  controls.hidden = true;
  ctx.resetButton.disabled = false;
  ctx.resetButton.hidden = false;
  ctx.resetButton.textContent = 'Выйти из комнаты';
  ctx.resetButton.onclick = match.onReturn;

  const buffer = createSnapshotBuffer();
  const floor = createFloorReplica();
  let connected = false, started = false;
  let lastX = 0, lastY = 0, lastGoal = false, nextInput = 0, inputSeq = 0, impactSeq = -1;
  const impacts = [];
  function enqueueImpacts(events) {
    for (const event of events) if (event.seq > impactSeq) {
      impactSeq = event.seq;
      impacts.push(event);
    }
    if (impacts.length > 64) impacts.splice(0, impacts.length - 64);
  }

  function sendInput(now, release = false) {
    if (localId < 0) return;
    const {x, y} = release ? {x: 0, y: 0} : ctx.towerInput;
    const destination = ctx.towerDestination;
    const goal = !release && !destination?.arrived ? destination?.requested : null;
    if (!goal && !x && !y && !lastGoal && !lastX && !lastY) return;
    if (!release && now < nextInput && (goal || x || y)) return;
    const length = Math.max(1, Math.hypot(x, y));
    const movement = goal ? {goal} : {x: x / length, y: y / length};
    if (match.onInput({...movement, seq: inputSeq})) {
      lastX = x;
      lastY = y;
      lastGoal = Boolean(goal);
      nextInput = now + LAN_INPUT_MS;
      inputSeq++;
    }
  }

  if (localId >= 0) installTowerInput({localId, onRelease: () => {
    if (started && connected) sendInput(performance.now(), true);
  }});

  match.sendInputFrame = now => {
    if (!started) return;
    if (connected && !ctx.combat.finished && !ctx.paused && !ctx.appInactive &&
        !ctx.settingsOpen && !ctx.orientationBlocked && !document.hidden) sendInput(now);
    else {
      if (ctx.towerDestination) ctx.clearTowerDestination?.();
      sendInput(now, true);
    }
  };
  match.paintReplica = now => {
    if (!started) return false;
    const snapshot = buffer.sample(now);
    if (!snapshot) return false;
    ctx.game.time = snapshot.time;
    ctx.round.elapsedSec = snapshot.elapsed;
    ctx.combat.finished = snapshot.finished;
    ctx.combat.winner = snapshot.winner;
    floor.paint(snapshot.time);
    for (const [id, view] of snapshot.robots.entries()) ctx.robots[id].applyReplica(view);
    const destination = ctx.towerDestination;
    const local = snapshot.robots[localId];
    if (destination && local) {
      const [requestX, requestY, x, y] = local.destination ?? [];
      const sameRequest = requestX === destination.requested[0] && requestY === destination.requested[1];
      if (!ctx.robots[localId].mobile || (sameRequest && x === undefined)) ctx.clearTowerDestination();
      else if (sameRequest) {
        destination.x = x;
        destination.y = y;
        const [observedX, observedY] = local.observedRoot ?? local.root;
        destination.arrived ||= Math.hypot(observedX - x, observedY - y) <= 8;
      }
    }
    while (impacts.length && impacts[0].time <= snapshot.time) {
      const event = impacts.shift();
      if (snapshot.time - event.time > LAN_INPUT_TIMEOUT_MS / 1000) continue;
      const [x, y] = event.point;
      const attacker = ctx.robots[event.by];
      if (attacker && event.by !== event.robot) attacker.flashHitLight(event.time);
      const heading = attacker ? Math.atan2(y - attacker.y, x - attacker.x) : 0;
      spawnHitEffect(x, y, heading, event.severed);
      if (event.damage === 2) showCrit(x, y);
      emitGameEvent(event.severed ? 'segment-broken' : 'hit', {...event, point: {x, y}});
    }
    return true;
  };

  return {
    start() {
      started = true;
      connected = true;
      ctx.startup.phase = 'running';
      controls.hidden = localId < 0;
    },
    finish() {
      ctx.clearTowerInput?.();
      connected = false;
      controls.hidden = true;
    },
    pause() {
      ctx.clearTowerInput?.();
      connected = false;
      controls.hidden = true;
      buffer.clear();
      impacts.length = 0;
      lastX = lastY = 0;
      lastGoal = false;
    },
    resume() {
      connected = true;
      controls.hidden = localId < 0 || ctx.combat.finished;
    },
    snapshot(snapshot) {
      if (snapshot.keyframe) { buffer.clear(); impacts.length = 0; }
      if (!buffer.push(snapshot, performance.now())) return;
      enqueueImpacts(snapshot.impacts);
    },
    impact: enqueueImpacts,
    floor: floor.receive,
    remains({parts}) {
      for (const {id, cause, motion, pieces} of parts.slice(ctx.combat.detached.length)) {
        const [started, duration, dx, dy] = motion;
        ctx.combat.detached.push({id, cause, inertia: {started, duration, dx, dy}, puddleCreated: true,
          pieces: pieces.map(restoreRemainsPiece),
        });
      }
    },
  };
}
