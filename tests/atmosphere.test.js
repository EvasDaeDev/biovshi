import test from 'node:test';
import assert from 'node:assert/strict';
import { lampBrightness } from '../src/render/atmosphere.js';
import { CONFIG } from '../src/config.js';
import { ctx } from '../src/game/state.js';
import { oilColor } from '../src/utils/colors.js';

test('lamp dips are rare, independent, bounded and respect reduced motion without RNG',()=>{
  const original=Math.random;Math.random=()=>{throw new Error('cosmetics must not consume RNG');};
  try {
    let dips=0,different=0,samples=0;
    for(let t=0;t<80;t+=.01) {
      const a=lampBrightness(t,0),b=lampBrightness(t,1);
      assert.ok(a>=1-CONFIG.light.flickerDepth&&a<=1);
      assert.ok(b>=1-CONFIG.light.flickerDepth&&b<=1);
      if(a<.999)dips++;
      if(Math.abs(a-b)>.01)different++;
      assert.equal(lampBrightness(t,0,true),1);
      assert.equal(lampBrightness(t,0),a);
      samples++;
    }
    assert.ok(dips>0&&dips/samples<.06);
    assert.ok(different>0);
  } finally {Math.random=original;}
});

test('oil has a narrow dark-red range and dries darker with lower saturation',()=>{
  ctx.OIL_HUES=[0,4,8,12];
  for(let id=0;id<4;id++) {
    const fresh=oilColor(id),dry=oilColor(id,.9,1);
    const numbers=s=>s.match(/[\d.]+/g).map(Number);
    const a=numbers(fresh),b=numbers(dry);
    assert.ok(a[2]<15&&b[2]<a[2]);
    assert.ok(b[1]<a[1]);
    assert.equal(a[3],.9);
    assert.ok(a[0]>=350||a[0]<=12);
  }
});
