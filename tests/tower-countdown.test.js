import test from 'node:test';
import assert from 'node:assert/strict';
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
