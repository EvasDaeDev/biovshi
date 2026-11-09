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
import {victoryGold,goldMatrix} from '../src/render/victory-glow.js';
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
class TestFilter {constructor(options={}){Object.assign(this,options);}destroy(){this.destroyed=true;}}
function bridge(){
  const p={...PIXI,Text:TestText,BlurFilter:TestFilter,ColorMatrixFilter:TestFilter};
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
  ctx.robots[1].setVisible(true);
  robot.damage('head',1);paint();arena.flush();
  assert.equal(arena.records.get(ctx.robots[1].nearLight).object.alpha,.75,'WebGL receives the attacker flash, not just a hidden SVG attribute');
  assert.equal(arena.records.get(robot.nearLight).object.alpha,.5);
  ctx.game.time+=.1;paint();arena.flush();
  assert.equal(arena.records.get(ctx.robots[1].nearLight).object.alpha,.625);
  ctx.game.time+=.1;paint();arena.flush();
  assert.equal(arena.records.get(ctx.robots[1].nearLight).object.alpha,.5);
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


test('victory halo inflates once, colours the final blurred alpha gold and reuses it while shimmering',()=>{
  const dom=setup(),arena=bridge();ctx.robots[0].setVisible(true);paint();arena.flush();
  const generated=[];
  arena.app.renderer.generateTexture=({target})=>{
    const bounds=target.getLocalBounds();
    const texture=new PIXI.Texture({source:new PIXI.ImageSource({resource:{width:Math.max(1,bounds.width),height:Math.max(1,bounds.height)}})});
    generated.push({children:target.children.length,texture});return texture;
  };
  ctx.combat.finished=true;ctx.combat.winner=0;ctx.combat.finishedAt=ctx.game.time;
  arena.victory();
  assert.equal(generated.length,2,'silhouette expansion is baked once');
  assert.equal(generated[1].children,9);
  assert.ok(generated[0].texture.destroyed);
  const {sprite,filter,gold}=arena.halo;
  assert.deepEqual(sprite.filters,[filter,gold],'gold colour is applied after the blur');
  assert.equal(sprite.tint,0xffffff,'no ineffective pre-filter tint');
  assert.equal(sprite.blendMode,'normal','gold remains saturated against the background');
  const original=[...gold.matrix];ctx.game.time+=.4;arena.victory();
  assert.notDeepEqual(gold.matrix,original);assert.equal(generated.length,2);
  for(const t of [0,.5,1,2,10]) {
    const colour=victoryGold(t),matrix=goldMatrix(colour);
    assert.equal(matrix[4],1);assert.ok(matrix[9]>.6&&matrix[9]<.85);assert.ok(matrix[14]<.2);
    assert.equal(matrix[18],1,'the input alpha is preserved');assert.equal(matrix[19],0,'transparent surroundings stay transparent');
    for(const index of [0,1,2,3,5,6,7,8,10,11,12,13])assert.equal(matrix[index],0,'old texture RGB cannot wash out the halo');
  }
  ctx.combat.winner=null;arena.victory();assert.equal(arena.halo,null);assert.ok(gold.destroyed);assert.ok(filter.destroyed);
  arena.finish();ctx.root.__disposeTag();dom.window.close();
});


test('Pixi resizes a rectangular drawing buffer and post filter while centring an unstretched square camera',()=>{
  const dom=setup(),arena=bridge(),sizes=[],postSizes=[];
  arena.ambient=new PIXI.Container();arena.nightComposition=new PIXI.Container();
  arena.app.renderer.resize=(w,h)=>sizes.push([w,h]);arena.app.renderer.render=()=>{};arena.app.render=()=>{};
  arena.postEffects={resize(w,h){postSizes.push([w,h]);},update(){}};
  for(const [w,h] of [[1180,640],[640,1180]]){
    ctx.fieldWidth=w;ctx.fieldHeight=h;ctx.fieldSide=640;arena.render();
    assert.deepEqual(sizes.at(-1),[w,h]);assert.deepEqual(postSizes.at(-1),[w,h]);
    assert.equal(arena.world.scale.x,arena.world.scale.y);
    const [x,y,size]=ctx.svg.getAttribute('viewBox').split(/\s+/).map(Number);
    assert.ok(Math.abs(arena.world.position.x+x*arena.world.scale.x-(w-640)/2)<1e-8);
    assert.ok(Math.abs(arena.world.position.y+y*arena.world.scale.y-(h-640)/2)<1e-8);
    assert.ok(Math.abs(arena.world.scale.x-640/size)<1e-8);
  }
  assert.equal(sizes.length,2,'swapping width and height must resize even though the short side is unchanged');
  arena.ambient.destroy();arena.nightComposition.destroy();arena.finish();ctx.root.__disposeTag();dom.window.close();
});

test('floor capture excludes labels, preserves world transforms and restores scene ordering even if extraction fails',()=>{
 const dom=setup(),arena=bridge();arena.render=arena.flush;
 const nodes=[ctx.oilG,ctx.detachedG,...ctx.robots.slice(1).map(r=>r.actor)];
 const contentOrder=[...arena.content.children],actorRecord=arena.records.get(ctx.actorsG),actorOrder=[...actorRecord.object.children];
 const output={width:1024,height:1024};let captured=0;
 arena.app.renderer.extract={canvas(options){captured++;assert.equal(options.resolution,1024/700);assert.equal(options.frame.width,700);assert.equal(options.target.children.length,nodes.length);
  for(const robot of ctx.robots.slice(1))assert.equal(arena.records.get(robot.label).object.visible,false);return output;}};
 assert.equal(arena.rasterizeRemains(nodes),output);assert.equal(captured,1);assert.deepEqual(arena.content.children,contentOrder);assert.deepEqual(actorRecord.object.children,actorOrder);
 arena.app.renderer.extract.canvas=()=>{throw Error('readback failed');};assert.throws(()=>arena.rasterizeRemains(nodes),/readback failed/);assert.deepEqual(arena.content.children,contentOrder);assert.deepEqual(actorRecord.object.children,actorOrder);
 for(const robot of ctx.robots.slice(1))assert.equal(arena.records.get(robot.label).object.visible,true);
 arena.finish();dom.window.close();
});
