import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { coreClearBone } from '../src/systems/collision.js';
import { strikeCandidates } from '../src/systems/combat.js';
import { createRobot } from '../src/robot/robot.js';
import { segmentDistance } from '../src/utils/math.js';
import { initializeGame } from '../src/game/initialize.js';
import { ctx } from '../src/game/state.js';
import { advanceStartup, resetRound } from '../src/game/session.js';
import { step, frame } from '../src/game/loop.js';
import { paint } from '../src/render/frame.js';
import { CONFIG } from '../src/config.js';
import { onGameEvent } from '../src/game/event-bus.js';
import { chooseRenderProfile } from '../src/render/performance.js';
import { createOilDrop, paintOil, updateOilLeaks } from '../src/render/effects.js';
import { spawnHitEffect, paintHitEffects } from '../src/render/hit-effects.js';

function setup() {
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://biovshi.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});
  globalThis.ResizeObserver=class { observe(){} disconnect(){} };
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  initializeGame();
  document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  document.querySelector('#bet-fight').click();
  advanceStartup(3);
  assert.equal(ctx.startup.phase,'running');
  return dom;
}
function hit(robot,key) {ctx.game.time+=CONFIG.combat.damageInvulnerabilitySec+.01;return robot.damage(key,1);}

test('chest is invulnerable; head loss halves turning and removes vision', () => {
  const dom=setup();
  const r=ctx.robots[0],turn=r.turnAbility;
  assert.equal(r.damage('spine-0',1),false);
  assert.equal(r.hasHead,true);
  assert.equal(hit(r,'head'),true);
  assert.equal(r.damage('head',1),false,'same-frame damage is rejected');
  for(let i=0;i<4;i++)hit(r,'head');
  assert.equal(r.hasHead,false);
  assert.equal(r.turnAbility,turn/2);
  assert.equal(r.canSee({x:r.x,y:r.y}),false);
  assert.equal(r.mobile,true);
  dom.window.close();
});

test('severed upper arm takes its lower segment; detached parts cannot be hit again', () => {
  const dom=setup();
  const r=ctx.robots[0];
  for(let i=0;i<3;i++)hit(r,'arm-1-upper');
  assert.equal(r.hp.get('arm-1-lower'),0);
  assert.equal(r.movementLimbs,3);
  assert.equal(r.armCount,1);
  assert.equal(hit(r,'arm-1-lower'),false);
  assert.ok(ctx.combat.detached.some(d=>d.pieces.some(p=>p.key==='arm-1-lower')));
  dom.window.close();
});

test('losing every limb ends mobility; reset restores the anatomy and the betting phase', () => {
  const dom=setup();
  const r=ctx.robots[0];
  for(const kind of ['arm','leg'])for(const side of [-1,1])for(let i=0;i<3;i++)hit(r,`${kind}-${side}-upper`);
  assert.equal(r.mobile,false);
  assert.equal(r.movementLimbs,0);
  resetRound();
  assert.equal(ctx.startup.phase,'betting');
  assert.equal(ctx.round.elapsedSec,0);
  assert.ok(ctx.robots.every(r=>r.mobile&&r.movementLimbs===4&&r.hasHead));
  dom.window.close();
});

test('simulation advances with finite poses; a finished round settles once and opens results', () => {
  const dom=setup();
  const before=ctx.robots.map(r=>({x:r.x,y:r.y}));
  for(let i=0;i<120;i++)step(1/60);
  paint();
  assert.ok(ctx.robots.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.y)&&Number.isFinite(r.angle)));
  assert.ok(ctx.robots.some((r,i)=>Math.hypot(r.x-before[i].x,r.y-before[i].y)>0));
  for(const r of ctx.robots.slice(1))for(const kind of ['arm','leg'])for(const side of [-1,1])for(let i=0;i<3;i++)hit(r,`${kind}-${side}-upper`);
  step(1/60);
  assert.equal(ctx.combat.finished,true);
  assert.equal(ctx.combat.winner,0);
  assert.equal(ctx.betting.phase,'settled');
  const elapsed=ctx.round.elapsedSec;
  for(let i=0;i<181;i++)step(1/60);
  assert.equal(ctx.round.elapsedSec,elapsed);
  assert.equal(ctx.betting.history.length,1);
  assert.equal(ctx.resultsPanel.hidden,false);
  dom.window.close();
});

test('optional event listeners can unsubscribe without changing combat', () => {
  const dom=setup();
  const events=[];
  const unsubscribe=onGameEvent(event=>events.push(event));
  hit(ctx.robots[0],'head');
  assert.equal(events.at(-1).type,'hit');
  unsubscribe();
  hit(ctx.robots[0],'head');
  assert.equal(events.length,1);
  dom.window.close();
});

