import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { prepareTexture } from '../scripts/prepare-textures.mjs';

async function temporary(run) {
  const dir=await fs.mkdtemp(path.join(process.cwd(),'.texture-test-'));
  try { await run(dir); } finally { await fs.rm(dir,{recursive:true,force:true}); }
}

test('texture processing uses lossless WebP and keeps pixel edges without blended colours', async () => temporary(async dir => {
  const input=path.join(dir,'checker.png'),output=path.join(dir,'checker.webp');
  const pixels=Buffer.alloc(8*8*3);
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)pixels[(y*8+x)*3]=((x>>1)+(y>>1))%2?255:0;
  await sharp(pixels,{raw:{width:8,height:8,channels:3}}).png().toFile(input);
  const meta=await prepareTexture(input,output,{maxSize:4});
  assert.equal(meta.format,'webp');
  assert.equal(meta.width,4);assert.equal(meta.height,4);
  const decoded=await sharp(output).raw().toBuffer();
  assert.ok(decoded.includes(0)&&decoded.includes(255));
  for(let i=0;i<decoded.length;i+=3){
    assert.ok(decoded[i]===0||decoded[i]===255,'no interpolated edge pixels');
    assert.equal(decoded[i+1],0);assert.equal(decoded[i+2],0);
  }
}));

test('small textures are not enlarged and partially transparent colours survive compression', async () => temporary(async dir => {
  const input=path.join(dir,'alpha.png'),output=path.join(dir,'alpha.webp');
  const pixels=Buffer.from([255,10,20,128,15,100,0,255]);
  await sharp(pixels,{raw:{width:2,height:1,channels:4}}).png().toFile(input);
  const meta=await prepareTexture(input,output);
  assert.equal(meta.width,2);assert.equal(meta.height,1);
  assert.deepEqual(await sharp(output).ensureAlpha().raw().toBuffer(),pixels);
}));
