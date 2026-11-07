import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { initializeGame } from '../src/game/initialize.js';
import { ctx } from '../src/game/state.js';
import { advanceStartup, resetRound } from '../src/game/session.js';
import { step } from '../src/game/loop.js';
import { paint } from '../src/render/frame.js';
import { CONFIG } from '../src/config.js';
import { onGameEvent } from '../src/game/event-bus.js';
import { paintFloorWarp } from '../src/render/floor-warp.js';
import { chooseRenderProfile } from '../src/render/performance.js';

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

test('lighting masks reuse stationary geometry and the identity filter stays local to the robot', () => {
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
  assert.equal(filter.getAttribute('filterUnits'),'objectBoundingBox');
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

test('warm lighting, dark footprints and inward textured obstacle walls survive reinitialization',()=>{
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
    assert.ok([...ctx.ambientGlowG.children].every(n=>n.getAttribute('stroke')==='#ffd29a'));
    assert.ok([...ctx.trailsG.children].every(n=>n.getAttribute('fill')==='var(--night-trail)'));
    assert.ok([...ctx.trailsG.children].every(n=>Number(n.getAttribute('r'))===1.95));
    assert.equal(ctx.OIL_HUES[0],0);
    assert.equal(ctx.OIL_HUES.at(-1),35);
    assert.deepEqual(ctx.obstacles.map(b=>b.points),geometry);
  }
  dom.window.close();
});

test('impacts warp the textured floor without a grid in both graphics modes and clear on reset',()=>{
  const dom=setup();
  assert.equal(CONFIG.rendering.coordinateGrid,false);
  const floor=ctx.arenaContent.querySelector(':scope > rect');
  floor.style.fill='url(#texture-arenaFloor)';
  const boundary=structuredClone(ctx.arenaBoundary.points);
  const blocks=ctx.obstacles.map(b=>structuredClone(b.points));
  for (const mode of ['full','light']) {
    ctx.renderProfile=chooseRenderProfile(mode,false);
    ctx.pulses=[{x:350,y:350,time:ctx.game.time-.1}];
    paintFloorWarp();
    const mesh=ctx.floorWarp;
    assert.equal(mesh.group.getAttribute('fill'),floor.style.fill);
    assert.equal(mesh.group.parentNode,ctx.arenaContent);
    assert.equal(mesh.group.previousSibling,floor);
    assert.equal(floor.getAttribute('opacity'),'0');
    assert.equal(mesh.triangles.length,mode==='full'?392:98);
    assert.ok(mesh.triangles.some(t=>t.node.getAttribute('transform')!=='matrix(1 0 0 1 0 0)'));
    assert.ok(mesh.triangles.every(t=>!t.node.getAttribute('transform').includes('NaN')));
    const transforms=mesh.triangles.map(t=>t.node.getAttribute('transform'));
    ctx.game.time+=.05;
    paintFloorWarp();
    assert.ok(mesh.triangles.some((t,i)=>t.node.getAttribute('transform')!==transforms[i]));
    ctx.game.time+=CONFIG.effects.waveSec;
    paintFloorWarp();
    assert.equal(mesh.group.getAttribute('display'),'none');
    assert.equal(floor.getAttribute('opacity'),'1');
  }
  ctx.pulses=[{x:300,y:300,time:ctx.game.time}];
  paintFloorWarp();
  resetRound();
  paintFloorWarp();
  assert.equal(ctx.floorWarp.group.getAttribute('display'),'none');
  assert.deepEqual(ctx.arenaBoundary.points,boundary);
  assert.deepEqual(ctx.obstacles.map(b=>b.points),blocks);
  dom.window.close();
});

test('only A uses atlas sprites; severed limbs and head retain their skin; load failures restore vectors',()=>{
  const dom=setup();
  const a=ctx.robots[0],actor=a.actor;
  assert.equal(actor.getAttribute('data-skin'),'r_01');
  assert.equal(actor.querySelectorAll('[data-skin-segment]').length,13);
  for(const other of ctx.robots.slice(1))assert.equal(other.actor.querySelectorAll('image').length,0);
  const image=actor.querySelector('image');
  image.dispatchEvent(new Event('load'));
  assert.equal(actor.getAttribute('data-skin-ready'),'true');
  assert.equal(actor.querySelector('ellipse.head').style.visibility,'hidden');
  paint();
  assert.ok([...actor.querySelectorAll('[data-skin-segment]')].every(n=>n.getAttribute('transform')&&!n.getAttribute('transform').includes('NaN')));
  const chest=actor.querySelector('[data-skin-segment="spine-0"]');
  const chestMatrix=chest.getAttribute('transform');
  for(let i=0;i<3;i++)hit(a,'arm--1-upper');
  paint();
  assert.equal(actor.querySelector('[data-skin-segment="arm--1-upper"]').getAttribute('display'),'none');
  assert.equal(actor.querySelector('[data-skin-segment="arm--1-lower"]').getAttribute('display'),'none');
  assert.equal(chest.getAttribute('transform'),chestMatrix);
  assert.equal(ctx.detachedG.querySelectorAll('[data-skin-segment]').length,2);
  const severed=ctx.detachedG.querySelector('[data-skin-segment="arm--1-upper"]');
  const frozen=severed.getAttribute('transform');
  for(let i=0;i<30;i++)step(1/60);
  paint();
  assert.equal(severed.getAttribute('transform'),frozen);
  for(let i=0;i<5;i++)hit(a,'head');
  paint();
  assert.equal(actor.querySelector('[data-skin-segment="head"]').getAttribute('display'),'none');
  assert.ok(ctx.detachedG.querySelector('[data-skin-segment="head"]'));
  ctx.combat.finished=true;ctx.combat.winner=0;ctx.combat.finishedAt=ctx.game.time;
  paint();
  const layer=actor.querySelector('[data-skin-layer="body"]');
  assert.equal(layer.getAttribute('filter'),'url(#tag7hop-skin-victory-0)');
  const slopes=[...ctx.defs.querySelectorAll('#tag7hop-skin-victory-0 feComponentTransfer > *')].map(n=>n.getAttribute('slope'));
  ctx.game.time+=.3;
  paint();
  assert.notDeepEqual([...ctx.defs.querySelectorAll('#tag7hop-skin-victory-0 feComponentTransfer > *')].map(n=>n.getAttribute('slope')),slopes);
  image.dispatchEvent(new Event('error'));
  assert.equal(actor.getAttribute('data-skin-ready'),'false');
  assert.equal(actor.querySelector('ellipse.head').style.visibility,'');
  assert.ok([...actor.querySelectorAll('[data-skin-layer]')].every(n=>n.getAttribute('display')==='none'));
  resetRound();
  assert.equal(ctx.robots[0].actor.querySelectorAll('[data-skin-segment]').length,13);
  assert.equal(ctx.defs.querySelectorAll('#tag7hop-skin-victory-0').length,1);
  assert.equal(ctx.detachedG.children.length,0);
  dom.window.close();
});