test('light graphics preserves combat, positions, damage and random outcomes', () => {
  const originalRandom=Math.random;
  const originalQuality=CONFIG.rendering.quality;
  const run=quality=>{
    Math.random=()=>0.2468;
    CONFIG.rendering.quality=quality;
    const dom=setup();
    for(let i=0;i<600;i++){
      step(1/60);
      if(i%2===0)paint();
    }
    const snapshot=JSON.parse(JSON.stringify({
      robots:ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,hp:[...r.hp],pose:r.actualPose})),
      game:ctx.game,round:ctx.round,
      strikes:ctx.combat.strikes,hits:ctx.combat.hits,betting:ctx.betting,
    }));
    dom.window.close();
    return snapshot;
  };
  try { assert.deepEqual(run('light'),run('full')); }
  finally { Math.random=originalRandom;CONFIG.rendering.quality=originalQuality; }
});

test('lighting masks reuse stationary geometry and robots have no identity outline filter', () => {
  const dom=setup();
  const r=ctx.robots[0];
  paint();
  const mask=r.nearLight;
  let writes=0;
  const setAttribute=mask.setAttribute.bind(mask);
  mask.setAttribute=(key,value)=>{if(key==='d')writes++;setAttribute(key,value);};
  for(let i=0;i<10;i++)paint();
  assert.equal(writes,0,'unchanged lighting does not rebuild SVG paths');
  const filter=document.querySelector('#tag7hop-identity-outline-0');
  assert.equal(filter,null);
  assert.equal(r.actor.style.filter,'none');
  assert.equal(ctx.sparkNodes.length,0,'hidden particles do not create unused SVG nodes');
  dom.window.close();
});

test('outer wall and clock remain outside the floor clip, with a full-size playable arena',()=>{
  const dom=setup();
  const walls=ctx.svg.querySelector('#tag7hop-walls');
  assert.equal(walls.parentNode,ctx.svg);
  assert.equal(ctx.arenaContent.contains(walls),false);
  assert.equal(ctx.timerOutput.parentNode,ctx.svg);
  assert.equal(walls.querySelectorAll('path[transform]').length,16);
  const tile=ctx.svg.querySelector('#texture-arenaWall');
  assert.equal(tile.getAttribute('width'),'100');
  assert.equal(tile.getAttribute('height'),'30');
  assert.equal(ctx.CAMERA_FULL,776);
  assert.equal(ctx.arenaBoundary.right,700);
  assert.equal(ctx.arenaBoundary.bottom,700);
  dom.window.close();
});

test('operating-room lighting, dark footprints and inward textured obstacle walls survive reinitialization',()=>{
  const dom=setup();
  const geometry=ctx.obstacles.map(b=>structuredClone(b.points));
  for(let pass=0;pass<2;pass++) {
    if(pass)initializeGame();
    const walls=ctx.svg.querySelector('#tag7hop-obstacle-walls');
    assert.equal(walls.parentNode,ctx.blockG);
    assert.equal(walls.children.length,CONFIG.arena.obstacles.length);
    assert.equal(walls.querySelectorAll('path[transform]').length,44);
    assert.equal(ctx.svg.querySelectorAll('#texture-obstacle').length,1);
    const pattern=ctx.svg.querySelector('#texture-obstacle');
    assert.equal(pattern.getAttribute('width'),'100');
    assert.equal(pattern.getAttribute('height'),'30');
    assert.match(pattern.querySelector('image').getAttribute('href'),/wall_02\.webp$/);
    assert.equal(pattern.querySelector('image').getAttribute('transform'),'rotate(180 50 15)');
    assert.equal(ctx.outlineG.getAttribute('stroke'),'none');
    assert.ok([...ctx.ambientGlowG.querySelectorAll('polygon')].every(n=>n.getAttribute('stroke')==='#8b9e91'));
    assert.equal(ctx.ambientLights.length,6);
    assert.equal(ctx.svg.querySelector('#texture-arenaWall image').getAttribute('opacity'),'0');
    assert.ok([...ctx.trailsG.children].every(n=>n.getAttribute('fill')==='var(--night-trail)'));
    assert.ok([...ctx.trailsG.children].every(n=>Number(n.getAttribute('r'))===2.925));
    assert.equal(ctx.OIL_HUES[0],0);
    assert.equal(ctx.OIL_HUES.at(-1),12);
    assert.deepEqual(ctx.obstacles.map(b=>b.points),geometry);
  }
  dom.window.close();
});

