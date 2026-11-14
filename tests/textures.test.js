import test from 'node:test';
import assert from 'node:assert/strict';
import { tintPixels } from '../src/render/texture-tint.js';

test('floor tint keeps its colour on average while retaining dark and light details', () => {
  const pixels=new Uint8ClampedArray([64,64,64,255, 128,128,128,255, 192,192,192,255]);
  tintPixels(pixels,[1,4,9],1);
  assert.deepEqual([...pixels.slice(4,8)],[1,4,9,255]);
  assert.ok(pixels[2]<pixels[6]&&pixels[6]<pixels[10]);
  for(let c=0;c<3;c++)assert.ok(Math.abs((pixels[c]+pixels[4+c]+pixels[8+c])/3-[1,4,9][c])<=1);
});

test('transparent pixels do not darken the tint average; source alpha is preserved', () => {
  const pixels=new Uint8ClampedArray([0,0,0,0, 128,128,128,255]);
  tintPixels(pixels,[1,4,9],1);
  assert.equal(pixels[3],0);
  assert.deepEqual([...pixels.slice(4)],[1,4,9,255]);
});


test('zero strength keeps the original texture unchanged', () => {
  const pixels=new Uint8ClampedArray([64,70,80,255, 192,180,150,128]);
  const original=pixels.slice();
  tintPixels(pixels,[1,4,9],0);
  assert.deepEqual(pixels,original);
});

test('half strength blends the original texture with the tinted colour', () => {
  const pixels=new Uint8ClampedArray([128,128,128,255]);
  tintPixels(pixels,[1,4,9],0.5);
  assert.deepEqual([...pixels],[65,66,69,255]);
});


test('recolouring a red liquid sprite removes red hue while preserving alpha and shading',()=>{
 const pixels=new Uint8ClampedArray([180,12,8,255,90,6,4,128,0,0,0,0]);
 const alpha=[pixels[3],pixels[7],pixels[11]];
 tintPixels(pixels,[99,217,255],1);
 assert.deepEqual([pixels[3],pixels[7],pixels[11]],alpha);
 for(const i of [0,4]){assert.ok(pixels[i+2]>=pixels[i+1]);assert.ok(pixels[i+1]>pixels[i]);}
 assert.ok(pixels[0]>pixels[4],'source light and dark details survive the colour replacement');
});
