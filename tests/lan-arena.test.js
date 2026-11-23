import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {step} from '../src/game/loop.js';
import {patientCombatStats} from '../src/game/patients.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
import {createLanRoster} from '../src/lan/characters.js';
import {installLanHostArena} from '../src/lan/host-arena.js';
import {newTower} from '../src/tower/model.js';
import {showResults} from '../src/ui/results.js';

function launch(t, {members, ai = [], local, tower, arenaId = 'ward'}) {
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
  const multiplayer = {fighters: createLanRoster({members, ai}, local, tower),
    onFinish: result => results.push(result), onReturn: () => { returned = true; }};
  initializeGame({multiplayer, arenaId});
  t.after(() => { ctx.root.__disposeTag(); win.close(); });
  installLanHostArena(multiplayer).start();
  advanceStartup(10);
  assert.equal(ctx.startup.phase, 'running');
  return {results, win, returned: () => returned};
}

const fighter = (id, profile) => ({id, role: 'player', name: id, profile});

test('LAN solo scenario keeps running and ends manually without writing economy or Tower data', t => {
  const tower = newTower(2);
  tower.stats = [6, 4, 5];
  tower.surgeries = [{procedure: 'extend_spine'}];
  const source = structuredClone(tower);
  const {results, win, returned} = launch(t, {members: [fighter('хозяин', 'tower')], local: 'хозяин', tower});
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
  assert.deepEqual(results, [{winner: null, elapsedSec: 2 / 60, reason: 'manual'}]);
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
  assert.deepEqual(results, [{winner: 1, elapsedSec: 2 / 60, reason: 'combat'}]);
  showResults();
  assert.match(ctx.resultsTitle.textContent, /ПОБЕДИТЕЛЬ — хозяин/);
  assert.equal(localStorage.getItem(ctx.BET_STORAGE), null);
});

test('LAN host can spectate a full arena of ten AI fighters', t => {
  launch(t, {members: [{id: 'наблюдатель', role: 'spectator'}], local: 'наблюдатель',
    ai: Array(10).fill('basic'), arenaId: 'columns'});
  assert.equal(ctx.robots.length, 10);
  assert.equal(ctx.root.querySelector('#tower-controls').hidden, true);
  step(1 / 60);
  assert.ok(ctx.intents.every(intent => !intent.manual));
  assert.equal(ctx.combat.finished, false);
});