test('vision stays sharp in both qualities; liquid sprites age and fall back cleanly; red centre circle is absent',()=>{
  const dom=setup();
  assert.equal(ctx.guideG.getAttribute('display'),'none');
  const robot=ctx.robots[0];
  for(const mode of ['full','light','full']) {
    ctx.renderProfile=chooseRenderProfile(mode,false);paint();
    assert.equal(robot.vision.tagName,'path');
    assert.ok(robot.vision.getAttribute('d').endsWith(' Z'));
    assert.equal(robot.lightBeam.getAttribute('d'),robot.vision.getAttribute('d'));
    assert.equal(robot.vision.children.length,0);
  }
  for(let i=0;i<5;i++)hit(robot,'head');
  paint();
  assert.equal(robot.vision.getAttribute('d'),'');
  ctx.liquidAtlasSources=['fresh','early','late','dry'];
  const seed=ctx.seed;
  createOilDrop(0,350,350,3);
  assert.equal(ctx.seed,seed,'sprite selection does not advance combat RNG');
  const drop=ctx.combat.oilDrops.at(-1);
  assert.equal(drop.node.tagName,'g');
  assert.equal(drop.sprite.image.getAttribute('href'),'fresh');
  assert.equal(drop.sprite.viewport.getAttribute('overflow'),'hidden');
  ctx.game.time+=CONFIG.oil.drySec+1;paint();
  assert.equal(drop.sprite.image.getAttribute('href'),'dry');
  assert.equal(Number(drop.sprite.viewport.getAttribute('width')),9);
  assert.equal(ctx.settledOilDrops.has(drop),true);
  drop.sprite.image.dispatchEvent(new Event('error'));
  assert.equal(drop.sprite.fallback.getAttribute('display'),'');
  drop.sprite.image.dispatchEvent(new Event('load'));
  assert.equal(drop.sprite.fallback.getAttribute('display'),'none');
  resetRound();paint();
  assert.equal(ctx.guideG.getAttribute('display'),'');
  assert.equal(ctx.oilG.childNodes.length,0);
  assert.equal(ctx.guideG.querySelector('circle[r="178"]'),null);
  dom.window.close();
});

test('torso shadows track surviving body bounds and obstacle light diameters include exactly one extra metre',()=>{
  const dom=setup();
  for(const robot of ctx.robots) {
    robot.actor.querySelector('image').dispatchEvent(new Event('load'));
  }
  paint();
  for(const robot of ctx.robots) {
    const shadow=ctx.groundG.querySelector('[data-torso-shadow="'+robot.id+'"]');
    assert.equal(Number(shadow.getAttribute('opacity')),.5);
    assert.ok(Number(shadow.getAttribute('rx'))>0&&Number(shadow.getAttribute('ry'))>0);
    assert.ok(ctx.svg.querySelector('#tag7hop-torso-shadow-'+robot.id+' stop[offset="1"]'));
  }
  const shadow=ctx.groundG.querySelector('[data-torso-shadow="0"]');
  const before=Number(shadow.getAttribute('rx'));
  for(let i=0;i<3;i++)hit(ctx.robots[0],'spine-2');
  paint();
  assert.ok(Number(shadow.getAttribute('rx'))<before);
  const spots=ctx.svg.querySelectorAll('#tag7hop-obstacle-lights ellipse');
  assert.equal(spots.length,5);
  for(const [i,spot]of [...spots].entries()) {
    const points=ctx.obstacles[i].points;
    const diameter=Math.max(...points.flatMap(a=>points.map(b=>Math.hypot(a.x-b.x,a.y-b.y))));
    assert.ok(Math.abs(Number(spot.getAttribute('rx'))*2-diameter-100)<1e-8);
  }
  resetRound();paint();
  assert.equal(ctx.svg.querySelectorAll('#tag7hop-obstacle-light-holes ellipse').length,5);
  assert.equal(ctx.svg.querySelectorAll('#tag7hop-torso-shadow-0').length,1);
  dom.window.close();
});

test('impacts leave the floor texture and static grid geometry unchanged',()=>{
  const dom=setup(),floor=ctx.arenaContent.querySelector(':scope > rect');
  floor.style.fill='url(#texture-arenaFloor)';
  const before=floor.outerHTML;
  for(const mode of ['full','light']) {
    ctx.renderProfile=chooseRenderProfile(mode,false);
    ctx.pulses=[{x:350,y:350,time:ctx.game.time-.1}];
    paint();
    assert.equal(floor.outerHTML,before);
    assert.equal(ctx.svg.querySelector('#tag7hop-floor-warp'),null);
  }
  dom.window.close();
});

