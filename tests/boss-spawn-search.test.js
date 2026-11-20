import test from 'node:test';
import assert from 'node:assert/strict';
import {findBossSpawn,planNeutralRigSpawns} from '../src/boss/spawn.js';
import {ctx} from '../src/game/state.js';
import {standardLimbs} from '../src/robot/body.js';
import {bossAnatomy} from '../src/boss/anatomy.js';
import {BOSS_CONFIG} from '../src/boss/config.js';

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

test('encounter planner gives an extended boss first choice of a contested spawn',()=>{
 const previous={boundary:ctx.arenaBoundary,planes:ctx.arenaPlanes,obstacles:ctx.obstacles};
 try{
  ctx.arenaBoundary={left:0,right:700,top:0,bottom:700};
  ctx.arenaPlanes=[
   {nx:-1,ny:0,c:0,length:1},{nx:0,ny:-1,c:0,length:1},
   {nx:1,ny:0,c:700,length:1},{nx:0,ny:1,c:700,length:1}
  ];
  ctx.obstacles=[];
  const normal={spineSegments:4,pelvisKey:'spine-3',limbs:standardLimbs()};
  const layout=[
   {x:350,y:350,angle:0},
   {x:350,y:350,angle:0},
   {x:520,y:520,angle:0}
  ];
  const rigs=[
   {body:normal,scaleMultiplier:1},
   {body:bossAnatomy('long_arms'),scaleMultiplier:BOSS_CONFIG.scale},
   {body:normal,scaleMultiplier:1}
  ];
  const placed=planNeutralRigSpawns(layout,rigs);
  assert.ok(placed&&placed.length===3);
  assert.deepEqual(placed[1],layout[1],'the largest rig keeps the safe original position');
  assert.notDeepEqual(placed[0],layout[0],'the player moves away instead of blocking the boss');
  assert.deepEqual(planNeutralRigSpawns(layout,rigs),placed,'placement must not reroll on reload');
 }finally{
  ctx.arenaBoundary=previous.boundary;
  ctx.arenaPlanes=previous.planes;
  ctx.obstacles=previous.obstacles;
 }
});

test('encounter planner fails explicitly rather than accepting overlapping bodies',()=>{
 const previous={boundary:ctx.arenaBoundary,planes:ctx.arenaPlanes,obstacles:ctx.obstacles};
 try{
  ctx.arenaBoundary={left:0,right:30,top:0,bottom:30};
  ctx.arenaPlanes=[
   {nx:-1,ny:0,c:0,length:1},{nx:0,ny:-1,c:0,length:1},
   {nx:1,ny:0,c:30,length:1},{nx:0,ny:1,c:30,length:1}
  ];
  ctx.obstacles=[];
  const normal={spineSegments:4,pelvisKey:'spine-3',limbs:standardLimbs()};
  const starts=[{x:15,y:15,angle:0},{x:15,y:15,angle:0}];
  assert.equal(planNeutralRigSpawns(starts,[{body:normal,scaleMultiplier:1},{body:normal,scaleMultiplier:1}]),null);
 }finally{
  ctx.arenaBoundary=previous.boundary;
  ctx.arenaPlanes=previous.planes;
  ctx.obstacles=previous.obstacles;
 }
});
