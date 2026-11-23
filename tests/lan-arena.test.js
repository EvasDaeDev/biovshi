import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {frame, step} from '../src/game/loop.js';
import {patientCombatStats} from '../src/game/patients.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
import {createLanRoster, lanTowerCopy} from '../src/lan/characters.js';
import {validBattleSnapshot, validBattleView, validRemains} from '../src/lan/battle-protocol.js';
import {installLanGuestArena} from '../src/lan/guest-arena.js';
import {createOilDrop} from '../src/render/effects.js';
import {validFloorPatch} from '../src/lan/floor-sync.js';
import {paint} from '../src/render/frame.js';
import {cameraReset, cameraUpdate} from '../src/render/camera.js';
import {installLanHostArena} from '../src/lan/host-arena.js';
import {newTower} from '../src/tower/model.js';
import {showResults} from '../src/ui/results.js';
import {createRobot} from '../src/robot/robot.js';

function clickPoint(win, x, y) {
  ctx.fieldWidth = ctx.fieldHeight = 700;
  ctx.svg.setAttribute('viewBox', '0 0 700 700');
  ctx.svg.getBoundingClientRect = () => ({left: 100, top: 50, width: 350, height: 350});
  ctx.svg.dispatchEvent(new win.MouseEvent('click', {bubbles: true, clientX: 100 + x / 2, clientY: 50 + y / 2}));
}

function launch(t, {members, ai = [], local, arenaId = 'ward', network}) {
  const dom = new JSDOM(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), {
    url: 'http://127.0.0.1:8080/', pretendToBeVisual: true,
  });
  const win = dom.window;
  for (const key of ['document', 'localStorage', 'Event']) globalThis[key] = win[key];
  globalThis.matchMedia = () => ({matches: false});
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const results = [];
  let returned = false;
  const multiplayer = {fighters: createLanRoster({members, ai}, local),
    onFinish: result => results.push(result), onReturn: () => { returned = true; }, ...network};
  initializeGame({multiplayer, arenaId});
  t.after(() => { ctx.root.__disposeTag(); win.close(); });
  const host = installLanHostArena(multiplayer);
  host.start();
  advanceStartup(10);
  assert.equal(ctx.startup.phase, 'running');
  return {results, win, host, returned: () => returned};
}

const fighter = (id, profile) => ({id, role: 'player', name: id, profile});

test('LAN solo scenario keeps running and ends manually without writing economy or Tower data', t => {
  const tower = newTower(2);
  tower.stats = [6, 4, 5];
  tower.surgeries = [{procedure: 'extend_spine', site: 'spine-1'}];
  const source = structuredClone(tower);
  const {results, win, returned} = launch(t, {
    members: [{...fighter('хозяин', 'tower'), tower: lanTowerCopy(tower)}], local: 'хозяин',
  });
  localStorage.setItem(ctx.BET_STORAGE, JSON.stringify({sentinel: true}));
  assert.equal(ctx.robots[0].body.spineSegments, 5);
  assert.deepEqual(patientCombatStats(0).base, tower.stats);
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', {code: 'KeyW'}));
  step(1 / 60);
  assert.equal(ctx.intents[0].manual, true);
  assert.ok(ctx.intents[0].speed > 0);
  win.dispatchEvent(new win.Event('blur'));
  step(1 / 60);
  assert.equal(ctx.intents[0].speed, 0);
  assert.equal(ctx.combat.finished, false);
  ctx.resetButton.click();
  const [{statistics, ...result}] = results;
  assert.deepEqual(result, {winner: null, elapsedSec: 2 / 60, reason: 'manual'});
  assert.deepEqual(statistics, {strikes: 0, hits: 0, fighters: [{
    segments: ctx.robots[0].segmentTotal, total: ctx.robots[0].segmentTotal,
    hits: 0, taken: 0, hasHead: true, mobile: true,
  }]});
  assert.match(ctx.resultsTitle.textContent, /БОЙ ЗАВЕРШЁН ХОЗЯИНОМ/);
  assert.equal(ctx.resultsPanel.hidden, false);
  ctx.resultsAgain.click();
  assert.equal(returned(), true);
  assert.deepEqual(tower, source);
  assert.equal(localStorage.getItem(ctx.BET_STORAGE), '{"sentinel":true}');
});

