import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ARENAS,arenaDiagram,arenaPicker,randomArenaId} from '../src/game/arenas.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {chooseSpawnLayout,containsPoint} from '../src/game/arena.js';
import {coreClearCircle,rectHit,sightClear} from '../src/systems/collision.js';
import {planPath} from '../src/systems/navigation.js';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {startSpawnSequence,advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {CONFIG} from '../src/config.js';
import {wallRibbon} from '../src/render/wall-geometry.js';
function setup(arenaId='annulus'){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://annulus.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;const session=betNewSession(['Первый'],100);session.arenaId=arenaId;initializeGame({arenaId,session,entry:'betting'});return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
test('annulus has sixteen sides across 6 metres and one smooth central obstacle across 2 metres',()=>{
 const arena=ARENAS.annulus;assert.equal(arena.points.length,16);assert.equal(arena.size,600);assert.equal(arena.obstacles.length,1);
 for(const p of arena.points)assert.ok(Math.abs(Math.hypot(p.x-350,p.y-350)-300)<1e-8);
 for(const p of arena.obstacles[0].points)assert.ok(Math.abs(Math.hypot(p.x-350,p.y-350)-100)<1e-8);
 for(const points of [arena.points,arena.obstacles[0].points]){const ribbon=wallRibbon(points,30);assert.ok(ribbon.faces.every(f=>f.world.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));}
});
test('picker, normalized preview and random tower selection include annulus',()=>{
 assert.match(arenaPicker('annulus'),/data-arena="annulus" aria-pressed="true"/);
 const dom=new JSDOM(arenaDiagram(ARENAS.annulus)),polygon=dom.window.document.querySelector('.arena-obstacle');
 const points=polygon.getAttribute('points').split(' ').map(p=>p.split(',').map(Number));assert.ok(Math.abs(Math.min(...points.map(p=>p[0]))-100/3)<1e-8);assert.ok(Math.abs(Math.max(...points.map(p=>p[0]))-200/3)<1e-8);dom.window.close();
 assert.deepEqual([0,.34,.67,.999].map(randomArenaId),['ward','ring','annulus','annulus']);
});
test('annulus initializes all sixteen collision edges and safe patient spawn points, survives saving',()=>{
 const dom=setup();assert.equal(ctx.arenaBoundary.points.length,16);assert.equal(ctx.arenaPlanes.length,16);assert.equal(ctx.obstacles.length,1);
 for(let i=0;i<5;i++)for(const p of chooseSpawnLayout())assert.ok(coreClearCircle(p,CONFIG.startup.spawnMarginCm));
 assert.equal(coreClearCircle({x:350,y:350},1),false);assert.equal(coreClearCircle({x:350,y:140},30),true);assert.equal(coreClearCircle({x:40,y:350},1),false);
 bettingSave();assert.equal(bettingLoad().arenaId,'annulus');assert.match(document.querySelector('.arena-picker').textContent,/Кольцо/);close(dom);
});
test('navigation routes around the centre with safe clearance and the obstacle blocks vision and strikes',()=>{
 const dom=setup(),start={x:130,y:350},finish={x:570,y:350};
 assert.equal(sightClear(start,finish),false);assert.notEqual(rectHit(start,finish),null);
 for(const pad of [35,70]){
  const path=planPath(start,finish,pad);assert.ok(path.length>1);assert.deepEqual(path.at(-1),finish);
  let previous=start;for(const point of path){assert.ok(coreClearCircle(point,pad));assert.equal(rectHit(previous,point,ctx.obstacles[0],pad),null);assert.equal(containsPoint(ctx.obstacles[0],point),false);previous=point;}
 }
 close(dom);
});
test('annulus combat runs with finite poses and keeps every living patient out of the central obstacle',()=>{
 const dom=setup();startSpawnSequence();advanceStartup(10);const starts=ctx.robots.map(r=>({x:r.x,y:r.y}));
 for(let i=0;i<180;i++)step(1/60);
 assert.ok(ctx.robots.some((r,i)=>Math.hypot(r.x-starts[i].x,r.y-starts[i].y)>5));
 for(const r of ctx.robots){assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y)&&Number.isFinite(r.angle));if(r.mobile)assert.equal(containsPoint(ctx.obstacles[0],r.center),false);}
 close(dom);
});
test('switching from the ward to annulus preserves stakes and rebuilds its boundary before the fight',async()=>{
 const dom=setup('ward'),s=ctx.betting;document.querySelector('[data-bet-player="0"] input').value='25';
 ctx.switchArena=async id=>{s.arenaId=id;initializeGame({session:s,arenaId:id,entry:'betting'});};
 try{
  document.querySelector('[data-arena="annulus"]').click();const button=document.querySelector('#bet-fight');await button.onclick({preventDefault(){},currentTarget:button});
  assert.equal(ctx.arenaId,'annulus');assert.equal(ctx.arenaBoundary.points.length,16);assert.equal(ctx.startup.phase,'spawning');assert.equal(s.bets[0].amount,25);assert.equal(s.players[0].balance,75);
 }finally{ctx.switchArena=null;close(dom);}
});
