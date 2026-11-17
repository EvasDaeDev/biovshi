import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ARENAS,arenaDiagram,arenaPicker} from '../src/game/arenas.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {chooseSpawnLayout,containsPoint} from '../src/game/arena.js';
import {coreClearCircle} from '../src/systems/collision.js';
import {wallRibbon} from '../src/render/wall-geometry.js';
import {cameraReset,cameraApply} from '../src/render/camera.js';
import {betNewSession} from '../src/betting/ledger.js';
import {newTower} from '../src/tower/model.js';
import {CONFIG} from '../src/config.js';
const layouts={sluice:[600,2],zigzag:[750,2],columns:[900,4],throat:[800,2]};
function clockwiseConvex(ps){
 let sign=0;
 for(let i=0;i<ps.length;i++){
  const a=ps[i],b=ps[(i+1)%ps.length],c=ps[(i+2)%ps.length];
  const cross=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x);
  if(Math.abs(cross)<1e-8)continue;
  if(sign&&Math.sign(cross)!==sign)return false;
  sign=Math.sign(cross);
 }
 return sign===1;
}
function setup(id,tower=null){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),
   {url:'https://arena-layouts.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;
 // Tower UI reads the current player from the shared betting session.
 ctx.towerPlayer=0;
 const session=betNewSession(['Первый'],100);
 if(tower){session.towers={0:tower};session.towerPlayerId=0;}
 initializeGame({session,entry:tower?'tower':'betting',tower,arenaId:id});
 return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
test('four layouts use convex world geometry and render finite wall ribbons',()=>{
 for(const [id,[size,count]] of Object.entries(layouts)){
  const a=ARENAS[id];
  assert.equal(a.size,size,id);assert.equal(a.obstacles.length,count,id);
  assert.ok(clockwiseConvex(a.points),id+' boundary');
  for(const polygon of [a.points,...a.obstacles.map(b=>b.points)]){
   assert.ok(clockwiseConvex(polygon),id+' obstacle');
   assert.ok(wallRibbon(polygon,30).faces.every(f=>f.world.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y))));
  }
  assert.match(arenaPicker(id),new RegExp('data-arena="'+id+'" aria-pressed="true"'));
  assert.match(arenaDiagram(a),/arena-obstacle/);
 }
});
test('throat obstacle outer tips are chamfered into strictly obtuse convex corners',()=>{
 const [left,right]=ARENAS.throat.obstacles;
 assert.equal(left.points.length,6);
 assert.equal(right.points.length,6);
 for(const obstacle of [left,right]){
  const ps=obstacle.points;
  assert.ok(clockwiseConvex(ps),'obstacle remains convex');
  for(let i=0;i<ps.length;i++){
   const vertex=ps[i],previous=ps[(i+ps.length-1)%ps.length],next=ps[(i+1)%ps.length];
   const dot=(previous.x-vertex.x)*(next.x-vertex.x)+(previous.y-vertex.y)*(next.y-vertex.y);
   assert.ok(dot<0,'all obstacle inner corners must be obtuse: '+i);
  }
 }
 // The opposed vertical faces stay at 3.08m and 4.92m.
 const centralClearance=right.left-left.right;
 assert.ok(Math.abs(centralClearance-184)<1e-7);
});
test('sluice columns are 150cm long with an unobstructed 150cm centre gap',()=>{
 const [first,second]=ARENAS.sluice.obstacles;
  // The first centreline endpoint pair uses p[0]/p[3] and p[1]/p[2].
 for(const column of [first,second]){
  const p=column.points;
  const a={x:(p[0].x+p[3].x)/2,y:(p[0].y+p[3].y)/2};
  const b={x:(p[1].x+p[2].x)/2,y:(p[1].y+p[2].y)/2};
  assert.ok(Math.abs(Math.hypot(a.x-b.x,a.y-b.y)-150)<1e-7);
 }
 const a=first.points,b=second.points;
 const end={x:(a[1].x+a[2].x)/2,y:(a[1].y+a[2].y)/2};
 const start={x:(b[0].x+b[3].x)/2,y:(b[0].y+b[3].y)/2};
 assert.ok(Math.abs(Math.hypot(end.x-start.x,end.y-start.y)-150)<1e-7);
});
test('all four arenas initialize a bounded floor, masks and four safe betting spawns',()=>{
 for(const id of Object.keys(layouts)){
  const dom=setup(id);try{
   const a=ARENAS[id],floor=ctx.arenaContent.querySelector(':scope > rect');
   const mask=ctx.svg.querySelector('#tag7hop-darkness-mask');
   for(const node of [floor,mask,ctx.darkness]){
    assert.equal(Number(node.getAttribute('x')),a.left,id);
    assert.equal(Number(node.getAttribute('y')),a.top,id);
    assert.equal(Number(node.getAttribute('width')),a.size,id);
   }
   assert.equal(ctx.robots.length,4,id);
   const full=(a.size+2*ctx.CAMERA_OUTSET)*CONFIG.arena.cameraMaxDistanceFactor;
   assert.ok(Math.abs(ctx.CAMERA_FULL-full)<1e-7,id+' maximum zoom out');
   assert.ok(Math.abs(ctx.camera.size-full)<1e-7,id+' starting zoom');
   assert.ok(Math.abs(ctx.camera.x-(a.left+(a.size-full)/2))<1e-7,id+' horizontal centering');
   assert.ok(Math.abs(ctx.camera.y-(a.top+(a.size-full)/2))<1e-7,id+' vertical centering');
   ctx.camera.size=full+100;cameraApply();
   assert.equal(Number(ctx.svg.getAttribute('viewBox').split(' ')[2]),Number(full.toFixed(3)));
   cameraReset();
   assert.ok(chooseSpawnLayout().every(p=>coreClearCircle(p,CONFIG.startup.spawnMarginCm)),id);
   for(const r of ctx.robots){
    assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y),id);
    assert.ok(coreClearCircle(r,CONFIG.startup.spawnMarginCm),id);
   }
  }finally{close(dom);}
 }
});
test('all four arenas support ten tower fighters without invalid spawns',()=>{
 for(const id of Object.keys(layouts)){
  const tower=newTower(0);tower.legacyEnemyCount=9;
  const dom=setup(id,tower);try{
   assert.equal(ctx.ROBOT_COUNT,10,id);assert.equal(ctx.robots.length,10,id);
   const starts=chooseSpawnLayout();
   assert.equal(starts.length,10,id);
   for(const p of starts)assert.ok(coreClearCircle(p,CONFIG.startup.spawnMarginCm),id);
   for(const p of ctx.patrolPoints){
    assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
    assert.ok(!ctx.obstacles.some(b=>containsPoint(b,p)),id+' patrol point');
   }
  }finally{close(dom);}
 }
});
