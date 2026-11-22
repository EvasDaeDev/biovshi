import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession} from '../src/betting/ledger.js';
import {fitField} from '../src/ui/controls.js';

function setup({touch=true,visual=true}={}){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://keyboard.test/',pretendToBeVisual:true});
 const win=dom.window,doc=win.document;
 for(const key of ['document','localStorage','Event'])globalThis[key]=win[key];
 globalThis.matchMedia=()=>({matches:touch});
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 Object.defineProperties(win,{innerWidth:{value:844,writable:true,configurable:true},innerHeight:{value:390,writable:true,configurable:true}});
 const view=new win.EventTarget();Object.assign(view,{width:844,height:390,offsetLeft:0,offsetTop:0,scale:1});
 if(visual)Object.defineProperty(win,'visualViewport',{value:view,configurable:true});
 const orientation=new win.EventTarget();orientation.type='landscape-primary';
 Object.defineProperty(win.screen,'orientation',{value:orientation,configurable:true});
 ctx.arenaRenderer=null;
 const session=betNewSession(['Первый','Второй'],100);
 initializeGame({session,entry:'betting'});
 doc.querySelector('#launch-overlay').hidden=true;
 const fields=[...doc.querySelectorAll('[data-bet-player] input')],panel=doc.querySelector('#bet-overlay .bet-panel');
 panel.getBoundingClientRect=()=>({left:50,top:20,right:750,bottom:370,width:700,height:350});
 const resize=(width,height,{inner=false}={})=>{
  view.width=width;view.height=height;
  if(!visual||inner){win.innerWidth=width;win.innerHeight=height;}
  if(visual)view.dispatchEvent(new win.Event('resize'));else win.dispatchEvent(new win.Event('resize'));
  if(visual&&inner)win.dispatchEvent(new win.Event('resize'));
 };
 const geometry=()=>({scale:ctx.layoutScale,width:ctx.root.style.width,height:ctx.root.style.getPropertyValue('--game-height'),arena:[ctx.fieldWidth,ctx.fieldHeight]});
 return {dom,win,doc,view,orientation,fields,panel,resize,geometry,session,close(){ctx.root.__disposeTag();dom.window.close();}};
}

for(const visual of [true,false])for(const expanded of [true,false])test(`keyboard preserves game and arena size (${visual?'visual':'window'} viewport, ${expanded?'expanded':'normal'} arena)`,()=>{
 const f=setup({visual});
 try{
  if(expanded)ctx.setArenaExpanded(true);
  f.fields[0].value='23';f.fields[0].focus();
  const before=f.geometry();f.panel.scrollTop=17;
  f.resize(844,150,{inner:true});fitField();
  assert.equal(ctx.keyboardViewport.active,true);assert.deepEqual(f.geometry(),before);
  assert.equal(f.panel.classList.contains('keyboard-input-panel'),true);
  assert.equal(f.panel.style.position,'fixed');assert.ok(parseFloat(f.panel.style.maxHeight)*ctx.layoutScale<=134.01);
  assert.equal(f.doc.activeElement,f.fields[0]);assert.equal(f.fields[0].value,'23');
  f.resize(844,390,{inner:true});
  assert.equal(ctx.keyboardViewport.active,false);assert.deepEqual(f.geometry(),before);
  assert.equal(f.panel.style.position,'');assert.equal(f.panel.style.maxHeight,'');assert.equal(f.panel.scrollTop,17);
 }finally{f.close();}
});

test('switching inputs and blurring before the closing animation finishes cannot shrink the game',async()=>{
 const f=setup();
 try{
  f.fields[0].focus();const before=f.geometry();f.resize(844,150);
  f.fields[1].focus();await Promise.resolve();assert.deepEqual(f.geometry(),before);assert.equal(ctx.keyboardViewport.active,true);
  f.fields[1].blur();await Promise.resolve();fitField();
  assert.deepEqual(f.geometry(),before);assert.equal(ctx.keyboardViewport.active,true);
  assert.equal(f.panel.classList.contains('keyboard-input-panel'),false);
  f.resize(844,390);assert.equal(ctx.keyboardViewport.active,false);assert.deepEqual(f.geometry(),before);
 }finally{f.close();}
});

