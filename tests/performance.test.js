import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRenderProfile, recordFrame, detectMobileDevice } from '../src/render/performance.js';
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


test('mobile app browsers use the light auto profile even when pointer media queries report a mouse',()=>{
  const fine=()=>({matches:false});
  for(const nav of [{userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS) AppleWebKit Mobile'},
    {userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit'},
    {userAgentData:{mobile:true}},{platform:'MacIntel',maxTouchPoints:5}]){
    const mobile=detectMobileDevice(nav,fine);
    assert.equal(mobile,true);
    assert.equal(chooseRenderProfile('auto',mobile).name,'light');
    assert.equal(chooseRenderProfile('full',mobile).name,'full','explicit quality is respected');
  }
  assert.equal(detectMobileDevice({userAgent:'Desktop',platform:'Linux',maxTouchPoints:0},fine),false);
});
