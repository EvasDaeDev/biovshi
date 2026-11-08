import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from '../src/game/state.js';
import { oilColor } from '../src/utils/colors.js';

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