test('LAN handles mixed rigs, a manually controlled boss in slot 1, and automatic victory', t => {
  const {results, win} = launch(t, {
    members: [fighter('гость', 'fast'), fighter('хозяин', 'boss-arms')],
    ai: ['strong'], local: 'хозяин', arenaId: 'columns',
  });
  assert.equal(ctx.robots.length, 3);
  assert.equal(ctx.robots[1].isBoss, true);
  assert.equal(ctx.robots[1].body.variant.id, 'arms');
  assert.match(ctx.cardNodes[1].strength.textContent, /30%/);
  assert.deepEqual(patientCombatStats(2).base, [2, 7, 3]);
  win.document.dispatchEvent(new win.KeyboardEvent('keydown', {code: 'KeyD'}));
  step(1 / 60);
  assert.equal(ctx.intents[0].manual, true);
  assert.equal(ctx.intents[0].speed, 0);
  assert.equal(ctx.intents[1].manual, true);
  assert.ok(ctx.intents[1].speed > 0);
  assert.equal(Boolean(ctx.intents[2].manual), false);
  for (const id of [0, 2]) ctx.robots[id].damage('head', 1, 100);
  step(1 / 60);
  const [{statistics, ...result}] = results;
  assert.deepEqual(result, {winner: 1, elapsedSec: 2 / 60, reason: 'combat'});
  assert.deepEqual(statistics.fighters.map(fighter => fighter.hasHead), [false, true, false]);
  ctx.combat.fighterHits[1] = 999;
  showResults();
  assert.match(ctx.resultsTitle.textContent, /ПОБЕДИТЕЛЬ — хозяин/);
  assert.equal(ctx.resultsRows.querySelector('.is-winner').cells[2].textContent, String(statistics.fighters[1].hits));
  assert.equal(localStorage.getItem(ctx.BET_STORAGE), null);
});

test('LAN host can spectate a full arena of ten AI fighters', t => {
  launch(t, {members: [{id: 'наблюдатель', role: 'spectator'}], local: 'наблюдатель',
    ai: Array(10).fill('basic'), arenaId: 'columns'});
  assert.equal(ctx.robots.length, 10);
  assert.equal(ctx.actorsG.querySelector('[data-tower-player]'), null);
  assert.ok([...ctx.conesG.querySelectorAll('.neon-pool')].every(pool => Number(pool.getAttribute('opacity')) > 0));
  const settle = () => { for (let i = 0; i < 360; i++) cameraUpdate(1 / 30); };
  settle();
  const spectatorCamera = {...ctx.camera};
  ctx.mode = 'spectator';
  cameraReset();
  settle();
  assert.deepEqual(ctx.camera, spectatorCamera);
  ctx.mode = 'multiplayer';
  assert.equal(ctx.root.querySelector('#tower-controls').hidden, true);
  step(1 / 60);
  assert.ok(ctx.intents.every(intent => !intent.manual));
  assert.equal(ctx.combat.finished, false);
  assert.equal(ctx.root.querySelector('#tower-control-mode').disabled, true);
});

test('LAN host routes a remote fighter around obstacles and cancels invalid or released goals', t => {
  const {host} = launch(t, {members: [fighter('гость', 'basic')], local: 'наблюдатель', arenaId: 'annulus',
    network: {onSnapshot: () => true, onFloor: () => true, onRemains: () => true}});
  const robot = createRobot(0, {x: 170, y: 350, angle: 0});
  ctx.robots = [robot];
  robot.setVisible(true);
  host.input({memberId: 'гость', goal: [350, 350]});
  step(1 / 60);
  assert.equal(ctx.intents[0].speed, 0);
  host.input({memberId: 'гость', goal: [10, 10]});
  step(1 / 60);
  assert.equal(ctx.intents[0].speed, 0);
  let largestDeviation = 0;
  for (let tick = 0; tick < 2400; tick++) {
    if (tick % 3 === 0) host.input({memberId: 'гость', goal: [530, 350]});
    step(1 / 60);
    largestDeviation = Math.max(largestDeviation, Math.abs(robot.y - 350));
    if (ctx.multiplayer.movement(0)?.goal?.arrived) break;
  }
  assert.ok(largestDeviation > 100);
  assert.ok(Math.hypot(robot.x - 530, robot.y - 350) <= 8);
  host.input({memberId: 'гость', goal: [550, 460]});
  step(1 / 60);
  assert.ok(ctx.intents[0].navigate && ctx.intents[0].speed > 0);
  host.resetInput('гость');
  step(1 / 60);
  assert.equal(ctx.intents[0].speed, 0);
});

