import test from 'node:test';
import assert from 'node:assert/strict';
import { tintPixels } from '../src/render/texture-tint.js';

test('floor tint keeps its colour on average while retaining dark and light details', () => {
  const pixels=new Uint8ClampedArray([64,64,64,255, 128,128,128,255, 192,192,192,255]);
  tintPixels(pixels,[1,4,9]);
  assert.deepEqual([...pixels.slice(4,8)],[1,4,9,255]);
  assert.ok(pixels[2]<pixels[6]&&pixels[6]<pixels[10]);
  for(let c=0;c<3;c++)assert.ok(Math.abs((pixels[c]+pixels[4+c]+pixels[8+c])/3-[1,4,9][c])<=1);
});

test('transparent pixels do not darken the tint average; source alpha is preserved', () => {
  const pixels=new Uint8ClampedArray([0,0,0,0, 128,128,128,255]);
  tintPixels(pixels,[1,4,9]);
  assert.equal(pixels[3],0);
  assert.deepEqual([...pixels.slice(4)],[1,4,9,255]);
});
