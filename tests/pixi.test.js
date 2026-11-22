import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {JSDOM} from 'jsdom';
import * as PIXI from 'pixi.js';
import {PixiArena} from '../src/render/pixi-scene.js';
import {staticWallNodes} from '../src/render/pixi-static.js';
import {transformMatrix,transformPoint} from '../src/render/pixi-math.js';
import {skinMatrix,ROBOT_PARTS} from '../src/render/robot-skin.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {ASSETS,assetUrl} from '../src/assets/manifest.js';
import {CONFIG} from '../src/config.js';
import {flashlightBrightness,flashlightFootprint} from '../src/render/flashlight.js';
import {paint} from '../src/render/frame.js';
import {createOilDrop} from '../src/render/effects.js';
import {resetRound} from '../src/game/session.js';
import {initializeDiagnostics} from '../src/render/diagnostics.js';
import {victoryGold,goldMatrix} from '../src/render/victory-glow.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';
import {createRobot} from '../src/robot/robot.js';
import {startBossScenario} from '../scripts/boss-harness.mjs';

test('Pixi static wall atlas includes outer masonry underneath the original wall',()=>{
  const dom=setup();
  const nodes=staticWallNodes(ctx.svg,ctx.outlineG);
  assert.deepEqual(nodes.map(node=>node.id),[
    'tag7hop-walls-outer','tag7hop-walls',ctx.outlineG.id
  ]);
  assert.equal(nodes[0].querySelectorAll('path[transform]').length,16,
    'all eight outer segments are in the static atlas');
  assert.ok(ctx.defs.querySelector('#texture-arenaOuterWall image'));
  assert.match(ctx.defs.querySelector('#texture-arenaOuterWall image').getAttribute('href'),/wall_outer\.png/);
  assert.ok(nodes.every(node=>!ctx.arenaContent.contains(node)),
    'outer and inner wall must remain outside clipped arena content');
  const svg=document.createElementNS(ctx.NS,'svg');
  svg.innerHTML='<g id="tag7hop-walls"></g>';
  assert.deepEqual(staticWallNodes(svg,null).map(node=>node.id),['tag7hop-walls'],
    'legacy arenas without outer bricks still render existing walls');
  ctx.root.__disposeTag();dom.window.close();
});

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
  initializeGame({entry:'setup',textures:Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]))});
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
  arena.sources.set(assetUrl(ASSETS.textures.flashlight),source);
  // Liquid assets use assetUrl(); take it from the first actual description.
  createOilDrop(0,200,200,3);
  arena.sources.set(ctx.combat.oilDrops[0].sprite.image.getAttribute('href'),source);
  for(const root of [ctx.conesG,ctx.groundG,ctx.trailsG,ctx.oilG,ctx.detachedG,ctx.actorsG,ctx.lightHoles,ctx.flashlightsG,ctx.scoreG])arena.attachRoot(root,arena.content);
  arena.observer=new document.defaultView.MutationObserver(mutations=>arena.consume(mutations));
  arena.observer.observe(ctx.svg,{attributes:true,childList:true,characterData:true,subtree:true});
  arena.flush=()=>{
    arena.consume(arena.observer.takeRecords());
    for(const record of arena.dirty){arena.sync(record);if(record.structureDirty){record.structureDirty=false;arena.children(record);}}
    arena.dirty.clear();
  };
  arena.finish=()=>{arena.observer.disconnect();arena.textLayer.detachAll();arena.app.stage.destroy({children:true});source.destroy(true);for(const texture of arena.frames.values())texture.destroy(false);};
  return arena;
}

test('arena lettering retains its proportions and renders outside the lens filter',()=>{
 const dom=setup(),arena=bridge();
 try{
  const [robot]=ctx.robots;
  const {visual,object}=arena.records.get(robot.label);
  Object.defineProperty(visual,'width',{value:100});
  robot.label.textContent='Пациент';
  robot.label.setAttribute('textLength','1');
  arena.flush();
  assert.equal(visual.text,'Пациент');
  assert.equal(visual.style.fontFamily[0],'Kelly Slab');
  assert.deepEqual([visual.scale.x,visual.scale.y],[1,1]);
  assert.equal(visual.parent,object,'text inherits the actor position');
  assert.equal(visual.parentRenderLayer,arena.textLayer);
  assert.deepEqual(arena.app.stage.children,[arena.scene,arena.textLayer]);
  robot.label.remove();arena.flush();
  assert.equal(arena.textLayer.renderLayerChildren.includes(visual),false);
 }finally{arena.finish();ctx.root.__disposeTag();dom.window.close();}
});

