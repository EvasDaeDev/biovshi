import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {createRobot} from '../src/robot/robot.js';
import {PORTRAIT_BONES} from '../src/ui/patient-portrait.js';
import {bossAnatomy} from '../src/boss/anatomy.js';
import {lengths} from '../src/robot/kinematics.js';

const expected={
 arm:[[0,6],[2.5649956530853313,20.957926447224676],[20,13]],
 leg:[[-22.5,6],[-19,22],[-37,16]]
};
const near=(actual,target,message)=>assert.ok(Math.abs(actual-target)<1e-7,`${message}: ${actual} != ${target}`);

test('all four base patients use the exported pose for rendering and hit geometry',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),
  {url:'https://rig.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 Object.assign(globalThis,{matchMedia:()=>({matches:false}),ResizeObserver:class{observe(){}disconnect(){}},
  requestAnimationFrame:()=>1,cancelAnimationFrame:()=>{}});
 try{
  initializeGame();
  const base={x:340,y:350,angle:0};
  for(const id of [0,1,2,3]){
   const robot=createRobot(id,base);
   robot.setVisible(true);robot.paint();
   const center=robot.eye;
   near(center.x-base.x,11,'head center');
   const head=robot.capsules.find(c=>c.segment==='head');
   near(head.a.x,center.x,'head collision center');
   for(const limb of robot.limbs){
    const key=`${limb.kind}-${limb.side}`,pose=limb.pose;
    for(const [index,[x,y]] of expected[limb.kind].entries()){
     near(pose[index].x-base.x,x,key);
     near(pose[index].y-base.y,y*limb.side,key);
    }
    for(const [index,part] of ['upper','lower'].entries()){
     const capsule=robot.capsules.find(c=>c.segment===key+'-'+part);
     assert.deepEqual([capsule.a,capsule.b],pose.slice(index,index+2));
     const portrait=PORTRAIT_BONES.find(b=>b.key===key+'-'+part);
     for(const [point,n] of [[portrait.a,index],[portrait.b,index+1]]){
      near(point.x*robot.scale,pose[n].x-base.x,key+' portrait x');
      near(point.y*robot.scale,pose[n].y-base.y,key+' portrait y');
     }
    }
   }
  }
 }finally{
  ctx.root.__disposeTag();
  dom.window.close();
 }
});

test('named boss anatomy retains its original limb lengths',()=>{
 const body=bossAnatomy('brute');
 const arm=body.limbs.find(l=>l.kind==='arm'),leg=body.limbs.find(l=>l.kind==='leg');
 assert.deepEqual(lengths({body,scale:1},arm),[27,29]);
 assert.deepEqual(lengths({body,scale:1},leg),[32,33]);
});