test('dripping drops keep their doubled size; footprints are three times fainter with half the capacity',()=>{
  const dom=setup(),original=CONFIG.oil.dropSizeScale;
  try {
    const sample=scale=>{
      CONFIG.oil.dropSizeScale=scale;ctx.seed=42;
      ctx.oilG.replaceChildren();ctx.combat.oilDrops.length=0;
      ctx.combat.oilLeaks=[{robot:0,key:'head',nextAt:ctx.game.time}];
      updateOilLeaks();paintOil();
      const drop=ctx.combat.oilDrops[0];
      return {radius:drop.baseRadius,max:drop.maxRadius,seed:ctx.seed};
    };
    const before=sample(1),after=sample(2);
    assert.equal(after.radius,before.radius*2);
    assert.equal(after.max,before.max*2);
    assert.equal(after.seed,before.seed);
    createOilDrop(0,350,350,15);
    assert.equal(ctx.combat.oilDrops.at(-1).baseRadius,15,'non-dripping puddles keep their size');
    const robot=ctx.robots[0],stamp=robot.trail[0];
    assert.ok(stamp);
    ctx.game.time=stamp.time;robot.paint(false);
    assert.equal(Number(robot.trailNodes[0].getAttribute('opacity')),.753/3);
    assert.equal(robot.trailNodes.length,10);
    ctx.game.time=stamp.time+CONFIG.trails.fadeSec+.01;robot.paint(false);
    assert.equal(Number(robot.trailNodes[0].getAttribute('opacity')),0,'old prints still fade completely');
  } finally {CONFIG.oil.dropSizeScale=original;dom.window.close();}
});

test('confirmed hits create bounded retro bursts, severing is stronger, and expiry/reset clear the pool',()=>{
  const dom=setup(),robot=ctx.robots[0];
  assert.equal(ctx.hitEffects.slots.length,0,'particle nodes are allocated lazily');
  ctx.renderProfile=chooseRenderProfile('full',false);
  const seed=ctx.seed;
  hit(robot,'arm--1-upper');
  assert.equal(ctx.seed,seed,'non-severing visual effects do not consume combat RNG');
  assert.equal(ctx.hitEffects.serial,1);
  const normal=ctx.hitEffects.slots.find(s=>s.effect);
  assert.equal(normal.effect.particles.length,8);
  assert.equal(robot.damage('arm--1-upper',1),false);
  assert.equal(ctx.hitEffects.serial,1,'invulnerable duplicate contacts do not trigger flashes');
  hit(robot,'arm--1-upper');hit(robot,'arm--1-upper');
  assert.ok(ctx.hitEffects.slots.some(s=>s.effect?.severed&&s.effect.particles.length===14));
  ctx.renderProfile=chooseRenderProfile('light',false);
  const hp=[...robot.hp],before=ctx.seed;
  for(let i=0;i<30;i++)spawnHitEffect(350,350,0,false);
  assert.equal(ctx.hitEffects.slots.length,CONFIG.effects.hitPoolLimit);
  assert.equal(ctx.hitEffects.group.children.length,CONFIG.effects.hitPoolLimit);
  assert.ok(ctx.hitEffects.slots.every(s=>s.effect?.particles.length===4));
  assert.equal(ctx.seed,before);
  assert.deepEqual([...robot.hp],hp);
  ctx.game.time+=1;paintHitEffects();
  assert.ok(ctx.hitEffects.slots.every(s=>!s.effect&&s.node.getAttribute('display')==='none'));
  spawnHitEffect(350,350,0,true);resetRound();
  assert.equal(ctx.hitEffects.serial,0);
  assert.ok(ctx.hitEffects.slots.every(s=>!s.effect&&s.node.getAttribute('display')==='none'));
  dom.window.close();
});

