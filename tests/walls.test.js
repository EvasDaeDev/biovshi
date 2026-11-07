import test from 'node:test';
import assert from 'node:assert/strict';
import { wallRibbon, triangleMatrix } from '../src/render/wall-geometry.js';
import { cameraBounds } from '../src/render/camera.js';
import { CONFIG } from '../src/config.js';
import { obstacleVertices } from '../src/game/arena.js';
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
