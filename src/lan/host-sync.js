import {ASSETS, assetUrl} from '../assets/manifest.js';
import {transformMatrix} from '../render/pixi-math.js';
import {ctx} from '../game/state.js';
import {onGameEvent} from '../game/event-bus.js';
import {resolveDestination} from '../tower/input.js';
import {createFloorPublisher} from './floor-sync.js';
import {LAN_BATTLE_EVENT_BATCH, LAN_INPUT_TIMEOUT_MS, LAN_SNAPSHOT_MS,
  encodeFrame, encodeNumber, encodePoint} from './battle-protocol.js';

function captureRemainsPiece({geometry, skin}, assetKeys) {
  const bone = geometry.kind === 'head' ? [geometry.x, geometry.y, geometry.r].map(encodeNumber) :
    [...encodePoint(geometry.a), ...encodePoint(geometry.b), encodeNumber(geometry.w)];
  const asset = skin && assetKeys.get(skin.url);
  return {bone, skin: asset ? {
    key: skin.key, asset, tile: [skin.part.col, skin.part.row],
    matrix: transformMatrix(skin.transform).map(encodeNumber), rarity: skin.rarity ?? 0, hat: skin.hat ?? null,
  } : null};
}

export function installLanHostSync(match) {
  const assetKeys = new Map(Object.entries(ASSETS.textures).map(([key, file]) => [assetUrl(file), key]));
  const byMember = new Map(match.fighters.flatMap(({control, memberId}, id) =>
    control === 'remote' ? [[memberId, id]] : []));
  const inputs = new Map();
  let seq = 0, eventSeq = 0, sentRemains = 0, nextSnapshot = 0, finalSent = false, eventScheduled = false;
  const events = [];
  const publishFloor = createFloorPublisher();

  function flushEvents() {
    if (match.suspended || !match.onBattleEvents) return;
    while (events.length) {
      const batch = events.slice(0, LAN_BATTLE_EVENT_BATCH);
      if (!match.onBattleEvents({events: batch})) break;
      events.splice(0, batch.length);
    }
  }

  const unsubscribe = onGameEvent(event => {
    const data = captureBattleEvent(event);
    if (!data) return;
    events.push({seq: eventSeq++, type: event.type, time: encodeNumber(event.time), ...data});
    if (match.onBattleEvents && !eventScheduled) {
      eventScheduled = true;
      queueMicrotask(() => {
        eventScheduled = false;
        flushEvents();
      });
    }
  });
  const dispose = ctx.root.__disposeTag;
  ctx.root.__disposeTag = () => { unsubscribe(); events.length = 0; dispose(); };

  function clearMovement(id) {
    if (inputs.get(id)?.requested) ctx.robots[id]?.cancelNavigation();
    inputs.delete(id);
  }

  match.movement = id => {
    const input = inputs.get(id);
    if (input && performance.now() - input.received < LAN_INPUT_TIMEOUT_MS) return input;
    clearMovement(id);
    return null;
  };

  const robotView = robot => {
    const view = robot.captureReplica();
    const input = inputs.get(robot.id);
    if (input?.requested) {
      view.destination = input.goal ? [...input.requested, ...encodePoint(input.goal)] : input.requested;
    }
    return view;
  };
  const snapshot = events => ({
    seq, time: encodeNumber(ctx.game.time), elapsed: encodeNumber(ctx.round.elapsedSec),
    started: ctx.startup.phase === 'running', finished: ctx.combat.finished, winner: ctx.combat.winner,
    robots: ctx.robots.map(robotView), events,
  });

  match.publishFrame = (now, painted) => {
    if (match.suspended) return;
    const final = ctx.combat.finished && !finalSent;
    if ((!painted || now < nextSnapshot) && !final) return;
    flushEvents();
    if (ctx.combat.detached.length !== sentRemains) {
      const parts = ctx.combat.detached.map(({id, cause, inertia, pieces}) => ({
        id, cause,
        motion: [inertia.started, inertia.duration, inertia.dx, inertia.dy].map(encodeNumber),
        pieces: pieces.map(piece => captureRemainsPiece(piece, assetKeys)),
      }));
      if (match.onRemains({parts})) sentRemains = parts.length;
    }
    publishFloor(now, ctx.game.time, ctx.combat.oilDrops, ctx.robots, match.onFloor, final);
    const batch = events.slice(0, LAN_BATTLE_EVENT_BATCH);
    if (match.onSnapshot(snapshot(batch))) {
      seq++;
      events.splice(0, batch.length);
      nextSnapshot = now + LAN_SNAPSHOT_MS - 1;
      finalSent = ctx.combat.finished && !events.length;
    }
  };

  const starts = ctx.robots.map(encodeFrame);
  return {
    view: {starts},
    resetInputs() { for (const id of inputs.keys()) clearMovement(id); },
    sendResume() {
      if (match.onResume(snapshot([]))) {
        seq++;
        events.length = 0;
      }
    },
    input({memberId, x, y, goal}) {
      const id = byMember.get(memberId);
      if (id === undefined) return;
      const received = performance.now();
      const previous = inputs.get(id);
      if (goal && previous?.requested?.[0] === goal[0] && previous.requested[1] === goal[1] &&
          received - previous.received < LAN_INPUT_TIMEOUT_MS) {
        previous.received = received;
        return;
      }
      clearMovement(id);
      inputs.set(id, goal
        ? {requested: goal, goal: resolveDestination(ctx.robots[id], {x: goal[0], y: goal[1]}), received}
        : {x, y, received});
    },
    resetInput(memberId) { clearMovement(byMember.get(memberId)); },
  };
}

function captureBattleEvent({type, robot, by, from, to, source, segment, point, damage,
  heading, goal, phase, reason, knockoutCause, winner, outcome}) {
  switch (type) {
    case 'hit':
    case 'segment-broken':
      if (!point) return null;
      return {robot, by: ctx.robots[by]?.id ?? null, segment, point: encodePoint(point), damage};
    case 'combat-windup':
    case 'combat-miss':
      return {from, to, source};
    case 'combat-strike':
      return {from, to, source, segment};
    case 'pounce-launch':
      return {robot, heading: encodeNumber(heading)};
    case 'boss-charge':
      return {robot, goal: encodePoint(goal)};
    case 'boss-phase':
      return {robot, phase};
    case 'robot-immobilized':
      return {robot, reason, knockoutCause: knockoutCause ?? null};
    case 'combat-end':
      return {winner, outcome};
    default:
      return null;
  }
}
