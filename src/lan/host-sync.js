import {ASSETS, assetUrl} from '../assets/manifest.js';
import {transformMatrix} from '../render/pixi-math.js';
import {ctx} from '../game/state.js';
import {onGameEvent} from '../game/event-bus.js';
import {resolveDestination} from '../tower/input.js';
import {createFloorPublisher} from './floor-sync.js';
import {LAN_INPUT_TIMEOUT_MS, LAN_SNAPSHOT_MS, encodeFrame, encodeNumber, encodePoint} from './battle-protocol.js';

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
  let seq = 0, impactSeq = 0, sentRemains = 0, nextSnapshot = 0, finalSent = false, impactScheduled = false;
  const impacts = [];
  const publishFloor = createFloorPublisher();

  const unsubscribe = onGameEvent(event => {
    if (!event.point || !['hit', 'segment-broken'].includes(event.type)) return;
    impacts.push({
      seq: impactSeq++, robot: event.robot, by: ctx.robots[event.by]?.id ?? null,
      segment: event.segment, time: encodeNumber(event.time), point: encodePoint(event.point),
      damage: event.damage, severed: event.type === 'segment-broken',
    });
    if (impacts.length > 64) impacts.shift();
    if (match.onImpact && !impactScheduled) {
      impactScheduled = true;
      // Group hits from the same simulation callback without waiting for a pose snapshot.
      queueMicrotask(() => {
        impactScheduled = false;
        if (!match.suspended && impacts.length && match.onImpact({impacts})) impacts.length = 0;
      });
    }
  });
  const dispose = ctx.root.__disposeTag;
  ctx.root.__disposeTag = () => { unsubscribe(); dispose(); };

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
    robots: ctx.robots.map(robotView), impacts: events,
  });

  match.publishFrame = (now, painted) => {
    if (match.suspended) return;
    const final = ctx.combat.finished && !finalSent;
    if ((!painted || now < nextSnapshot) && !final) return;
    if (ctx.combat.detached.length !== sentRemains) {
      const parts = ctx.combat.detached.map(({id, cause, inertia, pieces}) => ({
        id, cause,
        motion: [inertia.started, inertia.duration, inertia.dx, inertia.dy].map(encodeNumber),
        pieces: pieces.map(piece => captureRemainsPiece(piece, assetKeys)),
      }));
      if (match.onRemains({parts})) sentRemains = parts.length;
    }
    publishFloor(now, ctx.game.time, ctx.combat.oilDrops, ctx.robots, match.onFloor, final);
    if (match.onSnapshot(snapshot(impactScheduled ? [] : impacts))) {
      seq++;
      if (!impactScheduled) impacts.length = 0;
      nextSnapshot = now + LAN_SNAPSHOT_MS - 1;
      finalSent = ctx.combat.finished;
    }
  };

  const starts = ctx.robots.map(encodeFrame);
  return {
    view: {starts},
    resetInputs() { for (const id of inputs.keys()) clearMovement(id); },
    sendResume() {
      if (match.onResume(snapshot([]))) {
        seq++;
        impacts.length = 0;
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
