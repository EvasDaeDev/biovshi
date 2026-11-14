import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {screenRect,effectiveZoom,hasUnscaledZoomRects,scrollPanelToTarget,visibleViewport,localPoint} from '../src/ui/geometry.js';
import {arenaPoint} from '../src/tower/input.js';
import {ctx} from '../src/game/state.js';
const rect=(left,top,width,height)=>({x:left,y:top,left,top,right:left+width,bottom:top+height,width,height});
function fixture(legacy){
 const dom=new JSDOM('<main style="zoom:0.4"><section><button>Target</button><canvas></canvas></section></main>',{pretendToBeVisual:true});
 const win=dom.window,doc=win.document;
 win.HTMLElement.prototype.getBoundingClientRect=function(){
  if(this.style.zoom==='2'&&this.style.width==='10px')return rect(0,0,legacy?10:20,legacy?10:20);
  return rect(0,0,0,0);
 };
 return {dom,win,doc,root:doc.querySelector('main'),panel:doc.querySelector('section'),target:doc.querySelector('button'),canvas:doc.querySelector('canvas')};
}
for(const legacy of [false,true]){
 test(`${legacy?'legacy WebKit':'modern browser'} exposes the same screen rectangle at CSS zoom 0.4`,()=>{
  const f=fixture(legacy),raw=legacy?rect(600,200,400,100):rect(240,80,160,40);
  f.target.getBoundingClientRect=()=>raw;
  assert.equal(hasUnscaledZoomRects(f.doc),legacy);assert.deepEqual(screenRect(f.target),rect(240,80,160,40));
  assert.equal(f.doc.body.children.length,1,'feature probe is removed');
  // A dialog outside the game root must not acquire the game's zoom correction.
  const dialog=f.doc.createElement('dialog');f.doc.body.append(dialog);dialog.getBoundingClientRect=()=>rect(40,20,700,250);
  assert.deepEqual(screenRect(dialog),rect(40,20,700,250));
  assert.deepEqual(localPoint(screenRect(f.target),screenRect(dialog)),{x:200,y:60});f.dom.window.close();
 });
 test(`${legacy?'legacy WebKit':'modern browser'} preserves pointer-to-world coordinates on a scaled canvas`,()=>{
  const f=fixture(legacy);f.canvas.getBoundingClientRect=()=>legacy?rect(250,125,700,700):rect(100,50,280,280);
  const old={svg:ctx.svg,fieldWidth:ctx.fieldWidth,fieldHeight:ctx.fieldHeight};
  ctx.svg={getAttribute:()=> '0 0 700 700'};ctx.fieldWidth=ctx.fieldHeight=700;
  try{assert.deepEqual(arenaPoint({clientX:240,clientY:190},f.canvas),{x:350,y:350});}
  finally{Object.assign(ctx,old);f.dom.window.close();}
 });
 test(`${legacy?'legacy WebKit':'modern browser'} scrolls only the panel in logical pixels`,()=>{
  const f=fixture(legacy);
  f.panel.getBoundingClientRect=()=>legacy?rect(100,100,500,200):rect(40,40,200,80);
  f.target.getBoundingClientRect=()=>legacy?rect(120,310,100,40):rect(48,124,40,16);
  Object.defineProperties(f.panel,{offsetHeight:{value:200},clientHeight:{value:200},clientTop:{value:0}});
  f.target.scrollIntoView=()=>assert.fail('must not scroll ancestor windows');
  f.win.scrollTo=()=>assert.fail('must not move the page');
  f.panel.scrollTop=10;scrollPanelToTarget(f.panel,f.target);
  assert.equal(f.panel.scrollTop,60,'20 screen pixels equal 50 logical pixels at zoom 0.4');
  assert.equal(f.win.scrollX,0);assert.equal(f.win.scrollY,0);f.dom.window.close();
 });
}
test('inverse zoom on touch controls cancels the parent scale exactly once',()=>{
 const f=fixture(true);f.target.style.zoom='2.5';f.target.getBoundingClientRect=()=>rect(18,18,168,168);
 assert.equal(effectiveZoom(f.target),1);assert.deepEqual(screenRect(f.target),rect(18,18,168,168));f.dom.window.close();
});
test('visual viewport offsets and overlay-local coordinates use the same origin',()=>{
 const view=visibleViewport({innerWidth:844,innerHeight:390,visualViewport:{offsetLeft:40,offsetTop:20,width:700,height:250}});
 assert.deepEqual(view,{x:40,y:20,width:700,height:250});
 assert.deepEqual(localPoint({x:320,y:80},rect(40,20,700,250)),{x:280,y:60});
});
