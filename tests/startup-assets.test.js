import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {ASSETS,sceneTextureKeys} from '../src/assets/manifest.js';
import {showStartupIntro} from '../src/ui/startup-intro.js';

test('real startup waits for the texture check, reuses images for tinting and creates no redundant models',async()=>{
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://startup.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  globalThis.addEventListener=dom.window.addEventListener.bind(dom.window);
  globalThis.removeEventListener=dom.window.removeEventListener.bind(dom.window);
  const pending=[],requests=[];let released=false,staticRasters=0;
  globalThis.Image=class{
    naturalWidth=256;naturalHeight=256;
    set src(value){if(value.startsWith('data:image/svg+xml'))staticRasters++;else requests.push(value);
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
  const intro=root.querySelector('#startup-intro');
  assert.equal(intro.open,false,'the intro waits for loading');
  assert.equal(ctx.robots,undefined,'participants are not instantiated before checking images');
  assert.equal(requests.length,sceneTextureKeys().length);
  for(const key of ['notePatient','artifact1_bg','towerMutation_piston','robotEnemy1'])
    assert.ok(!requests.some(url=>url.endsWith(ASSETS.textures[key])),key+' is not requested during boot');
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
  assert.equal(requests.length,sceneTextureKeys().length,'tint preparation reuses preloaded images');
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
  assert.equal(intro.open,true,'loading opens the intro directly');
  assert.equal(intro.querySelector('h2').textContent,'ЭКЦЕПРИ');
  assert.equal(root.querySelector('#launch-title').textContent,'ЭКЦЕПРИ');
  assert.match(document.title,/ЭКЦЕПРИ \(ECCEPRY\)/);
  ctx.tutorial.sync();
  assert.equal(ctx.tutorial.active,false,'tutorial waits while the intro is open');
  launch.click();
  assert.equal(ctx.startup.phase,'demo','the intro blocks the menu');
  assert.equal(document.activeElement,intro.querySelector('h2'));
  assert.equal(intro.querySelector('strong').textContent,'Башня');
  const forward=intro.querySelector('[data-paper-dismiss]');
  assert.equal(forward.textContent,'ВПЕРЕД');
  forward.click();
  assert.equal(intro.open,false);
  assert.equal(document.activeElement,launch);
  assert.equal(root.querySelector('#launch-overlay').hidden,false);
  assert.equal(ctx.startup.phase,'demo','finishing the intro returns to the menu');
  ctx.tutorial.sync();
  assert.equal(ctx.tutorial.active,true,'tutorial begins after the intro closes');
  for(let i=0;i<10&&ctx.tutorial.active;i++)document.querySelector('[data-tutorial-next]').click();
  assert.equal(ctx.tutorial.active,false);

  launch.click();
  assert.equal(root.querySelector('#launch-overlay').hidden,true);
  assert.equal(ctx.startup.phase,'spawning');
  ctx.root.__disposeTag();dom.window.close();
});


test('only a press and click on the lore backdrop dismisses it',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html);
  try{
    const root=dom.window.document.querySelector('#robot-tag-hops-v22');
    root.__disposeTag=()=>{};
    showStartupIntro(root);
    const intro=root.querySelector('#startup-intro');
    const dispatch=(target,type,x)=>target.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,clientX:x,clientY:200}));
    intro.getBoundingClientRect=()=>({left:100,right:500,top:100,bottom:500});
    dispatch(intro,'pointerdown',101);
    dispatch(intro,'click',101);
    assert.equal(intro.open,true,'clicking inside the panel padding keeps it open');
    dispatch(intro,'pointerdown',101);
    dispatch(intro,'click',20);
    assert.equal(intro.open,true,'dragging from the panel to the backdrop keeps it open');
    dispatch(intro,'pointerdown',20);
    dispatch(intro,'click',20);
    assert.equal(intro.open,false);
    assert.equal(root.querySelector('#launch-overlay').hidden,false);
    assert.equal(dom.window.document.activeElement,root.querySelector('#launch-game'));
    root.__disposeTag();
  }finally{dom.window.close();}
});
