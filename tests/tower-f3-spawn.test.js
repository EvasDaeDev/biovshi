import test from 'node:test';
import assert from 'node:assert/strict';
import {planNeutralRigSpawns} from '../src/boss/spawn.js';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';
import {bossAnatomy} from '../src/boss/anatomy.js';
import {BOSS_CONFIG} from '../src/boss/config.js';
import {standardLimbs} from '../src/robot/body.js';
import {ctx} from '../src/game/state.js';
const normal={spineSegments:4,pelvisKey:'spine-3',limbs:standardLimbs()};
test('donor surgery and a long boss are jointly validated at spawn',()=>{
 const previous={boundary:ctx.arenaBoundary,planes:ctx.arenaPlanes,obstacles:ctx.obstacles};
 try{
  ctx.arenaBoundary={left:0,right:700,top:0,bottom:700};
  ctx.arenaPlanes=[{nx:-1,ny:0,c:0,length:1},{nx:0,ny:-1,c:0,length:1},
   {nx:1,ny:0,c:700,length:1},{nx:0,ny:1,c:700,length:1}];
  ctx.obstacles=[];
  const body=towerPatientAnatomy({surgeries:[
   {procedure:'transplant_arm',site:'arm-1-upper',donorId:'5:1:arm',donorProfile:'boss'},
   {procedure:'graft_leg',site:'leg--1-upper'},
   {procedure:'extend_spine',site:'spine-1'}]});
  const starts=[{x:180,y:200,angle:0},{x:360,y:320,angle:0},{x:530,y:520,angle:0}];
  const rigs=[{body,scaleMultiplier:1},
   {body:bossAnatomy('long_legs'),scaleMultiplier:BOSS_CONFIG.scale},
   {body:normal,scaleMultiplier:1}];
  const result=planNeutralRigSpawns(starts,rigs);
  assert.equal(result?.length,3);
  assert.deepEqual(planNeutralRigSpawns(starts,rigs),result);
 }finally{
  ctx.arenaBoundary=previous.boundary;ctx.arenaPlanes=previous.planes;ctx.obstacles=previous.obstacles;
 }
});
