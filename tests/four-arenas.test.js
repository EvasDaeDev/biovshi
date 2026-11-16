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
import {betNewSession} from '../src/betting/ledger.js';
import {newTower} from '../src/tower/model.js';
import {CONFIG} from '../src/config.js';
const layouts={sluice:[600,1],zigzag:[750,2],columns:[900,4],throat:[1000,2]};
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
