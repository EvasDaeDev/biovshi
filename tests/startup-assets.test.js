import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {ASSETS} from '../src/assets/manifest.js';
import {showStartupWelcome} from '../src/ui/startup-welcome.js';

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
  dom.window.HTMLCanvasElement.prototype.getContext=function(){return {
    fillRect(){},clearRect(){},drawImage(){},putImageData(){},save(){},restore(){},setTransform(){},transform(){},
    getImageData(x,y,w,h){return {data:new Uint8ClampedArray(w*h*4).fill(128)};},
  };};
  dom.window.HTMLCanvasElement.prototype.toDataURL=()=> 'data:image/png;base64,AAAA';
  let releaseLocations;
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    assert.equal(options.cache,'no-store');
    if(url.pathname==='/locations/start-arena.json'){
      const ward=JSON.parse(fs.readFileSync(new URL('../public/locations/ward.json',import.meta.url),'utf8'));
      return {ok:true,json:async()=>({...ward,id:'start-arena',name:'Тестовая локация'})};
    }
    assert.equal(url.href,'https://startup.test/locations/active.json');
    await new Promise(resolve=>{releaseLocations=resolve;});
    return {ok:true,json:async()=>({version:1,active:['start-arena']})};
  };
  await import('../src/main.js');
  const root=document.getElementById('robot-tag-hops-v22');
  assert.equal(root.inert,true,'controls stay inactive while textures are pending');
  const welcome=root.querySelector('#startup-welcome'),intro=root.querySelector('#startup-intro');
  assert.equal(welcome.open,false,'welcome waits for loading');
  assert.equal(intro.open,false);
  assert.equal(ctx.robots,undefined,'participants are not instantiated before checking images');
  assert.equal(requests,Object.keys(ASSETS.textures).length);
  released=true;for(const finish of pending)finish();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ctx.robots,undefined,'patients wait until active locations have been checked');
  releaseLocations();
  globalThis.fetch=originalFetch;
  for(let i=0;i<100&&document.getElementById('texture-loading');i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(document.getElementById('texture-loading'),null);
  assert.equal(root.inert,false);
  assert.equal(ctx.arenaId,'start-arena');
  assert.equal(root.querySelector('#tag7hop-arena-border').getAttribute('aria-label'),'Тестовая локация');
  assert.equal(ctx.startup.phase,'demo','simulation remains gated on initial load');
  assert.equal(root.querySelector('#launch-game').textContent,'ПОСМОТРЕТЬ БОЙ!');
  assert.equal(root.querySelector('#launch-overlay').hidden,false,'first load shows launch gate');
  assert.equal(requests,Object.keys(ASSETS.textures).length,'tint preparation reuses preloaded images');
  assert.ok(Object.values(ctx.textureAssets).every(status=>status.loaded));
  assert.equal(staticRasters,2,'ambient shading and the initial 1024 floor are prepared once');
  assert.equal(ctx.ambientGlowG.dataset.rasterized,'true');
  assert.equal(ctx.ambientGlowG.getAttribute('filter'),null);
  assert.equal(ctx.ambientGlowG.children.length,1);
  assert.equal(ctx.ambientGlowG.firstElementChild.tagName,'image');
  const {bakeStaticLighting}=await import('../src/render/atmosphere.js');
  await bakeStaticLighting();assert.equal(staticRasters,2);
  assert.equal(ctx.actorsG.querySelectorAll('[data-robot-fallback]').length,0);
  assert.equal(ctx.actorsG.querySelectorAll('[data-skin-segment]').length,52);
  const launch=root.querySelector('#launch-game');
  const read=welcome.querySelector('#startup-read-intro');
  assert.equal(welcome.open,true);
  assert.equal(document.activeElement,read);
  launch.click();
  assert.equal(ctx.startup.phase,'demo','the welcome blocks the menu');

  read.click();
  assert.equal(welcome.open,false);
  assert.equal(intro.open,true);
  assert.equal(document.activeElement,intro.querySelector('h2'));
  assert.equal(intro.querySelector('strong').textContent,'Башня');
  const forward=intro.querySelector('[data-startup-dismiss]');
  assert.equal(forward.textContent,'ВПЕРЕД');
  forward.click();
  assert.equal(intro.open,false);
  assert.equal(document.activeElement,launch);
  assert.equal(root.querySelector('#launch-overlay').hidden,false);
  assert.equal(ctx.startup.phase,'demo','finishing the intro returns to the menu');

  launch.click();
  assert.equal(root.querySelector('#launch-overlay').hidden,true);
  assert.equal(ctx.startup.phase,'spawning');
  ctx.root.__disposeTag();dom.window.close();
});


test('skipping the welcome keeps the intro closed and opens the menu',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html);
  try{
    const root=dom.window.document.querySelector('#robot-tag-hops-v22');
    root.__disposeTag=()=>{};
    showStartupWelcome(root);
    const welcome=root.querySelector('#startup-welcome');
    const skip=welcome.querySelector('[data-startup-dismiss]');
    assert.equal(skip.textContent,'Пропустить');
    skip.click();
    assert.equal(welcome.open,false);
    assert.equal(root.querySelector('#startup-intro').open,false);
    assert.equal(root.querySelector('#launch-overlay').hidden,false);
    assert.equal(dom.window.document.activeElement,root.querySelector('#launch-game'));
    root.__disposeTag();
  }finally{dom.window.close();}
});
