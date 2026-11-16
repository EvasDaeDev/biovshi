import test from 'node:test';
import assert from 'node:assert/strict';
import { ctx } from '../src/game/state.js';
import { oilColor } from '../src/utils/colors.js';

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

import {nextAmbientHue,ambientHueColor,selectArenaAmbient,rerollArenaAmbient} from '../src/render/ambient-hue.js';
import {CONFIG} from '../src/config.js';
import {JSDOM} from 'jsdom';

test('ambient rotation changes hue by at least 45 degrees while retaining saturation and lightness',()=>{
 assert.equal(nextAmbientHue(null,0),0);
 assert.equal(nextAmbientHue(null,.5),180);
 for(const previous of [0,18,141,320,359]){
  for(const sample of [0,.1,.5,.9,1]){
   const next=nextAmbientHue(previous,sample);
   const distance=Math.abs(next-previous),circular=Math.min(distance,360-distance);
   assert.ok(next>=0&&next<360);
   assert.ok(circular>=45-1e-7,'new entry must change hue');
  }
 }
 const red=ambientHueColor(CONFIG.light.ambientColor,0).match(/[0-9.]+/g).map(Number);
 const cyan=ambientHueColor(CONFIG.light.ambientColor,180).match(/[0-9.]+/g).map(Number);
 assert.equal(red[0],0);assert.equal(cyan[0],180);
 assert.deepEqual(red.slice(1),cyan.slice(1),'hue is the only changed HSL channel');
});

test('a reused arena recolours rasterized ambient and obstacle lights without touching base settings',()=>{
 const old=Object.fromEntries(['ambientHue','ambientColor','ambientBakedHue','ambientGlowG','defs','arenaRenderer'].map(k=>[k,ctx[k]]));
 const dom=new JSDOM('<svg xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="tag7hop-obstacle-glow"><stop stop-color="#000"/></radialGradient></defs><g id="ambient" data-rasterized="true"><image/></g></svg>');
 try{
  ctx.ambientHue=null;
  const base=CONFIG.light.ambientColor;
  selectArenaAmbient(0);ctx.ambientBakedHue=ctx.ambientHue;
  const svg=dom.window.document.querySelector('svg');
  ctx.ambientGlowG=svg.querySelector('#ambient');ctx.defs=svg.querySelector('defs');
  let applied=null;
  ctx.arenaRenderer={setAmbientHue(delta){applied=delta;}};
  const first=ctx.ambientColor;
  rerollArenaAmbient(.5);
  assert.notEqual(ctx.ambientColor,first);
  assert.equal(ctx.ambientHue,180);
  assert.equal(applied,-180);
  assert.equal(ctx.ambientGlowG.style.filter,'hue-rotate(-180deg)');
  assert.equal(ctx.defs.querySelector('stop').getAttribute('stop-color'),ctx.ambientColor);
  assert.equal(CONFIG.light.ambientColor,base);
 }finally{
  for(const [key,value] of Object.entries(old))ctx[key]=value;
  dom.window.close();
 }
});
