import test from 'node:test';
import assert from 'node:assert/strict';
import { paddedEllipse, obstacleLightBounds } from '../src/render/ground-spots.js';
import { liquidVariant } from '../src/render/liquid-sprites.js';

test('torso ellipse adds 20 percent to both extents and follows rotation',()=>{
  const points=[{x:0,y:0},{x:10,y:0},{x:10,y:5},{x:0,y:5}];
  const e=paddedEllipse(points,0);
  assert.deepEqual(e,{x:5,y:2.5,rx:6,ry:3,angle:0});
  const angle=.73,c=Math.cos(angle),s=Math.sin(angle);
  const rotated=points.map(p=>({x:p.x*c-p.y*s,y:p.x*s+p.y*c}));
  const r=paddedEllipse(rotated,angle);
  assert.ok(Math.abs(r.rx-e.rx)<1e-8&&Math.abs(r.ry-e.ry)<1e-8);
  assert.ok(Math.abs(r.x-(e.x*c-e.y*s))<1e-8);
});

test('obstacle light size is polygon diameter plus 100 centimetres',()=>{
  const e=obstacleLightBounds([{x:0,y:0},{x:70,y:0},{x:70,y:70},{x:0,y:70}]);
  assert.equal(e.x,35);assert.equal(e.y,35);
  assert.equal(e.radius*2,Math.hypot(70,70)+100);
});

test('all 16 liquid sprites are reachable without consuming random numbers',()=>{
  const original=Math.random;Math.random=()=>{throw new Error('must not consume combat RNG');};
  try {
    const variants=new Set();
    for(let i=0;i<256;i++) {
      const choice=liquidVariant(42,i,2);
      assert.deepEqual(liquidVariant(42,i,2),choice);
      assert.ok(choice.index>=0&&choice.index<16);
      assert.ok(choice.angle>=0&&choice.angle<360);
      variants.add(choice.index);
    }
    assert.equal(variants.size,16);
  } finally {Math.random=original;}
});