test('hardware-keyboard focus, browser chrome and genuine window resizing still adapt normally',()=>{
 const f=setup();
 try{
  f.fields[0].focus();const before=f.geometry();
  f.resize(844,350);assert.equal(ctx.keyboardViewport.active,false);assert.notEqual(ctx.layoutScale,before.scale);
  f.resize(1200,820,{inner:true});assert.equal(ctx.keyboardViewport.active,false);assert.equal(ctx.layoutScale,1);
  f.fields[0].blur();f.resize(1200,400);assert.equal(ctx.keyboardViewport.active,false);assert.ok(ctx.layoutScale<1);
 }finally{f.close();}
});

test('a width change or a real orientation change releases the old keyboard size lock',()=>{
 const f=setup();
 try{
  f.fields[0].focus();f.resize(844,150);assert.equal(ctx.keyboardViewport.active,true);
  f.orientation.type='portrait-primary';f.resize(390,844,{inner:true});
  assert.equal(ctx.keyboardViewport.active,false);assert.equal(ctx.orientationBlocked,true);
  assert.equal(ctx.layoutViewport.width,390);assert.equal(ctx.layoutViewport.height,844);
  f.orientation.type='landscape-primary';f.resize(844,390,{inner:true});
  assert.equal(ctx.orientationBlocked,false);
 }finally{f.close();}
});

test('desktop text focus and mobile non-editable controls do not activate keyboard handling',()=>{
 for(const touch of [true,false]){
  const f=setup({touch});
  try{
   if(touch){f.fields[0].readOnly=true;f.fields[0].focus();}else f.fields[0].focus();
   f.resize(844,150);assert.equal(ctx.keyboardViewport.active,false);assert.equal(f.panel.style.position,'');
  }finally{f.close();}
 }
});

test('viewport offsets move only the form and browser zoom does not become another game scale',()=>{
 const f=setup();
 try{
  f.fields[0].focus();const before=f.geometry();
  f.view.scale=2;f.resize(422,195);assert.deepEqual(f.geometry(),before);
  f.view.scale=1;f.view.offsetTop=25;f.view.offsetLeft=10;f.resize(844,150);
  assert.deepEqual(f.geometry(),before);
  assert.ok(Math.abs(parseFloat(f.panel.style.top)*ctx.layoutScale-33)<.01);
  assert.equal(f.win.scrollX,0);assert.equal(f.win.scrollY,0);
 }finally{f.close();}
});

test('nested input dialogs are adjusted independently and original inline styles survive restoration',()=>{
 const f=setup();
 try{
  f.doc.querySelector('#bet-add-player').click();
  const dialog=f.doc.querySelector('.betting-input-dialog'),input=dialog.querySelector('input');
  dialog.style.maxHeight='321px';dialog.style.margin='7px';input.focus();
  const before=f.geometry();f.resize(844,150);
  assert.equal(dialog.classList.contains('keyboard-input-panel'),true);assert.equal(f.panel.style.position,'');
  assert.deepEqual(f.geometry(),before);
  f.resize(844,390);assert.equal(dialog.style.maxHeight,'321px');assert.equal(dialog.style.margin,'7px');
 }finally{f.close();}
});

test('recreating the UI while the keyboard closes retains the unoccluded viewport; disposal removes listeners',()=>{
 const f=setup();
 try{
  f.fields[0].focus();const before=f.geometry();f.resize(844,150,{inner:true});
  initializeGame({session:f.session,entry:'betting'});assert.deepEqual(f.geometry(),before);
  f.resize(844,390,{inner:true});assert.equal(ctx.keyboardViewport.active,false);
  ctx.root.__disposeTag();assert.equal(ctx.keyboardViewport,null);
  f.resize(844,150);assert.equal(f.doc.querySelector('.keyboard-input-panel'),null);
 }finally{f.dom.window.close();}
});


test('small overlays use visible screen bounds independently of the arena scale',()=>{
 const f=setup();
 try{
  f.view.offsetLeft=14;f.view.offsetTop=12;
  f.resize(645,270);
  assert.equal(ctx.root.classList.contains('fit-sheets'),true);
  const style=ctx.root.style;
  assert.equal(style.getPropertyValue('--sheet-layout-width'),'844px');
  assert.equal(style.getPropertyValue('--sheet-layout-height'),'390px');
  const insets=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,style.getPropertyValue('--sheet-offset-'+side)]));
  assert.deepEqual(insets,{top:'12px',right:'185px',bottom:'108px',left:'14px'});
  assert.ok(ctx.layoutScale<1);
 }finally{f.close();}
});
