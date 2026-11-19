import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {towerCountdownDuration,towerCountdownText} from '../src/tower/countdown.js';

test('Tower countdown matches actual entrance duration and replaces the final second with ПОГНАЛИ',()=>{
 const spawn={spawnIntervalSec:.4,spawnDurationSec:.2};
 assert.ok(Math.abs(towerCountdownDuration(2,spawn)-.6)<1e-9);
 assert.ok(Math.abs(towerCountdownDuration(10,spawn)-3.8)<1e-9);
 assert.equal(towerCountdownText(3.8,0),'4');
 assert.equal(towerCountdownText(3.8,1),'3');
 assert.equal(towerCountdownText(3.8,2),'2');
 assert.equal(towerCountdownText(3.8,2.8),'ПОГНАЛИ!!!');
 assert.equal(towerCountdownText(3.8,3.79),'ПОГНАЛИ!!!');
 assert.ok(Math.abs(towerCountdownDuration(10,{spawnIntervalSec:.75,spawnDurationSec:.2})-6.95)<1e-9);
});

test('tower countdown is routed through streamer instead of a center-stage overlay',()=>{
 const session=fs.readFileSync(new URL('../src/game/session.js',import.meta.url),'utf8');
 assert.match(session,/streamerMascot\?\.showCountdown\?\.\(text\)/);
 assert.match(session,/streamerMascot\?\.finishCountdown\?\.\(\)/);
 assert.doesNotMatch(session,/createElement\('output'\)|countdown\.textContent/);
 const css=fs.readFileSync(new URL('../styles/tower.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/#tower-start-countdown/);
});
