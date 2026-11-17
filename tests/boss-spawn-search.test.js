import test from 'node:test';
import assert from 'node:assert/strict';
import {findBossSpawn} from '../src/boss/spawn.js';

// Pure search tests: actual neutral-rig collision checks are covered in boss.test.js.
test('boss spawn search keeps a collision-free starting point unchanged',()=>{
 const start={x:320,y:340,angle:.6};
 const boundary={left:0,right:700,top:0,bottom:700};
 assert.equal(findBossSpawn(start,boundary,p=>p===start),start);
});

test('long boss can spawn beyond the old 160 cm search radius',()=>{
 const start={x:40,y:40,angle:0};
 const boundary={left:0,right:900,top:0,bottom:900};
 const found=findBossSpawn(start,boundary,p=>p.x>=700&&p.y>=700);
 assert.ok(found,'global arena scan should find a distant free region');
 assert.ok(Math.hypot(found.x-start.x,found.y-start.y)>160);
 assert.ok(found.x>=700&&found.y>=700);
 assert.ok(found.x<=boundary.right&&found.y<=boundary.bottom);
});

test('boss spawn considers alternative headings before discarding a usable spot',()=>{
 const start={x:80,y:80,angle:0};
 const boundary={left:0,right:700,top:0,bottom:700};
 const expectedX=96,expectedY=80;
 const heading=Math.atan2(350-expectedY,350-expectedX);
 const found=findBossSpawn(start,boundary,p=>
  Math.abs(p.x-expectedX)<.01
  &&Math.abs(p.y-expectedY)<.01
  &&Math.abs(p.angle-heading-Math.PI/2)<.001);
 assert.ok(found,'rotate the neutral rig when its original heading hits a wall');
 assert.ok(Math.abs(found.angle-heading-Math.PI/2)<.001);
});

test('boss spawn does not invent a position when all full-rig checks fail',()=>{
 const boundary={left:0,right:250,top:0,bottom:250};
 assert.equal(findBossSpawn({x:60,y:60,angle:0},boundary,()=>false),null);
});
