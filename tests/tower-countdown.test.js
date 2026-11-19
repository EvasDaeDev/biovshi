import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {towerCountdownDuration,towerCountdownText,TOWER_START_COUNTDOWN_SEC} from '../src/tower/countdown.js';

test('Tower countdown starts at four seconds, replaces the final second with ПОГНАЛИ and never cuts short a landing',()=>{
 const spawn={spawnIntervalSec:.4,spawnDurationSec:.2};
 assert.equal(TOWER_START_COUNTDOWN_SEC,4);
 assert.equal(towerCountdownDuration(2,spawn),4);
 assert.equal(towerCountdownDuration(10,spawn),4);
 assert.equal(towerCountdownText(4,0),'4');
 assert.equal(towerCountdownText(4,1),'3');
 assert.equal(towerCountdownText(4,2),'2');
 assert.equal(towerCountdownText(4,3),'ПОГНАЛИ!!!');
 assert.equal(towerCountdownText(4,3.99),'ПОГНАЛИ!!!');
 assert.ok(towerCountdownDuration(10,{spawnIntervalSec:.75,spawnDurationSec:.2})>4);
});

test('tower countdown is routed through streamer instead of a center-stage overlay',()=>{
 const session=fs.readFileSync(new URL('../src/game/session.js',import.meta.url),'utf8');
 assert.match(session,/streamerMascot\?\.showCountdown\?\.\(text\)/);
 assert.match(session,/streamerMascot\?\.finishCountdown\?\.\(\)/);
 assert.doesNotMatch(session,/createElement\('output'\)|countdown\.textContent/);
 const css=fs.readFileSync(new URL('../styles/tower.css',import.meta.url),'utf8');
 assert.doesNotMatch(css,/#tower-start-countdown/);
});