test('Pixi clips tower flashlight texture and nearby light, follows gaze and width, and preserves fallback',()=>{
 const dom=setup();ctx.mode='tower';ctx.towerRun={patient:0};
 ctx.betting={players:[{name:'Игрок'}]};ctx.towerPlayer=0;
 const player=createRobot(0,{x:250,y:350,angle:0});ctx.robots=[player];
 player.setVisible(true);player.paint();
 const arena=bridge();
 try{
  for(const node of [player.vision,player.lightBeam,player.nearLight]){
   const record=arena.records.get(node);
   assert.ok(record.lightMask instanceof PIXI.Graphics);
   assert.equal(record.visual.mask,record.lightMask);
   assert.equal(record.lightPath,node.getAttribute('d'));
   assert.equal(record.visual.visible,true);
  }
  assert.equal(arena.records.get(player.vision).visual.blendMode,'erase');
  const light=arena.records.get(player.lightBeam),originalAngle=CONFIG.vision.runnerAngleDeg;
  assert.equal(player.lightBeam.parentNode,ctx.flashlightsG);
  assert.ok(ctx.darkness.compareDocumentPosition(ctx.flashlightsG)&document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING,
    'visible texture is above darkness, not extinguished by it');
  assert.ok(ctx.flashlightsG.compareDocumentPosition(ctx.scoreG)&document.defaultView.Node.DOCUMENT_POSITION_FOLLOWING,
    'announcements remain above the light');
  assert.equal(light.visual.blendMode,'screen');
  assert.equal(player.lightBeam.style.mixBlendMode,'screen');
  assert.ok(!player.vision.getAttribute('d').startsWith('M0 0L'),
    'textured light uses surrounding obstacle shadows, not hard sides of AI vision');
  assert.equal(player.vision.getAttribute('d'),player.lightBeam.getAttribute('d'));
  assert.equal(player.vision.parentNode,ctx.lightHoles,'reveal still uses the original darkness mask');
  assert.equal(light.visual.texture,arena.sources.get(assetUrl(ASSETS.textures.flashlight)));
  assert.equal(light.visual.anchor.x,0);assert.equal(light.visual.anchor.y,.5);
  assert.equal(light.visual.width,CONFIG.vision.rangeCm);
  const height=light.visual.height,seed=ctx.seed,markup=player.lightBeam.outerHTML;
  player.paint();arena.flush();assert.equal(player.lightBeam.outerHTML,markup,'same game time freezes flicker');
  assert.equal(ctx.seed,seed);
  try{
   CONFIG.vision.runnerAngleDeg=40;player.paint();arena.flush();
   assert.ok(light.visual.height<height);
   assert.equal(light.visual.width,CONFIG.vision.rangeCm);
   assert.equal(light.visual.rotation,Number(player.lightBeam.getAttribute('data-light-heading'))*Math.PI/180);
   const pattern=player.lightBeam.flashlightTexture.pattern;
   assert.equal(Number(pattern.getAttribute('height')),light.visual.height);
   const bounds=player.lightBeam.flashlightTexture.bounds;
   assert.equal(Number(bounds.getAttribute('width')),light.visual.width);
   assert.equal(Number(bounds.getAttribute('height')),light.visual.height);
   assert.equal(bounds.getAttribute('transform'),pattern.getAttribute('patternTransform'),
     'a single rotated SVG tile prevents repeated light behind the patient');
   assert.equal(player.vision.flashlightTexture.image.style.filter,'brightness(0)');
  }finally{CONFIG.vision.runnerAngleDeg=originalAngle;}
  arena.sources.delete(assetUrl(ASSETS.textures.flashlight));arena.sync(light);
  assert.equal(light.visual.texture,PIXI.Texture.WHITE,'missing GPU texture retains radial fallback and ray mask');
  assert.equal(light.visual.anchor.x,.5);assert.ok(light.visual.mask);
  player.setVisible(false);arena.flush();
  assert.equal(arena.records.get(player.vision).object.visible,false);
  player.setVisible(true);player.paint();arena.flush();
  assert.equal(arena.records.get(player.vision).object.visible,true);
 }finally{arena.finish();ctx.mode='spectator';ctx.towerRun=null;ctx.root.__disposeTag();dom.window.close();}
});

test('flashlight shadow radius covers every soft edge and keeps square artwork at the original angle',()=>{
 assert.equal(flashlightFootprint(100*Math.PI/180).height,300);
 for(const angle of [20,40,100,140]){
  const {width,height,radius}=flashlightFootprint(angle*Math.PI/180);
  assert.equal(width,300);
  assert.ok(radius>Math.hypot(width,height/2),'shadow mask cannot crop the artwork corners');
 }
});

