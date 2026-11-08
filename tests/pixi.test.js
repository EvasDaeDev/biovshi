import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import * as PIXI from 'pixi.js';
import {PixiArena} from '../src/render/pixi-scene.js';
import {transformMatrix,transformPoint} from '../src/render/pixi-math.js';
import {skinMatrix,ROBOT_PARTS} from '../src/render/robot-skin.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {ASSETS} from '../src/assets/manifest.js';
import {paint} from '../src/render/frame.js';
import {createOilDrop} from '../src/render/effects.js';
import {resetRound} from '../src/game/session.js';
import {initializeDiagnostics} from '../src/render/diagnostics.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';

test('Pixi transforms preserve skin anchors, head reversal, recoil and spawn scaling',()=>{
  for(const key of Object.keys(ROBOT_PARTS)){
    const a={x:250,y:320},b={x:269,y:297},part=ROBOT_PARTS[key],matrix=skinMatrix(a,b,part);
    const parsed=transformMatrix('matrix('+matrix.join(' ')+')');
    for(const [point,target] of [[{x:part.from??8,y:32},a],[{x:part.to??56,y:32},b]]){
      const p=transformPoint(parsed,point);assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<1e-9,key);
    }
  }
  const m=transformMatrix('translate(100 200) rotate(90) scale(1.25) translate(-10 -20)');
  const p=transformPoint(m,{x:10,y:20});assert.ok(Math.hypot(p.x-100,p.y-200)<1e-9);
});

function setup(){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://pixi.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
  initializeGame({textures:Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]))});
  return dom;
}
class TestText extends PIXI.Container {
  constructor(){super();this.anchor=new PIXI.Point();this.style={};this.text='';}
}
function bridge(){
  const p={...PIXI,Text:TestText};
  const arena=new PixiArena(p,{stage:new PIXI.Container(),renderer:{resize(){}}});
  const source=new PIXI.Texture({source:new PIXI.ImageSource({resource:{width:256,height:256}})});
  for(const robot of ctx.robots)arena.sources.set(robot.actor.querySelector('[data-skin-segment] image').getAttribute('href'),source);
  arena.radial=()=>PIXI.Texture.WHITE;
  // Liquid assets use assetUrl(); take it from the first actual description.
  createOilDrop(0,200,200,3);
  arena.sources.set(ctx.combat.oilDrops[0].sprite.image.getAttribute('href'),source);
  for(const root of [ctx.conesG,ctx.groundG,ctx.trailsG,ctx.oilG,ctx.detachedG,ctx.actorsG,ctx.lightHoles,ctx.scoreG])arena.attachRoot(root,arena.content);
  arena.observer=new document.defaultView.MutationObserver(mutations=>arena.consume(mutations));
  arena.observer.observe(ctx.svg,{attributes:true,childList:true,characterData:true,subtree:true});
  arena.flush=()=>{
    arena.consume(arena.observer.takeRecords());
    for(const record of arena.dirty){arena.sync(record);if(record.structureDirty){record.structureDirty=false;arena.children(record);}}
    arena.dirty.clear();
  };
  arena.finish=()=>{arena.observer.disconnect();arena.world.destroy({children:true});source.destroy(true);for(const texture of arena.frames.values())texture.destroy(false);};
  return arena;
}

test('native Pixi sprites share cropped atlas sources; changed poses preserve lengths and removed parts disappear',()=>{
  const dom=setup(),arena=bridge();
  ctx.robots[0].setVisible(true);paint();arena.flush();
  const robot=ctx.robots[0],piece={group:robot.actor.querySelector('[data-skin-segment="spine-0"]')};piece.image=piece.group.querySelector('image');
  const native=arena.records.get(piece.group),viewport=arena.records.get(piece.image.parentNode);
  assert.ok(viewport.visual instanceof PIXI.Sprite);
  assert.equal(viewport.visual.texture.frame.x,64);
  assert.equal(viewport.visual.texture.frame.width,64);
  assert.equal(viewport.visual.texture.source,arena.sources.get(piece.image.getAttribute('href')).source);
  assert.equal(native.object.visible,true);
  const expected=transformMatrix(piece.group.getAttribute('transform'));
  const actual=native.object.localTransform;
  native.object.updateLocalTransform();
  assert.ok(Math.abs(actual.a-expected[0])<1e-9);
  for(let i=0;i<3;i++){ctx.game.time+=1;robot.damage('arm--1-lower',1);}paint();arena.flush();
  assert.equal(arena.records.get(robot.actor.querySelector('[data-skin-segment="arm--1-lower"]')).object.visible,false);
  assert.equal(arena.records.get(robot.nearLight).visual.blendMode,'erase');
  arena.finish();ctx.root.__disposeTag();dom.window.close();
});

test('liquid expiry and repeated round resets release native display objects without growing texture frames',()=>{
  const dom=setup(),arena=bridge();
  for(let round=0;round<3;round++){
    for(let i=0;i<2050;i++)createOilDrop(0,200+i%40,200,3);
    arena.flush();assert.ok(ctx.combat.oilDrops.length<=1000);
    const old=ctx.combat.oilDrops.map(drop=>arena.records.get(drop.node)?.object).filter(Boolean);
    resetRound();arena.flush();
    assert.equal(ctx.combat.oilDrops.length,0);
    assert.ok(old.every(object=>object.destroyed));
    assert.ok(arena.records.size<350,arena.records.size);
    assert.ok(arena.frames.size<=32,arena.frames.size);
  }
  arena.finish();ctx.root.__disposeTag();dom.window.close();
});

test('telemetry can be isolated without changing arena dimensions, RNG or simulation and is limited by real time',()=>{
  const dom=setup();initializeDiagnostics();
  const initialSeed=ctx.seed,side=ctx.fieldSide;
  const toggle=document.querySelector('.render-diagnostics input');toggle.checked=false;toggle.dispatchEvent(new Event('change'));
  const before=ctx.roles.innerHTML;
  ctx.robots[0].damage('arm--1-lower',1);paintTelemetry();
  assert.equal(ctx.roles.innerHTML,before);assert.equal(ctx.fieldSide,side);assert.equal(ctx.seed,initialSeed);
  assert.equal(ctx.root.querySelector('.tag7hop-sidebar-wrap').style.visibility,'hidden');
  toggle.checked=true;toggle.dispatchEvent(new Event('change'));paintTelemetry();
  assert.notEqual(ctx.roles.innerHTML,before);
  let time=10;ctx.telemetryNow=()=>time;ctx.telemetryDirty=true;paintTelemetry();
  const last=ctx.lastTelemetryAt;ctx.game.time+=20;paintTelemetry();assert.equal(ctx.lastTelemetryAt,last);
  time+=.11;paintTelemetry();assert.equal(ctx.lastTelemetryAt,time);delete ctx.telemetryNow;
  ctx.root.__disposeTag();dom.window.close();
});
