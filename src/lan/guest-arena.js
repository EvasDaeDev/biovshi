import {ASSETS, assetUrl} from '../assets/manifest.js';
import {ctx} from '../game/state.js';
import {emitGameEvent} from '../game/event-bus.js';
import {installTowerInput} from '../tower/input.js';
import {showCrit} from '../render/crit.js';
import {spawnHitEffect} from '../render/hit-effects.js';
import {LAN_INPUT_MS, LAN_INPUT_TIMEOUT_MS} from './battle-protocol.js';
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
  let connected = false, started = false;
  let lastX = 0, lastY = 0, nextInput = 0, inputSeq = 0, impactSeq = -1;
  const impacts = [];

  function sendInput(now, release = false) {
    if (localId < 0) return;
    const {x, y} = release ? {x: 0, y: 0} : ctx.towerInput;
    if (!x && !y && !lastX && !lastY) return;
    if (!release && now < nextInput && (x || y)) return;
    const length = Math.max(1, Math.hypot(x, y));
    if (match.onInput({x: x / length, y: y / length, seq: inputSeq})) {
      lastX = x;
      lastY = y;
      nextInput = now + LAN_INPUT_MS;
      inputSeq++;
    }
  }

  if (localId >= 0) installTowerInput({localId, onRelease: () => {
    if (started && connected) sendInput(performance.now(), true);
  }});

  match.sendInputFrame = now => {
    if (!started) return;
    if (connected && !ctx.combat.finished && !ctx.settingsOpen && !ctx.orientationBlocked && !document.hidden) sendInput(now);
    else sendInput(now, true);
  };
  match.paintReplica = now => {
    if (!started) return false;
    const snapshot = buffer.sample(now);
    if (!snapshot) return false;
    ctx.game.time = snapshot.time;
    ctx.round.elapsedSec = snapshot.elapsed;
    ctx.combat.finished = snapshot.finished;
    ctx.combat.winner = snapshot.winner;
    ctx.telemetryDirty = true;
    for (const [id, view] of snapshot.robots.entries()) ctx.robots[id].applyReplica(view);
    while (impacts.length && impacts[0].time <= snapshot.time) {
      const event = impacts.shift();
      if (snapshot.time - event.time > LAN_INPUT_TIMEOUT_MS / 1000) continue;
      const [x, y] = event.point;
      const attacker = ctx.robots[event.by];
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
    },
    resume() {
      connected = true;
      controls.hidden = localId < 0 || ctx.combat.finished;
    },
    snapshot(snapshot) {
      if (!buffer.push(snapshot, performance.now())) return;
      for (const event of snapshot.impacts) if (event.seq > impactSeq) {
        impactSeq = event.seq;
        impacts.push(event);
      }
    },
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
