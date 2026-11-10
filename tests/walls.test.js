import test from 'node:test';
import assert from 'node:assert/strict';
import { wallRibbon, triangleMatrix } from '../src/render/wall-geometry.js';
import { cameraBounds } from '../src/render/camera.js';
import { CONFIG } from '../src/config.js';
import { obstacleVertices } from '../src/game/arena.js';
import { ASSETS } from '../src/assets/manifest.js';
import { createWalls } from '../src/render/walls.js';
import { ctx } from '../src/game/state.js';
import { JSDOM } from 'jsdom';
const inner=[{x:25,y:0},{x:675,y:0},{x:700,y:25},{x:700,y:675},{x:675,y:700},{x:25,y:700},{x:0,y:675},{x:0,y:25}];
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('wall is offset 30 cm outwards and keeps the exact playable boundary',()=>{
  const original=structuredClone(inner);
  const ribbon=wallRibbon(inner,30);
  assert.deepEqual(inner,original);
  for(const face of ribbon.faces){
    const [a,b,B,A]=face.world,n=face.normal;
    close((A.x-a.x)*n.x+(A.y-a.y)*n.y,30);
    close((B.x-b.x)*n.x+(B.y-b.y)*n.y,30);
    assert.deepEqual(face.uv.slice(0,2).map(p=>p.y),[30,30]);
    assert.deepEqual(face.uv.slice(2).map(p=>p.y),[0,0]);
    close(face.uv[1].x-face.uv[0].x,Math.hypot(b.x-a.x,b.y-a.y));
  }
  close(Math.min(...ribbon.outer.map(p=>p.x)),-30);
  close(Math.max(...ribbon.outer.map(p=>p.x)),730);
});

test('adjacent wall faces share the full corner edge and continuous texture coordinates',()=>{
  const {faces}=wallRibbon(inner,30);
  for(let i=0;i<faces.length-1;i++){
    assert.deepEqual(faces[i].world[1],faces[i+1].world[0]);
    assert.deepEqual(faces[i].world[2],faces[i+1].world[3]);
    assert.deepEqual(faces[i].uv[1],faces[i+1].uv[0]);
    assert.deepEqual(faces[i].uv[2],faces[i+1].uv[3]);
  }
  assert.deepEqual(faces.at(-1).world[2],faces[0].world[3]);
});

test('both triangles map the lower image edge to the floor and meet without geometric gaps',()=>{
  for(const face of wallRibbon(inner,30).faces)for(const ids of [[0,1,2],[0,2,3]]){
    const uv=ids.map(i=>face.uv[i]),world=ids.map(i=>face.world[i]);
    const [a,b,c,d,e,f]=triangleMatrix(uv,world);
    uv.forEach((p,i)=>{close(a*p.x+c*p.y+e,world[i].x);close(b*p.x+d*p.y+f,world[i].y);});
  }
});

test('full camera includes the exterior wall with an 8 cm margin; zoom retains exterior bounds',()=>{
  assert.deepEqual(cameraBounds(776,38),{min:-38,max:-38});
  assert.deepEqual(cameraBounds(400,38),{min:-38,max:338});
  const bounds=cameraBounds(776,38);
  assert.ok(bounds.min<-30&&bounds.min+776>730);
});

test('obstacle ribbons stay inside every obstacle, including triangles narrower than 30 cm',()=>{
  for (const obstacle of CONFIG.arena.obstacles) {
    const points=obstacleVertices(obstacle),original=structuredClone(points);
    for (const boundary of [points,[...points].reverse()]) {
      const ribbon=wallRibbon(boundary,30,{inward:true});
      const sign=Math.sign(boundary.reduce((sum,p,i)=>{
        const q=boundary[(i+1)%boundary.length];return sum+p.x*q.y-q.x*p.y;
      },0));
      for (const p of ribbon.outer) for (let i=0;i<boundary.length;i++) {
        const a=boundary[i],b=boundary[(i+1)%boundary.length];
        assert.ok(sign*((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))>=-1e-8);
      }
      for (const face of ribbon.faces) {
        const [a,b,B,A]=face.world;
        assert.ok((B.x-A.x)*(b.x-a.x)+(B.y-A.y)*(b.y-a.y)>0,'inset edge must not reverse');
        assert.deepEqual(face.uv.slice(0,2).map(p=>p.y),[30,30]);
        assert.ok(face.uv[2].y>=0&&face.uv[2].y<30);
        for(const ids of [[0,1,2],[0,2,3]]) {
          const uv=ids.map(i=>face.uv[i]),world=ids.map(i=>face.world[i]);
          const [a,b,c,d,e,f]=triangleMatrix(uv,world);
          uv.forEach((p,i)=>{close(a*p.x+c*p.y+e,world[i].x);close(b*p.x+d*p.y+f,world[i].y);});
        }
      }
    }
    assert.deepEqual(points,original);
  }
});

