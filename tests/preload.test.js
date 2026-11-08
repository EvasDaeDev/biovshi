import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS} from '../src/assets/manifest.js';
import {loadTextureImage,preloadTextures} from '../src/assets/preload.js';

test('preflight checks and decodes every texture once; later requests reuse loaded images',async()=>{
  const original=globalThis.Image;let requests=0,decodes=0;
  globalThis.Image=class{
    naturalWidth=256;
    set src(value){requests++;queueMicrotask(()=>this.onload?.());}
    async decode(){decodes++;}
  };
  try{
    const first=await preloadTextures(),second=await preloadTextures();
    assert.ok(Object.values(first).every(status=>status.loaded));
    assert.deepEqual(second,first);
    assert.equal(requests,Object.keys(ASSETS.textures).length);
    assert.equal(decodes,requests);
    assert.equal(await loadTextureImage(first.robotA.url),await loadTextureImage(first.robotA.url));
    assert.equal(requests,Object.keys(ASSETS.textures).length);
  }finally{globalThis.Image=original;}
});

test('missing and stalled textures resolve to failure without repeated network attempts or hanging startup',async()=>{
  const original=globalThis.Image;let requests=0;
  globalThis.Image=class{set src(value){requests++;if(value.includes('missing'))queueMicrotask(()=>this.onerror?.());}};
  try{
    await assert.rejects(loadTextureImage('missing-texture.png'));
    await assert.rejects(loadTextureImage('missing-texture.png'));
    assert.equal(requests,1);
    await assert.rejects(loadTextureImage('stalled-texture.png',{timeoutMs:5}),/timed out/);
    assert.equal(requests,2);
  }finally{globalThis.Image=original;}
});