test('every robot uses its own atlas; severed parts, victory halo and load fallback work for A through D',()=>{
 for(const id of [0,1,2,3]) {
  const dom=setup();
  const a=ctx.robots[id],actor=a.actor,name='r_0'+(id+1);
  assert.equal(actor.getAttribute('data-skin'),name);
  assert.equal(actor.querySelectorAll('[data-skin-segment]').length,13);
  for(const [index,robot] of ctx.robots.entries()) {
    assert.equal(robot.actor.querySelectorAll('image').length,13);
    assert.ok([...robot.actor.querySelectorAll('image')].every(img=>img.getAttribute('href').endsWith('r_0'+(index+1)+'.png')));
  }
  const image=actor.querySelector('image');
  image.dispatchEvent(new Event('load'));
  assert.equal(actor.getAttribute('data-skin-ready'),'true');
  assert.equal(actor.querySelector('ellipse.head').style.visibility,'hidden');
  for(const decoration of actor.querySelectorAll('.robot-horn, .robot-sphere'))assert.equal(decoration.style.visibility,'hidden');
  paint();
  assert.ok([...actor.querySelectorAll('[data-skin-segment]')].every(n=>n.getAttribute('transform')&&!n.getAttribute('transform').includes('NaN')));
  const actorStyle=actor.getAttribute('style');
  const label=actor.querySelector('.robot-label');
  const identityColor=ctx.cardNodes[id].card.style.getPropertyValue('--accent');
  const swatch=document.createElementNS('http://www.w3.org/2000/svg','text');
  swatch.style.fill=identityColor;
  const identityFill=swatch.style.fill;
  assert.equal(label.style.fill,identityFill);
  assert.equal(actor.style.filter,'none');
  assert.deepEqual([...ctx.svg.querySelectorAll('#tag7hop-beam-'+id+'-tint stop')].map(n=>Number(n.getAttribute('stop-opacity'))),[.1,.05,0]);
  const module=ctx.cardNodes[id].card.querySelector('[data-segment="arm--1-upper"]');
  const healthyStroke=module.getAttribute('stroke');
  for(let i=0;i<4;i++) {
    const node=actor.querySelector('[data-skin-segment="spine-'+i+'"]');
    const [A,B,C,D,E,F]=node.getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(' ').map(Number);
    for(const [x,target] of [[i===0?30:8,a.actualPose.spine[i]],[i===0?54:32,a.actualPose.spine[i+1]]]) {
      assert.ok(Math.abs(A*x+C*32+E-target.x)<1e-8,'body starts on its original bone');
      assert.ok(Math.abs(B*x+D*32+F-target.y)<1e-8,'body ends on its original bone');
    }
  }
  for(const limb of a.limbs) {
    const frame=limb.kind==='arm'?a.actualPose.chest:a.actualPose.pelvis;
    const x=(limb.kind==='arm'?3:-5)*CONFIG.robot.scale;
    const y=limb.side*(limb.kind==='arm'?15:12)*CONFIG.robot.scale;
    const root={x:frame.x+Math.cos(frame.angle)*x-Math.sin(frame.angle)*y,
      y:frame.y+Math.sin(frame.angle)*x+Math.cos(frame.angle)*y};
    const node=actor.querySelector(`[data-skin-segment="${limb.kind}-${limb.side}-upper"]`);
    const [A,B,C,D,E,F]=node.getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(' ').map(Number);
    assert.ok(Math.abs(A*8+C*32+E-root.x)<1e-8,'arm/leg root X remains at the original attachment');
    assert.ok(Math.abs(B*8+D*32+F-root.y)<1e-8,'arm/leg root Y remains at the original attachment');
  }
  const chest=actor.querySelector('[data-skin-segment="spine-0"]');
  const chestMatrix=chest.getAttribute('transform');
  for(let i=0;i<3;i++)hit(a,'arm--1-upper');
  paint();
  assert.equal(actor.getAttribute('style'),actorStyle,'damage does not recolour or illuminate the actor');
  assert.equal(label.style.fill,identityFill);
  assert.notEqual(module.getAttribute('stroke'),healthyStroke,'card retains damage indication');
  assert.equal(actor.querySelector('[data-skin-segment="arm--1-upper"]').getAttribute('display'),'none');
  assert.equal(actor.querySelector('[data-skin-segment="arm--1-lower"]').getAttribute('display'),'none');
  assert.equal(chest.getAttribute('transform'),chestMatrix);
  assert.equal(ctx.detachedG.querySelectorAll('[data-skin-segment]').length,2);
  assert.ok([...ctx.detachedG.querySelectorAll('image')].every(img=>img.getAttribute('href').endsWith(name+'.png')));
  const severed=ctx.detachedG.querySelector('[data-skin-segment="arm--1-upper"]');
  const frozen=severed.getAttribute('transform');
  for(let i=0;i<30;i++)step(1/60);
  paint();
  assert.equal(severed.getAttribute('transform'),frozen);
  for(let i=0;i<5;i++)hit(a,'head');
  paint();
  assert.equal(actor.querySelector('[data-skin-segment="head"]').getAttribute('display'),'none');
  assert.ok(ctx.detachedG.querySelector('[data-skin-segment="head"]'));
  ctx.combat.finished=true;ctx.combat.winner=id;ctx.combat.finishedAt=ctx.game.time;
  paint();
  const layer=actor.querySelector('[data-skin-layer="body"]');
  const glowSelector='#tag7hop-victory-glow-'+id;
  const figure=actor.querySelector('[data-robot-figure]');
  const filter=ctx.defs.querySelector(glowSelector);
  assert.equal(layer.getAttribute('filter'),null,'texture is not tinted');
  assert.equal(figure.getAttribute('filter'),'url('+glowSelector+')');
  assert.equal(label.parentNode,actor,'identity letter is outside the glowing silhouette');
  assert.equal(label.style.fill,identityFill,'winner keeps the card identity colour on its letter');
  assert.equal(actor.style.getPropertyValue('--robot-color'),'#b7ada1','vector fallback keeps its original colour');
  assert.equal(filter.querySelector('feColorMatrix'),null);
  assert.equal(filter.querySelector('feMorphology').getAttribute('radius'),'6');
  assert.equal(filter.querySelector('feGaussianBlur').getAttribute('stdDeviation'),'8');
  assert.equal(filter.querySelector('feComposite').getAttribute('operator'),'out');
  assert.equal(filter.querySelector('feMergeNode:last-child').getAttribute('in'),'SourceGraphic');
  const gold=filter.querySelector('feFlood').getAttribute('flood-color');
  ctx.game.time+=.3;
  paint();
  assert.notEqual(filter.querySelector('feFlood').getAttribute('flood-color'),gold,'golden shimmer animates');
  assert.ok(ctx.robots.filter(r=>r.id!==id).every(r=>r.actor.querySelector('[data-robot-figure]').getAttribute('filter')==='none'));
  image.dispatchEvent(new Event('error'));
  assert.equal(actor.getAttribute('data-skin-ready'),'false');
  assert.equal(actor.querySelector('ellipse.head').style.visibility,'');
  for(const decoration of actor.querySelectorAll('.robot-horn, .robot-sphere'))assert.equal(decoration.style.visibility,'');
  assert.ok([...actor.querySelectorAll('[data-skin-layer]')].every(n=>n.getAttribute('display')==='none'));
  resetRound();
  assert.equal(ctx.robots[id].actor.querySelectorAll('[data-skin-segment]').length,13);
  assert.equal(ctx.defs.querySelectorAll(glowSelector).length,0,'new round removes victory halo');
  assert.equal(ctx.detachedG.children.length,0);
  dom.window.close();
 }
});


