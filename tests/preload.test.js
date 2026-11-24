import test from 'node:test';
import assert from 'node:assert/strict';
import {resourceStatus} from '../src/assets/resource-status.js';
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
    const progress=[];
    await preloadTextures({keys:['robotA','robotB'],onProgress:(done,total)=>progress.push([done,total])});
    assert.deepEqual(progress,[[0,2],[1,2],[2,2]]);
    const first=await preloadTextures(),second=await preloadTextures();
    assert.ok(Object.values(first).every(status=>status.loaded));
    assert.deepEqual(second,first);
    assert.equal(requests,Object.keys(ASSETS.textures).length);
    assert.equal(decodes,requests);
    assert.equal(await loadTextureImage(first.robotA.url),await loadTextureImage(first.robotA.url));
    assert.equal(requests,Object.keys(ASSETS.textures).length);
  }finally{globalThis.Image=original;}
});

test('transient failures retry once, reuse successful images and allow a later scene to recover',async()=>{
  const original=globalThis.Image;const attempts=new Map();
  globalThis.Image=class{
    naturalWidth=256;
    set src(url){
      const tries=(attempts.get(url)??0)+1;
      attempts.set(url,tries);
      if(url.includes('stalled'))return;
      const failures=url.includes('later')?2:1;
      queueMicrotask(()=>tries<=failures?this.onerror?.():this.onload?.());
    }
  };
  try{
    const options={timeoutMs:10,retry:true};
    const pending=loadTextureImage('retry-texture.png',options);
    assert.equal(loadTextureImage('retry-texture.png',options),pending);
    assert.equal(resourceStatus().pending,1);
    const recovered=await pending;
    assert.equal(await loadTextureImage('retry-texture.png'),recovered);
    assert.equal(attempts.get('retry-texture.png'),2);
    await assert.rejects(loadTextureImage('later-texture.png',options));
    assert.deepEqual(resourceStatus(),{pending:0,missing:['later-texture.png']});
    assert.ok(await loadTextureImage('later-texture.png',options));
    assert.equal(attempts.get('later-texture.png'),3);
    assert.deepEqual(resourceStatus(),{pending:0,missing:[]});
    await assert.rejects(loadTextureImage('stalled-texture.png',options),/timed out/);
    assert.equal(attempts.get('stalled-texture.png'),2);
  }finally{globalThis.Image=original;}
});
