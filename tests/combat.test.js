import {ASSETS} from '../src/assets/manifest.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { createInertia, inertiaOffset, detachedCenter } from '../src/render/inertia.js';
import { coreClearBone } from '../src/systems/collision.js';
import { strikeCandidates } from '../src/systems/combat.js';
import { headGuardActive } from '../src/systems/ai.js';
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

function setup({start=true,reduced=false,textures=null}={}) {
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const dom=new JSDOM(html,{url:'https://biovshi.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:reduced});
  globalThis.ResizeObserver=class { observe(){} disconnect(){} };
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  initializeGame({entry:'setup',textures});
  document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
  document.querySelector('#garage-next').click();document.querySelector('#bet-fight').click();
  if(start)advanceStartup(3);
  assert.equal(ctx.startup.phase,start?'running':'spawning');
  return dom;
}
function hit(robot,key) {ctx.game.time+=CONFIG.combat.damageInvulnerabilitySec+.01;return robot.damage(key,1);}

test('head protection is short and cannot repeat until its cooldown ends', () => {
  const ai={headGuardUntil:0,headGuardCooldownUntil:0};
  assert.equal(headGuardActive(ai,100,2,95,true,4),true,'critical head first triggers cover');
  assert.equal(ai.headGuardUntil,100.8);
  assert.equal(ai.headGuardCooldownUntil,107);
  assert.equal(headGuardActive(ai,100.7,2,95,true,4),true,'guard lasts for a fraction of a second');
  assert.equal(headGuardActive(ai,100.81,2,95,true,4),false,'patient must re-engage');
  assert.equal(headGuardActive(ai,104,2,95,true,4),false,'low HP alone cannot restart defense');
  assert.equal(headGuardActive(ai,107,2,95,true,4),true,'brief guard may recur after cooldown');
  assert.equal(headGuardActive(ai,108,2,95,false,4),false,'unseen opponent cannot trigger guard');
  assert.equal(headGuardActive(ai,108,2,95,true,0),false,'head-only patient uses escape behavior');
  assert.equal(headGuardActive(ai,108,3,95,true,4),false,'healthy head does not trigger emergency guard');
});

test('chest is invulnerable; destroying the head immediately kills the patient', () => {
  const dom=setup();
  const r=ctx.robots[0],turn=r.turnAbility;
  assert.equal(r.damage('spine-0',1),false);
  assert.equal(r.hasHead,true);
  assert.equal(hit(r,'head'),true);
  assert.equal(r.damage('head',1),false,'same-frame damage is rejected');
  for(let i=0;i<6;i++)hit(r,'head');
  assert.equal(r.hasHead,false);
  assert.equal(r.turnAbility,turn/2);
  assert.equal(r.canSee({x:r.x,y:r.y}),false);
  assert.equal(r.mobile,false);
  assert.equal(r.capsules.length,0);
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

test('losing every limb starts unconsciousness countdown; reset restores anatomy and bets', () => {
  const dom=setup();
  const r=ctx.robots[0];
  for(const kind of ['arm','leg'])for(const side of [-1,1])for(let i=0;i<3;i++)hit(r,`${kind}-${side}-upper`);
  assert.equal(r.mobile,true,'head remains alive and may crawl');
  assert.equal(r.movementLimbs,0);
  step(1/60);
  const deadline=ctx.combat.unarmedDeadline[r.id];
  assert.ok(deadline>ctx.game.time+9&&deadline<=ctx.game.time+15);
  ctx.game.time=deadline;
  step(1/60);
  assert.equal(r.mobile,false,'loss of consciousness ends the escape');
  assert.equal(r.hasHead,true,'unconsciousness does not destroy the head');
  resetRound();
  assert.equal(ctx.startup.phase,'betting');
  assert.equal(ctx.round.elapsedSec,0);
  assert.ok(ctx.robots.every(r=>r.mobile&&r.movementLimbs===4&&r.hasHead));
  dom.window.close();
});


test('two head-only patients fight the countdown; the later loss of consciousness wins', () => {
  const dom=setup();
  for(const r of ctx.robots.slice(2))for(let i=0;i<6;i++)hit(r,'head');
  for(const r of ctx.robots.slice(0,2))
    for(const kind of ['arm','leg'])for(const side of [-1,1])
      for(let i=0;i<3;i++)hit(r,`${kind}-${side}-upper`);
  step(1/60);
  assert.equal(ctx.combat.finished,false,'two conscious heads remain in combat');
  const now=ctx.game.time;
  ctx.combat.unarmedDeadline[0]=now+1;
  ctx.combat.unarmedDeadline[1]=now+3;
  ctx.game.time=now+1;
  step(1/60);
  assert.equal(ctx.combat.finished,true);
  assert.equal(ctx.combat.winner,1);
  assert.equal(ctx.robots[0].hasHead,true);
  assert.equal(ctx.robots[0].mobile,false);
  assert.equal(ctx.robots[1].mobile,true);
  dom.window.close();
});

test('simultaneous unconsciousness of last two head-only patients is a draw', () => {
  const dom=setup();
  for(const r of ctx.robots.slice(2))for(let i=0;i<6;i++)hit(r,'head');
  for(const r of ctx.robots.slice(0,2))
    for(const kind of ['arm','leg'])for(const side of [-1,1])
      for(let i=0;i<3;i++)hit(r,`${kind}-${side}-upper`);
  step(1/60);
  assert.equal(ctx.combat.finished,false);
  const deadline=ctx.game.time+1;
  ctx.combat.unarmedDeadline[0]=deadline;
  ctx.combat.unarmedDeadline[1]=deadline;
  ctx.game.time=deadline;
  step(1/60);
  assert.equal(ctx.combat.finished,true);
  assert.equal(ctx.combat.winner,null);
  dom.window.close();
});

test('simulation advances with finite poses; a finished round settles once and opens results', () => {
  const dom=setup();
  const before=ctx.robots.map(r=>({x:r.x,y:r.y}));
  for(let i=0;i<120;i++)step(1/60);
  paint();
  assert.ok(ctx.robots.every(r=>Number.isFinite(r.x)&&Number.isFinite(r.y)&&Number.isFinite(r.angle)));
  assert.ok(ctx.robots.some((r,i)=>Math.hypot(r.x-before[i].x,r.y-before[i].y)>0));
  for(const r of ctx.robots.slice(1))for(let i=0;i<6;i++)hit(r,'head');
  step(1/60);
  assert.equal(ctx.combat.finished,true);
  assert.equal(ctx.combat.winner,0);
  assert.equal(ctx.betting.phase,'settled');
  const elapsed=ctx.round.elapsedSec;
  const celebrationUntil=ctx.combat.celebrationUntil;
  assert.ok(celebrationUntil>=ctx.combat.finishedAt,
    'the winner must have a presentation deadline');
  for(let i=0;i<181;i++)step(1/60);
  assert.equal(ctx.round.elapsedSec,elapsed);
  assert.equal(ctx.betting.history.length,1);
  if(ctx.game.time<celebrationUntil)
    assert.equal(ctx.resultsPanel.hidden,true,
      'results must not interrupt the second or third victory gesture');
  // Run beyond the longest possible series; assert the screen eventually
  // opens regardless of the randomly chosen 2-3 full gesture cycles.
  for(let i=0;i<600&&ctx.resultsPanel.hidden;i++)step(1/60);
  assert.equal(ctx.resultsPanel.hidden,false);
  assert.equal(ctx.round.elapsedSec,elapsed);
  assert.equal(ctx.betting.history.length,1);
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
    delete snapshot.betting.floorId;
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
    if(pass)initializeGame({entry:'setup'});
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

test('vision cones stay absent in both qualities; liquid sprites age and fall back cleanly; red centre circle is absent',()=>{
  const dom=setup();
  assert.equal(ctx.root.querySelector('#tag7hop-guide-visuals'),null);
  const robot=ctx.robots[0];
  for(const mode of ['full','light','full']) {
    ctx.renderProfile=chooseRenderProfile(mode,false);paint();
    assert.equal(robot.vision,null);
    assert.equal(robot.lightBeam,null);
    assert.equal(ctx.svg.querySelectorAll('[id*="tag7hop-beam-"]').length,0);
    assert.equal(robot.nearLight.tagName,'circle');
  }
  for(let i=0;i<6;i++)hit(robot,'head');
  paint();
  assert.equal(robot.vision,null);
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
  assert.equal(ctx.root.querySelector('#tag7hop-guide-visuals'),null);
  assert.equal(ctx.oilG.childNodes.length,0);
  assert.equal(ctx.root.querySelector('#tag7hop-guide-visuals'),null);
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

test('every robot uses its own atlas; severed parts, victory halo and load fallback work for A through D',async()=>{
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
  assert.equal(actor.querySelector('ellipse.head'),null,'textured patients have no fallback geometry in the scene');
  assert.equal(actor.querySelectorAll('.robot-horn, .robot-sphere').length,0);
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
  assert.equal(ctx.svg.querySelector('#tag7hop-beam-'+id+'-tint'),null);
  const healthyState=ctx.cardNodes[id].portraitStates['arm--1-upper'];
  assert.equal(healthyState,'good');
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
  assert.notEqual(ctx.cardNodes[id].portraitStates['arm--1-upper'],healthyState,'textured card retains damage indication');
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
  for(let i=0;i<6;i++)hit(a,'head');
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
  await resetRound();
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


test('nearby light is half as bright without changing its circular diameter',()=>{
  const dom=setup(),r=ctx.robots[0];
  const gradient=document.getElementById('tag7hop-pool-0');
  const near=r.nearLight.getAttribute('transform');
  const original=CONFIG.light.nearbyIntensity;
  try {
    CONFIG.light.nearbyIntensity=1;r.paint(false);
    const pool=document.querySelector('.neon-pool');
    const full=Number(r.nearLight.getAttribute('opacity'));
    const poolFull=Number(pool.getAttribute('opacity'));
    CONFIG.light.nearbyIntensity=.5;r.paint(false);
    assert.equal(Number(r.nearLight.getAttribute('opacity')),full/2);
    assert.equal(Number(pool.getAttribute('opacity')),poolFull/2);
    assert.equal(r.nearLight.getAttribute('transform'),near);
    assert.equal(Number(r.nearLight.getAttribute('r')),75);
    assert.equal(gradient.getAttribute('gradientUnits'),'objectBoundingBox');
  } finally {CONFIG.light.nearbyIntensity=original;dom.window.close();}
});

test('all robots share a 2000-drop FIFO limit including settled puddles and their SVG nodes',()=>{
  const dom=setup();
  ctx.combat.oilLeaks=[];
  const seed=ctx.seed;
  for(let i=0;i<2000;i++){createOilDrop(i%4,200+i%100,250,4);ctx.combat.oilDrops.at(-1).born-=CONFIG.oil.drySec+1;}
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

test('spawn leaps from beyond the arena, fades and lands before combat without changing physics',()=>{
  for(const quality of ['full','light']){
    const dom=setup({start:false});
    ctx.renderProfile=chooseRenderProfile(quality,false);paint();
    const first=ctx.robots[ctx.startup.order[0]];
    const physics=JSON.stringify(ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,capsules:r.capsules})));
    const seed=ctx.seed;
    assert.equal(first.actor.getAttribute('opacity'),'0.000');
    assert.ok(first.actor.getAttribute('transform').includes('scale(1.25)'));
    const translated=first.actor.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
    assert.ok(ctx.arenaPlanes.some(p=>p.nx*translated[0]+p.ny*translated[1]>p.c),'starts beyond the playable perimeter');
    const initialLight=first.nearLight.getAttribute('transform');
    step(1/60);assert.equal(ctx.game.time,0,'no combat while spawning');
    advanceStartup(.1);
    assert.equal(first.actor.getAttribute('opacity'),'0.500');
    assert.equal(first.trail.length,0,'airborne feet leave no footprints');
    assert.notEqual(first.nearLight.getAttribute('transform'),initialLight,'light follows the entry in both graphics modes');
    assert.ok(first.actor.getAttribute('transform').includes('scale(1.03125)'));
    advanceStartup(.1);
    assert.equal(first.actor.getAttribute('opacity'),'1.000');
    assert.ok(first.actor.getAttribute('transform').includes('scale(1)'));
    assert.ok(first.trail.length>0,'landing leaves prints at the actual spawn position');
    advanceStartup(1);
    assert.equal(ctx.startup.nextIndex,4);
    assert.equal(ctx.startup.phase,'spawning','last robot is still in the air');
    assert.equal(ctx.button.disabled,true);
    advanceStartup(.1);
    assert.equal(ctx.startup.phase,'spawning');
    advanceStartup(.1);
    assert.equal(ctx.startup.phase,'running');
    assert.equal(ctx.button.disabled,false);
    assert.ok(ctx.robots.every(r=>r.actor.getAttribute('opacity')==='1.000'));
    assert.equal(ctx.game.time,0);
    assert.equal(ctx.seed,seed,'entry animation consumes no game RNG');
    assert.equal(JSON.stringify(ctx.robots.map(r=>({x:r.x,y:r.y,angle:r.angle,capsules:r.capsules}))),physics);
    dom.window.close();
  }
});

test('reduced motion uses a stationary spawn fade and a large startup step finishes every landing',()=>{
  const dom=setup({start:false,reduced:true});
  const r=ctx.robots[ctx.startup.order[0]];
  const transform=r.actor.getAttribute('transform');
  assert.ok(transform.includes('scale(1)'));
  advanceStartup(.1);
  assert.equal(r.actor.getAttribute('opacity'),'0.500');
  assert.equal(r.actor.getAttribute('transform'),transform,'no flight or scaling with reduced motion');
  advanceStartup(3);
  assert.equal(ctx.startup.phase,'running');
  assert.ok(ctx.robots.every(r=>r.visible&&r.actor.getAttribute('opacity')==='1.000'));
  dom.window.close();
});

test('render cap keeps 30 FPS on 75 Hz, 144 Hz and uneven 60 Hz callbacks',()=>{
  const results=[];
  for(const [label,intervals] of [['60 Hz',[1000/60]],['75 Hz',[1000/75]],['144 Hz',[1000/144]],['uneven 60 Hz',[15.8,17.2,16.6,17.1]]]){
    const dom=setup();
    ctx.last=0;ctx.paintAt=0;ctx.debt=0;
    let paints=0,now=0,index=0;
    const robot=ctx.robots[0],original=robot.paint;
    robot.paint=(...args)=>{paints++;return original(...args);};
    while(now<2000-1e-7){now=Math.min(2000,now+intervals[index++%intervals.length]);frame(now);}
    results.push({label,fps:paints/2});
    dom.window.close();
  }
  assert.ok(results.every(r=>r.fps>=29.5&&r.fps<=30.5),JSON.stringify(results));
});

test('liquid fallback is allocated only after an error and immediately matches the current stain',()=>{
  const dom=setup();
  createOilDrop(0,350,350,4);
  const drop=ctx.combat.oilDrops.at(-1),sprite=drop.sprite;
  assert.equal(sprite.fallback,null);
  assert.equal(drop.node.querySelector('circle'),null);
  ctx.game.time+=2;paintOil();
  const radius=Number(sprite.viewport.getAttribute('width'))/2;
  sprite.image.dispatchEvent(new Event('error'));
  assert.ok(Math.abs(Number(sprite.fallback.getAttribute('r'))-radius)<.01);
  assert.equal(sprite.fallback.getAttribute('display'),'');
  const fallback=sprite.fallback;
  ctx.game.time+=1;paintOil();
  assert.equal(Number(fallback.getAttribute('r')),6);
  sprite.image.dispatchEvent(new Event('load'));
  assert.equal(fallback.getAttribute('display'),'none');
  sprite.image.dispatchEvent(new Event('error'));
  assert.equal(sprite.fallback,fallback,'reuses the existing fallback after another error');
  dom.window.close();
});

test('loaded skins skip hidden vector updates and refresh fallback geometry immediately on failure',()=>{
  const dom=setup();
  ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);ctx.robots=[];
  const robot=createRobot(0,{x:300,y:250,angle:0});ctx.robots=[robot];
  robot.paint(false);
  const head=robot.actor.querySelector('ellipse.head'),image=robot.actor.querySelector('image');
  const old=head.getAttribute('cx');
  image.dispatchEvent(new Event('load'));
  for(let i=0;i<60;i++){
    ctx.game.time+=1/60;
    robot.tick(1/60,{goal:{x:440,y:250},speed:45,mode:'chase',lookPoint:null});
    robot.paint(false);
  }
  assert.equal(head.getAttribute('cx'),old,'hidden fallback is not updated each frame');
  assert.notEqual(robot.eye.x,Number(old));
  image.dispatchEvent(new Event('error'));
  assert.equal(head.style.visibility,'');
  assert.equal(Number(head.getAttribute('cx')),robot.eye.x,'fallback uses the latest physical pose');
  assert.equal(Number(head.getAttribute('cy')),robot.eye.y);
  dom.window.close();
});

test('preloaded patients create no duplicate vector models and only a failed atlas uses fallback',()=>{
  const textures=Object.fromEntries(['robotA','robotB','robotC','robotD'].map(key=>[key,{loaded:true}]));
  const dom=setup({textures});
  assert.equal(ctx.actorsG.querySelectorAll('[data-robot-fallback]').length,0);
  assert.equal(ctx.actorsG.querySelectorAll('ellipse.head').length,0);
  assert.equal(ctx.groundG.querySelectorAll('circle').length,0,'support markers are not part of the scene');
  assert.equal(ctx.actorsG.querySelectorAll('.extra-limbs').length,0);
  const r=ctx.robots[0],image=r.actor.querySelector('image');
  image.dispatchEvent(new Event('error'));
  assert.equal(r.actor.querySelectorAll('[data-robot-fallback]').length,2);
  image.dispatchEvent(new Event('load'));
  assert.equal(r.actor.querySelectorAll('[data-robot-fallback]').length,0);
  assert.equal(ctx.root.querySelector('#tag7hop-guide-visuals'),null);
  assert.equal(ctx.root.querySelector('#gladiator-debris'),null);
  for(let i=0;i<3;i++)initializeGame({entry:'setup',textures});
  const ids=[...ctx.svg.querySelectorAll('[id]')].map(n=>n.id);
  assert.equal(new Set(ids).size,ids.length,'reinitialization leaves no duplicate legacy layers');
  dom.window.close();
  const partial=setup({textures:{...textures,robotB:{loaded:false}}});
  assert.equal(ctx.robots[1].actor.querySelectorAll('image').length,0,'known missing textures are not requested again');
  assert.equal(ctx.robots[1].actor.querySelectorAll('[data-robot-fallback]').length,2);
  assert.ok(ctx.robots.filter(r=>r.id!==1).every(r=>!r.actor.querySelector('[data-robot-fallback]')));
  partial.window.close();
});

test('fresh liquid is capped globally at 1000/full or 500/light while dry stains keep the 2000 total cap',()=>{
  const dom=setup();
  const seed=ctx.seed;
  for(let i=0;i<1500;i++)createOilDrop(i%4,i,250,4);
  assert.equal(ctx.combat.oilDrops.length,1000);
  assert.equal(ctx.combat.oilDrops[0].x,500,'oldest fresh stains disappear first');
  const control=document.getElementById('graphics-quality');
  control.value='light';control.dispatchEvent(new Event('change'));
  assert.equal(ctx.combat.oilDrops.length,500,'switching quality applies the limit immediately');
  assert.equal(ctx.combat.oilDrops[0].x,1000);
  ctx.game.time+=CONFIG.oil.drySec+1;
  for(let i=0;i<600;i++)createOilDrop(i%4,2000+i,250,4);
  assert.equal(ctx.combat.oilDrops.length,1000,'500 dry and 500 fresh stains coexist');
  assert.equal(ctx.combat.oilDrops.filter(d=>ctx.game.time-d.born<CONFIG.oil.drySec).length,500);
  assert.equal(ctx.seed,seed,'graphics limits do not change combat randomness');
  dom.window.close();
});

test('mobile portrait is blocked and pauses game time until landscape resumes',()=>{
  const dom=setup(),win=dom.window;
  ctx.touchDevice=true;
  Object.defineProperty(win,'innerWidth',{value:390,configurable:true});
  Object.defineProperty(win,'innerHeight',{value:844,configurable:true});
  win.dispatchEvent(new Event('resize'));
  assert.equal(ctx.orientationBlocked,true);
  assert.equal(ctx.root.querySelector('#landscape-required').hidden,false);
  ctx.last=0;frame(1000);step(1/60);
  assert.equal(ctx.game.time,0);
  Object.defineProperty(win,'innerWidth',{value:844,configurable:true});
  Object.defineProperty(win,'innerHeight',{value:390,configurable:true});
  win.dispatchEvent(new Event('resize'));
  assert.equal(ctx.orientationBlocked,false);
  frame(10000);frame(10000+1000/60);
  assert.ok(Math.abs(ctx.game.time-1/60)<1e-8,'portrait time is not replayed on rotation');
  assert.equal(ctx.paused,false,'orientation does not alter the manual pause toggle');
  ctx.root.__disposeTag();
  assert.equal(ctx.root.querySelector('#landscape-required'),null);
  dom.window.close();
});


test('severed anatomy slides 30 cm with deceleration over 1.5 seconds then stops updating',()=>{
  const textures=Object.fromEntries(['robotA','robotB','robotC','robotD'].map(key=>[key,{loaded:true}]));
  const dom=setup({textures});
  ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);ctx.robots=[];
  const r=createRobot(0,{x:300,y:250,angle:0}),attacker=createRobot(1,{x:230,y:250,angle:0});
  ctx.robots=[r,attacker];r.paint(false);
  for(let i=0;i<3;i++)hit(r,'arm-1-upper');
  const part=ctx.combat.detached.at(-1),seed=ctx.seed,pose={x:r.x,y:r.y,angle:r.angle};
  paint();
  assert.equal(part.node.getAttribute('transform'),'translate(0 0)');
  const inner=part.node.querySelector('[data-skin-segment]').getAttribute('transform');
  ctx.game.time=part.inertia.started+.75;paint();
  const half=inertiaOffset(part.inertia);
  assert.ok(Math.abs(Math.hypot(half.x,half.y)-22.5)<1e-7);
  ctx.game.time=part.inertia.started+1.5;paint();
  const end=inertiaOffset(part.inertia);
  assert.ok(Math.abs(Math.hypot(end.x,end.y)-30)<1e-7);
  assert.equal(part.settled,true);
  const transform=part.node.getAttribute('transform');
  ctx.game.time+=3;paint();
  assert.equal(part.node.getAttribute('transform'),transform);
  assert.equal(part.node.querySelector('[data-skin-segment]').getAttribute('transform'),inner,'skin geometry stays frozen inside the sliding group');
  assert.equal(ctx.seed,seed);
  assert.deepEqual({x:r.x,y:r.y,angle:r.angle},pose,'motion does not alter the active skeleton');
  dom.window.close();
});

test('a dead patient has the same cosmetic slide and inactive remains never block combat',()=>{
  const dom=setup();ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);ctx.robots=[];
  const r=createRobot(0,{x:300,y:250,angle:0}),attacker=createRobot(1,{x:230,y:250,angle:0});ctx.robots=[r,attacker];
  r.paint(false);
  for(let i=0;i<6;i++)hit(r,'head');
  assert.equal(r.mobile,false);assert.equal(r.capsules.length,0);
  paint();
  const initial=r.actor.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  const time=ctx.game.time;
  ctx.game.time=time+1.5;paint();
  const final=r.actor.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  assert.ok(Math.abs(Math.hypot(final[0]-initial[0],final[1]-initial[1])-30)<1e-7);
  assert.equal(r.x,300);assert.equal(r.y,250);assert.equal(r.capsules.length,0);
  const transform=r.actor.getAttribute('transform');ctx.game.time+=2;paint();
  assert.equal(r.actor.getAttribute('transform'),transform);
  dom.window.close();
});

test('inertia stops at arena boundaries or obstacles and uses the same endpoint at any sampling rate',()=>{
  const dom=setup();
  const cap=(x,y)=>({a:{x,y},b:{x,y},r:5});
  const wall=createInertia(0,[cap(680,350)]);
  assert.ok(wall.dx<=15.001&&wall.dx>=14.99);
  const obstacle=createInertia(0,[cap(280,350)]);
  assert.ok(obstacle.dx<=15.001&&obstacle.dx>14.9);
  const free=createInertia(0,[]);
  let a,b;
  for(let i=0;i<=90;i++)a=inertiaOffset(free,free.started+i/60);
  for(let i=0;i<=15;i++)b=inertiaOffset(free,free.started+i/10);
  assert.deepEqual(a,b);assert.equal(a.x,30);assert.equal(a.settled,true);
  dom.window.close();
});


test('an unchanged textured frame causes no redundant DOM mutations',()=>{
  const textures=Object.fromEntries(['robotA','robotB','robotC','robotD'].map(key=>[key,{loaded:true}]));
  const dom=setup({textures});paint();
  const observer=new dom.window.MutationObserver(()=>{});
  observer.observe(ctx.root,{attributes:true,childList:true,characterData:true,subtree:true});
  for(let i=0;i<10;i++)paint();
  const mutations=observer.takeRecords();
  assert.equal(mutations.length,0,mutations.map(m=>(m.target.id||m.target.nodeName)+':'+m.attributeName).join(','));
  observer.disconnect();dom.window.close();
});


test('opening results waits for repeated victory gestures and stops hidden arena work',()=>{
  const dom=setup();
  for(const r of ctx.robots.slice(1))for(let i=0;i<6;i++)hit(r,'head');
  step(1/60);assert.equal(ctx.combat.finished,true);
  ctx.last=0;ctx.paintAt=0;ctx.debt=0;
  // Full gestures may take longer than the old fixed three-second glow.
  assert.ok(ctx.combat.celebrationUntil>ctx.combat.finishedAt);
  for(let i=1;i<=181;i++)frame(i*1000/60);
  if(ctx.combat.celebrationUntil>ctx.game.time)
    assert.equal(ctx.resultsPanel.hidden,true,'results must not truncate the celebration');
  for(let i=182;i<=540;i++)frame(i*1000/60);
  assert.equal(ctx.resultsPanel.hidden,false);
  let paints=0;const original=ctx.robots[0].paint;
  ctx.robots[0].paint=(...args)=>{paints++;return original(...args);};
  const time=ctx.game.time,seed=ctx.seed;
  for(let i=541;i<=660;i++)frame(i*1000/60);
  assert.equal(paints,0,'covered arena, lights and victory glow are no longer redrawn');
  assert.equal(ctx.game.time,time);assert.equal(ctx.seed,seed);
  assert.equal(ctx.fpsOutput.textContent,'— FPS');
  dom.window.close();
});


test('decorative light is independent of mathematical vision and no longer clips against obstacles',()=>{
  const dom=setup();ctx.robots=[];
  const r=createRobot(0,{x:250,y:350,angle:0});ctx.robots=[r];r.paint(false);
  assert.equal(r.canSee({x:280,y:350}),true);
  assert.equal(r.canSee({x:450,y:350}),false,'the central obstacle still blocks AI vision');
  assert.equal(r.vision,null);assert.equal(r.lightBeam,null);
  assert.equal(r.nearLight.tagName,'circle');
  assert.equal(r.nearLight.getAttribute('r'),'75');
  assert.equal(r.nearLight.getAttribute('d'),null);
  const seed=ctx.seed;paint();paint();assert.equal(ctx.seed,seed);
  dom.window.close();
});

test('ambient shading and obstacle gradients do not change with game time',()=>{
  const dom=setup();
  const nodes=[ctx.ambientGlowG,...ctx.obstacleLightSpots.flatMap(s=>[s.glow,s.reveal])];
  const before=nodes.map(n=>n.outerHTML);
  for(const time of [1,3,8,13,25,50,100]){ctx.game.time=time;paint();}
  assert.deepEqual(nodes.map(n=>n.outerHTML),before);
  assert.ok(ctx.ambientLights.every(n=>Number(n.getAttribute('opacity'))===CONFIG.light.ambientIntensity));
  dom.window.close();
});


test('detached limbs leave one full-size puddle only at their final rendered skin position',()=>{
  const textures=Object.fromEntries(['robotA','robotB','robotC','robotD'].map(key=>[key,{loaded:true}]));
  const dom=setup({textures});
  ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);ctx.robots=[];
  const r=createRobot(0,{x:300,y:250,angle:0}),attacker=createRobot(1,{x:230,y:250,angle:0});
  ctx.robots=[r,attacker];r.paint(false);
  for(let i=0;i<3;i++)hit(r,'arm-1-upper');
  const part=ctx.combat.detached.at(-1),center=detachedCenter(part.pieces),seed=ctx.seed;
  paint();assert.equal(ctx.combat.oilDrops.length,0);
  ctx.game.time=part.inertia.started+part.inertia.duration-.001;paint();
  assert.equal(ctx.combat.oilDrops.length,0,'no puddle while the limb is still sliding');
  ctx.game.time=part.inertia.started+part.inertia.duration;paint();
  const drop=ctx.combat.oilDrops[0];
  assert.equal(ctx.combat.oilDrops.length,1);
  assert.equal(drop.baseRadius,CONFIG.oil.settledPuddleRadiusCm);
  assert.equal(drop.born,ctx.game.time);
  assert.ok(Math.abs(drop.x-center.x-part.inertia.dx)<1e-8);
  assert.ok(Math.abs(drop.y-center.y-part.inertia.dy)<1e-8);
  assert.ok(Math.hypot(drop.x-center.x,drop.y-center.y)>0);
  ctx.game.time+=5;paint();paint();
  assert.equal(ctx.combat.oilDrops.length,1,'an already settled fragment never emits another puddle');
  assert.equal(ctx.seed,seed,'settling does not consume combat RNG');
  resetRound();ctx.game.time+=5;paint();
  assert.equal(ctx.combat.detached.length,0);assert.equal(ctx.combat.oilDrops.length,0,'reset cancels pending puddles');
  dom.window.close();
});

test('a dead patient leaves its puddle after stopping, at the torso light centre instead of the killing impact',()=>{
  const dom=setup();ctx.obstacles=ctx.obstacles.filter(b=>b.left>500);ctx.robots=[];
  const r=createRobot(0,{x:300,y:250,angle:0}),attacker=createRobot(1,{x:230,y:250,angle:0});ctx.robots=[r,attacker];
  r.paint(false);
  for(let i=0;i<6;i++)hit(r,'head');
  assert.equal(r.mobile,false);const stoppedAt=ctx.game.time+CONFIG.effects.inertiaSec;
  const torso={...r.center};paint();
  // Remove earlier fragments to isolate the patient's pending puddle.
  ctx.combat.detached.length=0;ctx.combat.oilDrops.length=0;ctx.oilG.replaceChildren();
  ctx.game.time=stoppedAt-.001;paint();assert.equal(ctx.combat.oilDrops.length,0);
  ctx.game.time=stoppedAt;paint();assert.equal(ctx.combat.oilDrops.length,1);
  const drop=ctx.combat.oilDrops[0];
  const centre=r.nearLight.getAttribute('transform').match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  assert.ok(Math.hypot(drop.x-centre[0],drop.y-centre[1])<1e-8);
  assert.ok(Math.abs(Math.hypot(drop.x-torso.x,drop.y-torso.y)-30)<1e-7);
  assert.equal(drop.baseRadius,CONFIG.oil.settledPuddleRadiusCm);
  ctx.game.time+=2;paint();assert.equal(ctx.combat.oilDrops.length,1);
  dom.window.close();
});

test('blocked remains are already stopped and do not wait for a fictitious slide',()=>{
  const dom=setup();
  const inertia=createInertia(0,[{a:{x:705,y:350},b:{x:705,y:350},r:5}]);
  assert.equal(inertia.duration,0);assert.deepEqual(inertiaOffset(inertia),{x:0,y:0,settled:true});
  assert.deepEqual(detachedCenter([{geometry:{kind:'head',x:100,y:200,r:5}}]),{x:100,y:200});
  dom.window.close();
});

test('confirmed hits brighten only the attacker light by 50 percent and fade over 0.2 seconds without stacking',()=>{
  const dom=setup(),victim=ctx.robots[0],attacker=ctx.robots[1];paint();
  const base=Number(attacker.nearLight.getAttribute('opacity')),victimBase=victim.nearLight.getAttribute('opacity');
  const radius=attacker.nearLight.getAttribute('r');
  assert.equal(victim.damage('head',attacker.id),true);paint();
  assert.equal(Number(attacker.nearLight.getAttribute('opacity')),base*1.5);
  assert.equal(Number(document.querySelectorAll('.neon-pool')[attacker.id].getAttribute('opacity')),base*1.5);
  assert.equal(victim.nearLight.getAttribute('opacity'),victimBase);
  ctx.game.time+=.1;paint();assert.equal(Number(attacker.nearLight.getAttribute('opacity')),base*1.25);
  assert.equal(victim.damage('head',attacker.id),false,'invulnerable repeat is not a new hit');paint();
  assert.equal(Number(attacker.nearLight.getAttribute('opacity')),base*1.25);
  assert.equal(victim.damage('arm-1-upper',attacker.id),true);paint();
  assert.equal(Number(attacker.nearLight.getAttribute('opacity')),base*1.5,'another hit restarts the flash without accumulating it');
  ctx.game.time+=.2;paint();assert.equal(Number(attacker.nearLight.getAttribute('opacity')),base);
  assert.equal(attacker.nearLight.getAttribute('r'),radius);
  assert.equal(victim.damage('leg-1-upper',victim.id),true);paint();
  assert.equal(victim.nearLight.getAttribute('opacity'),victimBase,'self damage never triggers a successful-strike cue');
  assert.equal(ctx.svg.querySelector('#gladiator-swings'),null);
  assert.equal(ctx.svg.querySelector('[stroke="#ffe66d"]'),null,'orange strike helpers are never created');
  dom.window.close();
});

test('powerful contact removes two HP once, expires Crit in .2 seconds and loses the hat exactly on head severing',()=>{
 const dom=setup({textures:Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:true}]))});
 const r=ctx.robots[0];ctx.betting.garage[0].head={hat:1,price:10,player:0};ctx.betting.players[0].balance-=10;ctx.betting.shopSpent=10;
 paint();assert.ok(r.actor.querySelector('svg[viewBox="0 0 64 64"]'));
 const hp=r.hp.get('head');assert.equal(r.damage('head',1,2),true);assert.equal(r.hp.get('head'),hp-2);
 assert.equal(r.damage('head',1,2),false);assert.equal(ctx.hitEffects.group.querySelectorAll('.crit-label').length,1);
 ctx.game.time+=.19;paint();assert.equal(ctx.hitEffects.group.querySelectorAll('.crit-label').length,1);
 ctx.game.time+=.02;paint();assert.equal(ctx.hitEffects.group.querySelectorAll('.crit-label').length,0);
 for(let i=0;i<4;i++)hit(r,'head');paint();
 assert.equal(ctx.betting.garage[0].head,null);
 assert.equal(ctx.combat.detached.find(d=>d.cause==='head').pieces.find(p=>p.key==='head').skin.hat,1);
 assert.ok(ctx.detachedG.querySelector('svg[viewBox="0 0 64 64"]'));
 dom.window.close();
});

test('footstep events follow individual leg landings, never planted feet or hand contacts',()=>{
 const dom=setup(),robot=ctx.robots[0],events=[],unsubscribe=onGameEvent(e=>{if(e.type==='footstep')events.push(e);});
 try{
   const leg=robot.limbs.find(l=>l.kind==='leg'),hand=robot.limbs.find(l=>l.kind==='arm');
   robot.paint(false);events.length=0;
   leg.phase=0;robot.paint(false);assert.equal(events.length,0,'a raised foot is silent');
   leg.phase=1;robot.paint(false);assert.equal(events.length,1);assert.equal(events[0].robot,robot.id);
   robot.paint(false);assert.equal(events.length,1,'standing still does not repeat the contact');
   hand.phase=0;robot.paint(false);hand.phase=1;robot.paint(false);assert.equal(events.length,1,'hands do not trigger a footstep');
   leg.phase=0;robot.paint(false);leg.phase=1;robot.paint(false);assert.equal(events.length,2,'a new contact at the same point still makes a sound');
 }finally{unsubscribe();ctx.root.__disposeTag();dom.window.close();}
});
