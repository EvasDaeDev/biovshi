import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {TEST_BUILD,BOSS_FLOOR_INTERVAL,storageKey,SESSION_STORAGE} from '../src/build-channel.js';
import {isBossFloor} from '../src/boss/config.js';

test('ordinary build keeps existing save identifiers and bosses every fifth floor',()=>{
 assert.equal(TEST_BUILD,false);assert.equal(BOSS_FLOOR_INTERVAL,5);
 assert.equal(SESSION_STORAGE,'biovshi.local-totalizator.v1');assert.equal(storageKey('biovshi.floor-history'),'biovshi.floor-history');
 assert.deepEqual([1,2,4,5,6,10].filter(isBossFloor),[5,10]);
});

test('compiled test channel creates a floor-two boss and isolates sessions, settings, tutorial and floor database',()=>{
 const script=`
 import assert from 'node:assert/strict';
 globalThis.__TEST_BUILD__=true;
 const channel=await import('./src/build-channel.js');
 assert.equal(channel.TEST_BUILD,true);assert.equal(channel.BOSS_FLOOR_INTERVAL,2);
 const {isBossFloor}=await import('./src/boss/config.js');
 assert.deepEqual([1,2,3,4,5,6,10].filter(isBossFloor),[2,4,6,10]);
 const {startBossScenario}=await import('./scripts/boss-harness.mjs');
 const {ctx}=await import('./src/game/state.js');
 const {bettingSave,bettingLoad}=await import('./src/betting/storage.js');
 const {writeTutorial,freshTutorial,TUTORIAL_STORAGE}=await import('./src/ui/tutorial-model.js');
 const {savePostEffectsPreference,POST_EFFECTS_STORAGE}=await import('./src/render/post-effects.js');
 const {loadControlMode,setControlMode}=await import('./src/tower/control-mode.js');
 const {loadAudioSettings}=await import('./src/audio/audio.js');
 const {accessFloorStore}=await import('./src/render/floor-storage.js');
 const f=startBossScenario({floor:2,variant:'arms'});
 try{
  assert.equal(ctx.robots.length,2);assert.ok(f.boss.isBoss);assert.equal(f.boss.movementLimbs,6);
  assert.equal(ctx.BET_STORAGE,'biovshi.test.local-totalizator.v1');
  localStorage.setItem('biovshi.local-totalizator.v1','untouched main save');
  localStorage.setItem('biovshi.tutorial.v1','untouched main tutorial');
  localStorage.setItem('biovshi.post-effects.v1','on');localStorage.setItem('biovshi.tower-control.v1','control');
  f.boss.damage('head',0,100);bettingSave();assert.equal(bettingLoad().players[0].balance,1100);
  assert.equal(localStorage.getItem('biovshi.local-totalizator.v1'),'untouched main save');
  writeTutorial(localStorage,freshTutorial());assert.equal(TUTORIAL_STORAGE,'biovshi.test.tutorial.v1');
  assert.ok(localStorage.getItem(TUTORIAL_STORAGE));assert.equal(localStorage.getItem('biovshi.tutorial.v1'),'untouched main tutorial');
  savePostEffectsPreference(false);assert.equal(POST_EFFECTS_STORAGE,'biovshi.test.post-effects.v1');assert.equal(localStorage.getItem(POST_EFFECTS_STORAGE),'off');assert.equal(localStorage.getItem('biovshi.post-effects.v1'),'on');
  setControlMode('direction');assert.equal(loadControlMode(),'direction');assert.equal(localStorage.getItem('biovshi.tower-control.v1'),'control');
  const audioReads=[];loadAudioSettings({getItem(key){audioReads.push(key);return null;}});assert.deepEqual(audioReads,['biovshi.test.audio.v1']);
  let database;await assert.rejects(accessFloorStore('floor',undefined,{indexedDB:{open(name){database=name;throw Error('probe');}}}),/probe/);assert.equal(database,'biovshi.test.floor-history');
 }finally{f.close();}
 `;
 const result=spawnSync(process.execPath,['--input-type=module','-'],{cwd:new URL('../',import.meta.url),input:script,encoding:'utf8',timeout:30000});
 assert.equal(result.status,0,result.stderr||result.error?.message||result.stdout);
});