test('overlapping limbs do not pin a robot during close combat',()=>{
  const dom=setup();
  ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);
  ctx.robots=[];
  const a=createRobot(0,{x:300,y:320,angle:0});
  const b=createRobot(1,{x:300,y:350,angle:0});
  ctx.robots=[a,b];
  const core=c=>c.segment==='head'||c.segment.startsWith('spine-');
  const gap=(xs,ys)=>Math.min(...xs.flatMap(c=>ys.map(d=>segmentDistance(c.a,c.b,d.a,d.b)-c.r-d.r)));
  assert.ok(gap(a.capsules,b.capsules)<0,'fixture has interlocked limbs');
  assert.ok(gap(a.capsules.filter(core),b.capsules.filter(core))>0,'bodies start apart');
  const start={x:a.x,y:a.y};
  for(let i=0;i<180;i++){
    ctx.game.time+=1/60;
    a.tick(1/60,{goal:{x:440,y:320},speed:45,mode:'chase',lookPoint:null});
    assert.ok(gap(a.capsules.filter(core),b.capsules.filter(core))>=-.01,'bodies stay solid');
  }
  assert.ok(Math.hypot(a.x-start.x,a.y-start.y)>10,'robot can leave limb overlap');
  assert.ok(a.capsules.some(c=>c.segment.startsWith('arm-')),'limb hit geometry is retained');
  dom.window.close();
});


test('close-range bodies stay solid, hits remain possible and fighters can retreat',()=>{
  const dom=setup();
  ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);
  ctx.robots=[];
  const a=createRobot(0,{x:280,y:250,angle:0});
  const b=createRobot(1,{x:370,y:250,angle:Math.PI});
  ctx.robots=[a,b];
  const core=c=>c.segment==='head'||c.segment.startsWith('spine-');
  for(let i=0;i<240;i++){
    ctx.game.time+=1/60;
    for(const [r,other] of [[a,b],[b,a]])r.tick(1/60,{goal:{x:other.x,y:other.y},speed:45,mode:'chase',lookPoint:null});
    for(const c of a.capsules.filter(core))for(const d of b.capsules.filter(core)){
      assert.ok(segmentDistance(c.a,c.b,d.a,d.b)>=c.r+d.r-.01,'solid bodies never pass through each other');
    }
  }
  assert.ok(a.attackSources.some(s=>strikeCandidates(a,b,s).length>0)||b.attackSources.some(s=>strikeCandidates(b,a,s).length>0),'contact distance permits a strike');
  const x=a.x;
  for(let i=0;i<120;i++){
    ctx.game.time+=1/60;
    a.tick(1/60,{goal:{x:180,y:250},speed:45,mode:'chase',lookPoint:null,retreat:{x:-1,y:0}});
  }
  assert.ok(a.x<x-10,'body contact allows retreat');
  dom.window.close();
});

