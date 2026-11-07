import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRenderProfile, recordFrame } from '../src/render/performance.js';
import { ctx } from '../src/game/state.js';

test('automatic graphics selects light for touch; explicit full remains available', () => {
  assert.equal(chooseRenderProfile('auto', true).name,'light');
  assert.equal(chooseRenderProfile('auto', false).name,'full');
  assert.equal(chooseRenderProfile('full', true).name,'full');
  assert.equal(chooseRenderProfile('light', false).name,'light');
});

test('FPS measures game paints rather than display refresh; pausing clears stale readings', () => {
  globalThis.document={hidden:false};
  ctx.startup={phase:'running'};ctx.paused=false;
  ctx.frameStats={started:null,paints:0};
  ctx.fpsOutput={textContent:'— FPS'};
  for(let i=0;i<=60;i++)recordFrame(i*1000/60,i%2===0);
  assert.equal(ctx.fpsOutput.textContent,'30 FPS');
  ctx.paused=true;recordFrame(1100,false);
  assert.equal(ctx.fpsOutput.textContent,'— FPS');
  ctx.paused=false;recordFrame(4000,true);
  assert.equal(ctx.fpsOutput.textContent,'— FPS');
});