test('rasterized flashlight retains its soft pixels outside AI cone and never tiles behind the source',async()=>{
 const dom=setup();ctx.mode='tower';ctx.towerRun={patient:0};
 ctx.betting={players:[{name:'Игрок'}]};ctx.towerPlayer=0;
 try{
  ctx.obstacles=[];ctx.arenaPlanes=[];
  const player=createRobot(0,{x:250,y:350,angle:0});ctx.robots=[player];
  player.setVisible(true);player.paint();
  const node=player.lightBeam.cloneNode(true),{pattern,bounds}=player.lightBeam.flashlightTexture;
  const tile=pattern.cloneNode(true),clip=bounds.parentNode.cloneNode(true);
  tile.querySelector('image').setAttribute('href','data:image/png;base64,'+fs.readFileSync(new URL('../public/assets/textures/robots/flashlight.png',import.meta.url)).toString('base64'));
  // Rebase the production artwork and shadow mask into a transparent test image.
  node.setAttribute('transform','translate(350 350)');node.setAttribute('opacity','1');node.removeAttribute('style');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="700" height="700"><defs>${tile.outerHTML}${clip.outerHTML}</defs>${node.outerHTML}</svg>`;
  const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const alpha=(x,y)=>data[(y*info.width+x)*4+3];
  assert.ok(Math.atan2(76,59)>CONFIG.vision.runnerAngleDeg*Math.PI/360);
  assert.ok(alpha(409,426)>5,'soft PNG edge outside the mathematical cone stays visible');
  assert.equal(alpha(340,350),0,'SVG pattern cannot repeat the beam behind the source');
  assert.ok(alpha(467,350)>alpha(409,426),'edge remains softer than the beam core');
 }finally{ctx.mode='spectator';ctx.towerRun=null;ctx.root.__disposeTag();dom.window.close();}
});

test('flashlight brightness stays within 5 percent without consuming randomness',()=>{
 const seed=ctx.seed;
 let lo=Infinity,hi=-Infinity;
 for(let i=0;i<6000;i++){
  const t=i/60,value=flashlightBrightness(t);lo=Math.min(lo,value);hi=Math.max(hi,value);
  assert.ok(value>=.95&&value<=1.05);
  assert.ok(Math.abs(value-flashlightBrightness(t+1/60))<.007,'no abrupt frame-to-frame flashes');
 }
 assert.ok(hi-lo>.025);assert.equal(ctx.seed,seed);
});

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

test('patient telemetry is always visible, independent of settings, and limited by real time',()=>{
  const dom=setup();initializeDiagnostics();
  const side=ctx.fieldSide;
  assert.equal(document.querySelectorAll('.render-diagnostics input').length,1,'only post-effects has a switch');
  assert.equal(ctx.telemetryEnabled,true);
  assert.equal(ctx.root.querySelector('.tag7hop-sidebar-wrap').style.visibility,'');
  const before=ctx.roles.innerHTML;
  ctx.robots[0].damage('arm--1-lower',1,ctx.robots[0].maxHp('arm--1-lower'));
  const seedAfterDamage=ctx.seed;
  paintTelemetry();
  assert.notEqual(ctx.roles.innerHTML,before,'damage updates visible patient cards');
  assert.equal(ctx.fieldSide,side);assert.equal(ctx.seed,seedAfterDamage,'painting does not consume simulation RNG');
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

test('SVG and Pixi keep the Tower player above other patients when an enemy climbs over another',()=>{
 const f=startBossScenario({variant:'brute',arena:'ring',ordinary:true}),arena=bridge();
 try{
  const [player,enemy,other]=ctx.robots,layer=arena.records.get(ctx.actorsG).object;
  const sprite=r=>arena.records.get(r.actor).object;
  assert.equal(ctx.actorsG.lastElementChild,player.actor);
  assert.equal(layer.children.at(-1),sprite(player));
  enemy.beginCover(other);
  arena.flush();
  assert.equal(enemy.actor.nextElementSibling,player.actor);
  assert.equal(ctx.actorsG.lastElementChild,player.actor);
  assert.deepEqual(layer.children.slice(-2),[sprite(enemy),sprite(player)]);
  ctx.mode='spectator';
  other.beginCover(enemy);
  arena.flush();
  assert.equal(ctx.actorsG.lastElementChild,other.actor);
  assert.equal(layer.children.at(-1),sprite(other));
 }finally{arena.finish();f.close();}
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

test('arena replacement clears GPU scene resources while retaining the renderer and drawing context',()=>{
 const dom=setup(),arena=bridge();let appDestroyed=0;
 arena.app.destroy=()=>{appDestroyed++;};
 const stage=arena.app.stage,app=arena.app,canvas=document.createElement('canvas');
 ctx.svg.after(canvas);arena.canvas=canvas;
 arena.onLost=()=>{};arena.onRestored=()=>{};canvas.addEventListener('webglcontextlost',arena.onLost);canvas.addEventListener('webglcontextrestored',arena.onRestored);
 let filterDestroyed=0;arena.postEffects={destroy(){filterDestroyed++;}};
 const oldWorld=arena.world,oldTexture=arena.texture({width:16,height:16});arena.width=900;arena.height=700;
 arena.suspend();assert.equal(canvas.isConnected,false);assert.equal(arena.suspended,true);assert.equal(arena.disposed,false);
 arena.resetScene();assert.equal(arena.app,app);assert.equal(arena.app.stage,stage);assert.equal(appDestroyed,0);assert.equal(filterDestroyed,1);assert.ok(oldWorld.destroyed);assert.ok(oldTexture.destroyed);assert.equal(arena.records.size,0);assert.equal(arena.sources.size,0);assert.equal(arena.frames.size,0);assert.equal(arena.gradients.size,0);assert.equal(arena.owned.size,0);assert.equal(arena.width,null);assert.deepEqual(stage.children,[arena.scene,arena.textLayer]);
 arena.resetScene();assert.deepEqual(stage.children,[arena.scene,arena.textLayer]);assert.equal(appDestroyed,0);
 arena.destroy();assert.equal(appDestroyed,1);ctx.root.__disposeTag();dom.window.close();
});