test('limbs still stop at arena walls and obstacles',()=>{
  const dom=setup();
  ctx.robots=[];
  const r=createRobot(0,{x:250,y:350,angle:0});
  ctx.robots=[r];
  for(let i=0;i<240;i++){
    ctx.game.time+=1/60;
    r.tick(1/60,{goal:{x:450,y:350},speed:45,mode:'chase',lookPoint:null});
    assert.ok(r.capsules.every(c=>coreClearBone(c.a,c.b,c.r)),'every body and limb capsule stays outside walls');
  }
  dom.window.close();
});


test('nearby light is half as bright without changing its diameter or the beam',()=>{
  const dom=setup(),r=ctx.robots[0];
  const gradient=document.getElementById('tag7hop-pool-0');
  const near=r.nearLight.getAttribute('d');
  const original=CONFIG.light.nearbyIntensity;
  try {
    CONFIG.light.nearbyIntensity=1;r.paint(false);
    const pool=document.querySelector('.neon-pool');
    const full=Number(r.nearLight.getAttribute('opacity'));
    const beam=r.lightBeam.getAttribute('opacity');
    const poolFull=Number(pool.getAttribute('opacity'));
    CONFIG.light.nearbyIntensity=.5;r.paint(false);
    assert.equal(Number(r.nearLight.getAttribute('opacity')),full/2);
    assert.equal(Number(pool.getAttribute('opacity')),poolFull/2);
    assert.equal(r.lightBeam.getAttribute('opacity'),beam);
    assert.equal(r.nearLight.getAttribute('d'),near);
    assert.equal(Number(gradient.getAttribute('r')),75);
  } finally {CONFIG.light.nearbyIntensity=original;dom.window.close();}
});

test('all robots share a 2000-drop FIFO limit including settled puddles and their SVG nodes',()=>{
  const dom=setup();
  ctx.combat.oilLeaks=[];
  const seed=ctx.seed;
  for(let i=0;i<2000;i++)createOilDrop(i%4,200+i%100,250,4);
  const first=ctx.combat.oilDrops[0],sixth=ctx.combat.oilDrops[5];
  ctx.settledOilDrops.add(first);
  for(let i=0;i<5;i++)createOilDrop(i%4,350,350,15);
  assert.equal(ctx.combat.oilDrops.length,2000);
  assert.equal(ctx.oilG.children.length,2000,'removed puddles leave no SVG nodes');
  assert.equal(ctx.combat.oilDrops[0],sixth,'oldest creation order wins even with equal timestamps');
  assert.equal(first.node.isConnected,false);
  assert.equal(ctx.settledOilDrops.has(first),false);
  assert.equal(ctx.combat.oilDrops.at(-1).baseRadius,15);
  assert.equal(ctx.seed,seed,'eviction does not change combat randomness');
  resetRound();
  assert.equal(ctx.combat.oilDrops.length,0);
  assert.equal(ctx.oilG.children.length,0);
  dom.window.close();
});

test('fixed simulation and combat RNG are identical at 60, 30, 25, 15, 10 FPS and uneven frames',()=>{
  const run=intervals=>{
    const original=Math.random;let dom;
    try {Math.random=()=>.2468;dom=setup();}finally{Math.random=original;}
    ctx.last=0;ctx.paintAt=0;ctx.debt=0;
    // Start with an active wound so render-dependent random consumption cannot
    // hide behind the relatively long wait for the first severed segment.
    ctx.combat.oilLeaks=[{robot:0,key:'head',nextAt:0}];
    let now=0,index=0;
    while(now<5000-1e-7){now=Math.min(5000,now+intervals[index++%intervals.length]);frame(now);}
    assert.ok(Math.abs(ctx.game.time-5)<1e-8,'five real seconds produce five simulated seconds');
    assert.ok(ctx.combat.oilDrops.length>5,'the regression includes active dripping');
    const result=JSON.parse(JSON.stringify({
      seed:ctx.seed,game:ctx.game,roundTime:ctx.round.elapsedSec,
      robots:ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,hp:[...r.hp],pose:r.actualPose})),
      hits:ctx.combat.hits,strikes:ctx.combat.strikes,pending:ctx.combat.pending,
      leaks:ctx.combat.oilLeaks,drops:ctx.combat.oilDrops.map(d=>({born:d.born,x:d.x,y:d.y,r:d.baseRadius})),
    }));
    dom.window.close();return result;
  };
  const baseline=run([1000/60]);
  for(const fps of [30,25,15,10])assert.deepEqual(run([1000/fps]),baseline,'FPS '+fps);
  assert.deepEqual(run([16,40,90,250,33,17]),baseline,'irregular frame times');
});

test('rendering cannot emit liquid or consume simulation randomness',()=>{
  const dom=setup();
  ctx.combat.oilLeaks=[{robot:0,key:'head',nextAt:0}];
  const seed=ctx.seed;
  for(let i=0;i<5;i++)paint();
  assert.equal(ctx.seed,seed);
  assert.equal(ctx.combat.oilDrops.length,0);
  assert.equal(ctx.combat.oilLeaks[0].nextAt,0);
  step(1/60);
  assert.ok(ctx.combat.oilDrops.length>0,'fixed simulation step emits the liquid');
  dom.window.close();
});