test('LAN replica renders the host rig and detached segments without simulation', t => {
  const snapshots = [], wreckage = [], floors = [], inputs = [];
  const members = [fighter('хозяин', 'boss-arms'), fighter('гость', 'fast')];
  const {host, win} = launch(t, {
    members, local: 'хозяин', arenaId: 'columns', network: {
      onSnapshot: data => { snapshots.push(structuredClone(data)); return true; },
      onRemains: data => { wreckage.push(data); return true; },
      onFloor: data => { floors.push(data); return true; },
    },
  });
  assert.equal(validBattleView(host.view, 2), true);
  host.input({memberId: 'гость', x: 0, y: 1});
  step(1 / 60);
  assert.ok(ctx.intents[1].speed > 0);
  host.resetInput('гость');
  step(1 / 60);
  assert.equal(ctx.intents[1].speed, 0);
  const segment = 'arm-1-lower';
  ctx.robots[1].damage(segment, 0, 100);
  createOilDrop(1, 367, 391, 3.5, 'coolant', {variant: {index: 4, angle: 29}});
  ctx.robots[1].trail.push({x: 367, y: 391, time: ctx.game.time});
  paint();
  ctx.multiplayer.publishFrame(performance.now(), true);
  const snapshot = snapshots.at(-1);
  assert.equal(validBattleSnapshot(snapshot, 2), true);
  assert.equal(validRemains(wreckage[0].parts, 2), true);
  assert.equal(snapshot.impacts[0].segment, segment);
  assert.equal(validFloorPatch(floors[0], 2), true);
  assert.equal(floors[0].add[0][6], 1);

  const replica = {fighters: createLanRoster({members, ai: []}, 'гость'), replica: true,
    starts: host.view.starts, onInput: data => { inputs.push(data); return true; }, onReturn() {}};
  initializeGame({multiplayer: replica, arenaId: 'columns'});
  const guest = installLanGuestArena(replica);
  guest.start();
  for (const robot of ctx.robots) robot.tick = () => assert.fail('The replica must never tick a robot');
  guest.remains(wreckage[0]);
  guest.remains(wreckage[0]);
  guest.floor(floors[0]);
  guest.snapshot(snapshot);
  step(1 / 60);
  assert.equal(ctx.game.time, 0);
  frame(performance.now() + 120);
  assert.equal(ctx.game.time, snapshot.time);
  assert.ok(ctx.robots[1].missingSegments.includes(segment));
  assert.equal(ctx.robots[0].x, snapshot.robots[0].root[0]);
  assert.equal(ctx.robots[0].actor.getAttribute('data-boss-phase'), '1');
  assert.equal(ctx.actorsG.lastElementChild, ctx.robots[1].actor);
  assert.ok(ctx.robots[1].actor.hasAttribute('data-tower-player'));
  assert.equal(ctx.conesG.querySelector('[fill="url(#tag7hop-pool-0)"]').getAttribute('opacity'), '0.000');
  assert.ok(Number(ctx.conesG.querySelector('[fill="url(#tag7hop-pool-1)"]').getAttribute('opacity')) > 0);
  assert.equal(Number(ctx.lightHoles.querySelector('[fill="url(#tag7hop-tower-vision-1)"]').getAttribute('opacity')) > 0, true);
  assert.equal(ctx.robots[0].actor.querySelector('.robot-label').getAttribute('display'), 'none');
  assert.ok(win.document.querySelector('#tower-enemy-markers'));
  for (let i = 0; i < 360; i++) cameraUpdate(1 / 30);
  assert.ok(Math.abs(ctx.camera.x + ctx.camera.size / 2 - ctx.robots[1].x) < .1);
  assert.equal(ctx.detachedG.children.length, 1);
  assert.deepEqual(ctx.combat.oilDrops[0].variant, {index: 4, angle: 29});
  assert.equal(ctx.combat.oilDrops[0].fluid, 'coolant');
  assert.ok(ctx.robots[1].trail.some(point => point.x === 367 && point.y === 391));
  assert.ok([...ctx.robots[1].trailNodes].some(node => Number(node.getAttribute('opacity')) > 0));
  guest.floor({time: snapshot.time, trails: [[1, []]], add: [], remove: [floors[0].add[0][0]]});
  frame(performance.now() + 170);
  assert.equal(ctx.combat.oilDrops.filter(drop => drop.fluid === 'coolant').length, 0);
  assert.equal(ctx.robots[1].trail.length, 0);

  ctx.telemetryDirty = false;
  replica.paintReplica(performance.now() + 180);
  assert.equal(ctx.telemetryDirty, false);
  const next = structuredClone(snapshot);
  next.seq++;
  next.time += 1 / 15;
  next.robots[1].trauma++;
  guest.snapshot(next);
  replica.paintReplica(performance.now() + 300);
  assert.equal(ctx.telemetryDirty, true);

  win.document.dispatchEvent(new win.KeyboardEvent('keydown', {code: 'KeyD'}));
  replica.sendInputFrame(performance.now() + 150);
  win.dispatchEvent(new win.Event('blur'));
  assert.deepEqual(inputs, [{x: 1, y: 0, seq: 0}, {x: 0, y: 0, seq: 1}]);
  const controlMode = ctx.root.querySelector('#tower-control-mode');
  assert.equal(controlMode.disabled, false);
  controlMode.value = 'direction';
  controlMode.dispatchEvent(new win.Event('change'));
  assert.equal(ctx.root.querySelector('#tower-stick').hidden, true);
  clickPoint(win, 450, 450);
  assert.equal(ctx.root.querySelector('#tower-direction-marker').hidden, false);
  replica.sendInputFrame(performance.now() + 500);
  assert.deepEqual(inputs.at(-1), {goal: [450, 450], seq: 2});
  const acknowledged = structuredClone(next);
  acknowledged.seq++;
  acknowledged.robots[1].destination = [450, 450, 460, 460];
  guest.snapshot(acknowledged);
  replica.paintReplica(performance.now() + 700);
  assert.deepEqual([ctx.towerDestination.x, ctx.towerDestination.y], [460, 460]);
  clickPoint(win, 460, 460);
  assert.equal(ctx.towerDestination, null);
  replica.sendInputFrame(performance.now() + 750);
  assert.deepEqual(inputs.at(-1), {x: 0, y: 0, seq: 3});
});
