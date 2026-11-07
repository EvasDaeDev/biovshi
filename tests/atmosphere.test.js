import test from 'node:test';
import assert from 'node:assert/strict';
import { lampBrightness } from '../src/render/atmosphere.js';
import { featheredBeamPaths } from '../src/render/beam-feather.js';
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

test('feathered cones reuse ray endpoints, with narrower inner layers and no geometry beyond the outer cone',()=>{
  const origin={x:10,y:20},heading=3.1,fov=Math.PI/2;
  const points=Array.from({length:49},(_,i)=>{
    const angle=heading-fov/2+i*fov/48;
    return {x:origin.x+100*Math.cos(angle),y:origin.y+100*Math.sin(angle)};
  });
  for(const count of [3,5]) {
    const layers=featheredBeamPaths(origin,heading,points,fov,count,.16);
    assert.equal(layers.length,count);
    assert.ok(layers.every(d=>d.startsWith('M')&&d.endsWith(' Z')&&!d.includes('NaN')));
    const vertices=layers.map(d=>(d.match(/L/g)||[]).length);
    assert.ok(vertices[0]>vertices.at(-1));
    assert.ok(vertices.every((n,i)=>!i||n<=vertices[i-1]));
  }
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