test('an active frame stall retains debt; pause and hidden-tab time are excluded',()=>{
  const dom=setup();
  ctx.last=0;ctx.paintAt=0;ctx.debt=0;
  frame(2000);
  assert.ok(Math.abs(ctx.game.time-1)<1e-8,'catch-up work per callback is bounded');
  assert.ok(Math.abs(ctx.debt-1)<1e-8,'unprocessed active time is kept');
  frame(2000+1000/60);
  frame(2000+2000/60);
  assert.ok(Math.abs(ctx.game.time-(2+2/60))<1e-8,'subsequent callbacks recover all active time');
  const before=ctx.game.time;
  ctx.button.click();frame(12000);ctx.button.click();frame(22000);
  assert.equal(ctx.game.time,before,'resuming does not replay paused time');
  frame(22000+1000/60);
  const visibleTime=ctx.game.time;
  Object.defineProperty(document,'hidden',{value:true,configurable:true});
  document.dispatchEvent(new Event('visibilitychange'));frame(32000);
  Object.defineProperty(document,'hidden',{value:false,configurable:true});
  document.dispatchEvent(new Event('visibilitychange'));frame(42000);
  assert.equal(ctx.game.time,visibleTime,'returning to a tab does not replay hidden time');
  frame(42000+1000/60);
  assert.ok(Math.abs(ctx.game.time-visibleTime-1/60)<1e-8);
  dom.window.close();
});

test('double-time button toggles speed, respects pause and resets for a new round',()=>{
  const dom=setup(),button=document.querySelector('#tag7hop-speed');
  assert.equal(ctx.button.nextElementSibling,button,'speed is beside pause');
  assert.equal(button.disabled,false);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  ctx.last=0;ctx.paintAt=0;ctx.debt=0;
  let now=0;
  const advance=ms=>{const end=now+ms;while(now<end){now=Math.min(end,now+40);frame(now);}};
  advance(1000);
  assert.ok(Math.abs(ctx.game.time-1)<1e-8);
  button.click();
  assert.equal(ctx.timeScale,2);
  assert.equal(button.getAttribute('aria-pressed'),'true');
  advance(1000);
  assert.ok(Math.abs(ctx.game.time-3)<1e-8,'one real second advances two game seconds');
  button.click();advance(1000);
  assert.equal(ctx.timeScale,1);
  assert.ok(Math.abs(ctx.game.time-4)<1e-8,'second click restores normal time');
  button.click();ctx.button.click();advance(2000);
  assert.ok(Math.abs(ctx.game.time-4)<1e-8,'double time does not override pause');
  assert.equal(ctx.timeScale,2);
  ctx.button.click();frame(now);advance(500);
  assert.ok(Math.abs(ctx.game.time-5)<1e-8,'double speed is retained after resuming');
  resetRound();
  assert.equal(ctx.timeScale,1);
  assert.equal(button.getAttribute('aria-pressed'),'false');
  assert.equal(button.disabled,true);
  button.click();assert.equal(ctx.timeScale,1,'disabled before the fight starts');
  dom.window.close();
});

test('double time preserves fixed-step combat and randomness; toggling keeps fractional time',()=>{
  const run=double=>{
    const original=Math.random;let dom;
    try{Math.random=()=>.2468;dom=setup();}finally{Math.random=original;}
    ctx.last=0;ctx.paintAt=0;ctx.debt=0;
    ctx.combat.oilLeaks=[{robot:0,key:'head',nextAt:0}];
    if(double)ctx.speedButton.click();
    const frames=double?150:300;
    for(let i=1;i<=frames;i++)frame(i*1000/60);
    const snapshot=JSON.parse(JSON.stringify({seed:ctx.seed,time:ctx.game.time,
      robots:ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,hp:[...r.hp],pose:r.actualPose})),
      strikes:ctx.combat.strikes,hits:ctx.combat.hits,
      drops:ctx.combat.oilDrops.map(d=>({born:d.born,x:d.x,y:d.y,r:d.baseRadius})),
    }));
    dom.window.close();return snapshot;
  };
  assert.deepEqual(run(true),run(false),'five game seconds have the same outcome at either speed');
  const dom=setup();ctx.last=0;ctx.paintAt=0;ctx.debt=0;
  frame(10);ctx.speedButton.click();frame(20);
  assert.ok(Math.abs(ctx.game.time+ctx.debt-.03)<1e-8,'switching speed keeps the partial fixed step');
  dom.window.close();
});
