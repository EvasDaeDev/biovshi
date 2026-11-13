import test from 'node:test';
import assert from 'node:assert/strict';
import {createStreamerMotion,MAX_ARM_ANGLE} from '../src/ui/streamer-motion.js';

const deg=angle=>angle*180/Math.PI;
test('busy fight swings both arms up and down, never beyond 25 degrees',()=>{
 const motion=createStreamerMotion();const angles=[[],[]];let pose;
 for(let i=0;i<1200;i++){
  motion.offer({type:'hit',damage:2});pose=motion.tick(1/60);
  assert.ok(Math.abs(pose.left)<=MAX_ARM_ANGLE+1e-9);
  assert.ok(Math.abs(pose.right)<=MAX_ARM_ANGLE+1e-9);
  if(i>120){angles[0].push(deg(pose.left));angles[1].push(deg(pose.right));}
 }
 for(const values of angles){assert.ok(Math.min(...values)<-23);assert.ok(Math.max(...values)>23);}
});

test('frequent hits raise expression, inactivity eases back to lowered idle arms',()=>{
 const calm=createStreamerMotion(),sparse=createStreamerMotion(),busy=createStreamerMotion();let low,high,idle;
 for(let i=0;i<360;i++){
  if(i%60===0)sparse.offer({type:'hit',damage:1});
  if(i%10===0)busy.offer({type:'hit',damage:1});
  low=sparse.tick(1/60);high=busy.tick(1/60);idle=calm.tick(1/60);
 }
 assert.ok(high.intensity>low.intensity+.3);
 for(let i=0;i<1200;i++)idle=busy.tick(1/60);
 assert.ok(idle.intensity<.001);
 assert.ok(deg(idle.left)<-8&&deg(idle.left)>-16);
 assert.ok(deg(idle.right)>8&&deg(idle.right)<16);
 busy.reset();assert.equal(busy.tick(0).intensity,0);
});
