import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {ASSETS} from '../src/assets/manifest.js';

test('real startup waits for the texture check, reuses images for tinting and creates no redundant models',async()=>{
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://startup.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
  const pending=[];let requests=0,released=false,staticRasters=0;
  globalThis.Image=class{
    naturalWidth=256;naturalHeight=256;
    set src(value){if(value.startsWith('data:image/svg+xml'))staticRasters++;else requests++;
      if(released)queueMicrotask(()=>this.onload?.());else pending.push(()=>this.onload?.());}
    async decode(){}
  };
  const create=document.createElement.bind(document);
  document.createElement=(name,...args)=>name==='canvas'?{
    width:0,height:0,
    getContext(){return {fillRect(){},clearRect(){},drawImage(){},putImageData(){},
      getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4).fill(128)};},
    };},
    toDataURL(){return 'data:image/png;base64,AAAA';},
  }:create(name,...args);
  await import('../src/main.js');
  const root=document.getElementById('robot-tag-hops-v22');
  assert.equal(root.inert,true,'controls stay inactive while textures are pending');
  assert.equal(ctx.robots,undefined,'participants are not instantiated before checking images');
  assert.equal(requests,Object.keys(ASSETS.textures).length);
  released=true;for(const finish of pending)finish();
  for(let i=0;i<100&&document.getElementById('texture-loading');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('texture-loading'),null);
  assert.equal(root.inert,false);
  assert.equal(requests,Object.keys(ASSETS.textures).length,'tint preparation reuses preloaded images');
  assert.ok(Object.values(ctx.textureAssets).every(status=>status.loaded));
  assert.equal(staticRasters,1,'stationary ambient shading is prepared once');
  assert.equal(ctx.ambientGlowG.dataset.rasterized,'true');
  assert.equal(ctx.ambientGlowG.getAttribute('filter'),null);
  assert.equal(ctx.ambientGlowG.children.length,1);
  assert.equal(ctx.ambientGlowG.firstElementChild.tagName,'image');
  const {bakeStaticLighting}=await import('../src/render/atmosphere.js');
  await bakeStaticLighting();assert.equal(staticRasters,1);
  assert.equal(ctx.actorsG.querySelectorAll('[data-robot-fallback]').length,0);
  assert.equal(ctx.actorsG.querySelectorAll('[data-skin-segment]').length,52);
  ctx.root.__disposeTag();dom.window.close();
});