test('outer bricks tile continuously along every segment and stay outside both arena walls',()=>{
  assert.equal(ASSETS.textures.arenaOuterWall,'assets/textures/arena/wall_outer.png');
  const original=structuredClone(inner);
  for(const points of [
    inner,
    [{x:150,y:267.1572875},{x:267.1572875,y:150},{x:432.8427125,y:150},
      {x:550,y:267.1572875},{x:550,y:432.8427125},
      {x:432.8427125,y:550},{x:267.1572875,y:550},{x:150,y:432.8427125}]
  ]){
    const existing=wallRibbon(points,CONFIG.arena.wallThicknessCm);
    const exterior=wallRibbon(existing.outer,CONFIG.arena.outerWallDepthCm);
    assert.deepEqual(exterior.inner,existing.outer);
    assert.deepEqual(exterior.faces[0].world[0],existing.outer[0]);
    for(let i=0;i<exterior.faces.length;i++){
      const face=exterior.faces[i],next=exterior.faces[(i+1)%exterior.faces.length];
      assert.deepEqual(face.world[2],next.world[3], 'masonry faces share outer corner');
      assert.deepEqual(face.world[1],next.world[0], 'masonry faces share inner corner');
      if(i<exterior.faces.length-1)close(face.uv[1].x,next.uv[0].x);
      close(face.uv[1].x-face.uv[0].x,face.length);
      assert.deepEqual(face.uv.map(p=>p.y),[90,90,0,0]);
    }
    const outset=CONFIG.arena.wallThicknessCm+CONFIG.arena.outerWallDepthCm+CONFIG.arena.wallViewMarginCm;
    close(Math.min(...exterior.outer.map(p=>p.x)),Math.min(...points.map(p=>p.x))-120);
    close(Math.max(...exterior.outer.map(p=>p.x)),Math.max(...points.map(p=>p.x))+120);
    assert.ok(outset>120,'camera includes all exterior bricks');
  }
  assert.deepEqual(inner,original);
});

test('outer masonry renders behind the original wall, survives refresh, without clipping or tint',()=>{
 const dom=new JSDOM('<!doctype html><svg xmlns="http://www.w3.org/2000/svg"><defs></defs><g id="arena-content"></g><g id="block"></g></svg>');
 const old={document:globalThis.document,NS:ctx.NS,svg:ctx.svg,defs:ctx.defs,
   arenaContent:ctx.arenaContent,blockG:ctx.blockG,arenaBoundary:ctx.arenaBoundary,
   obstacles:ctx.obstacles,textureAssets:ctx.textureAssets,cache:ctx.cache};
 try{
   globalThis.document=dom.window.document;
   ctx.NS='http://www.w3.org/2000/svg';
   ctx.svg=dom.window.document.querySelector('svg');
   ctx.defs=ctx.svg.querySelector('defs');
   ctx.arenaContent=ctx.svg.querySelector('#arena-content');
   ctx.blockG=ctx.svg.querySelector('#block');
   ctx.arenaBoundary={points:inner};
   ctx.obstacles=[];
   ctx.cache=new WeakMap();
   ctx.textureAssets={arenaOuterWall:{loaded:true},arenaWall:{loaded:true}};
   createWalls();
   const exterior=ctx.svg.querySelector('#tag7hop-walls-outer');
   const existing=ctx.svg.querySelector('#tag7hop-walls');
   const pattern=ctx.svg.querySelector('#texture-arenaOuterWall');
   assert.ok(exterior&&existing&&pattern);
   assert.equal(exterior.nextElementSibling,existing,'outer bricks are behind the existing walls');
   assert.equal(existing.nextElementSibling,ctx.arenaContent,'walls remain outside floor clip');
   assert.equal(pattern.querySelector('image').getAttribute('opacity'),'1');
   assert.equal(pattern.querySelector('image').getAttribute('href').includes('wall_outer.png'),true);
   assert.equal(exterior.querySelectorAll('path').length,16,'two textured triangles per arena side');
   createWalls();
   assert.equal(ctx.svg.querySelectorAll('#tag7hop-walls-outer').length,1);
   assert.equal(ctx.svg.querySelectorAll('#texture-arenaOuterWall').length,1);
   ctx.textureAssets.arenaOuterWall.loaded=false;
   createWalls();
   assert.equal(ctx.svg.querySelector('#tag7hop-walls-outer'),null,
     'if texture is unavailable, the existing wall still renders normally');
   assert.ok(ctx.svg.querySelector('#tag7hop-walls'));
 }finally{
   for(const [key,value] of Object.entries(old))
     if(key!=='document')ctx[key]=value;
   globalThis.document=old.document;dom.window.close();
 }
});
