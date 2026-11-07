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
