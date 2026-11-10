import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {createRobot} from '../src/robot/robot.js';
import {jumpHeight} from '../src/robot/scenes.js';
import {bodyTransform} from '../src/render/robot.js';

function setup(yaw=0){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://biovshi.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=class{observe(){} disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});
 ctx.game.time=10;ctx.obstacles=[];ctx.robots=[];ctx.scale=1;
 const r=createRobot(0,{x:350,y:350,angle:yaw});r.setVisible(true);ctx.robots=[r];
 const goal={x:r.x+Math.cos(yaw)*75,y:r.y+Math.sin(yaw)*75};
 r.pounce(goal,{});
 const intent={mode:'chase',speed:0,goal,lookPoint:null};
 r.tick(0,intent);
 return {dom,r,intent};
}
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function hip(r,l){const p=r.actualPose.pelvis;return{x:p.x-5*Math.cos(p.angle)-l.side*12*Math.sin(p.angle),y:p.y-5*Math.sin(p.angle)+l.side*12*Math.cos(p.angle)};}

test('pounce plants feet, crouches, extends both legs and folds them before landing at any heading',()=>{
 for(const yaw of [0,Math.PI/2,Math.PI,-.7]){
  const {dom,r,intent}=setup(yaw);try{
   const feet=r.limbs.map(l=>({...l.foot})),start={x:r.x,y:r.y};
   const legs=r.limbs.filter(l=>l.kind==='leg');
   const initial=legs.map(l=>distance(hip(r,l),l.foot));
   const max=[0,0];let crouched;
   for(let i=1;i<=60;i++){
    ctx.game.time=10+i/60;r.tick(1/60,intent);
    assert.ok(r.clear(),'every animated pose clears the arena');
    if(i<=14){
     assert.deepEqual(r.limbs.map(l=>l.foot),feet,'no contact slides during preparation');
     assert.equal(ctx.game.events.filter(e=>e.type==='pounce-launch').length,0);
     assert.equal(jumpHeight({leap:r.actualPose.leap}),0,'grounded feet must not enlarge or slide');
     crouched=legs.map(l=>distance(hip(r,l),l.foot));
    }
    legs.forEach((l,j)=>{max[j]=Math.max(max[j],distance(hip(r,l),l.foot));});
    if(i===14)assert.ok((r.x-start.x)*Math.cos(yaw)+(r.y-start.y)*Math.sin(yaw)<-5);
    if(i===57)legs.forEach(l=>assert.ok(distance(hip(r,l),l.foot)<40,'legs bend for landing'));
   }
   crouched.forEach((v,j)=>assert.ok(v<initial[j]));
   max.forEach(v=>assert.ok(v>62&&v<65,'both legs reach almost full extension'));
   assert.equal(ctx.game.events.filter(e=>e.type==='pounce-launch').length,1);
  }finally{dom.window.close();}
 }
});

test('jump enlargement is halved to 6.5 percent and remains clamped at walls',()=>{
 const saved=ctx.arenaPlanes;ctx.arenaPlanes=[];
 const robot={x:0,y:0,visiblePoint:p=>p,api:{capsules:[{a:{x:10,y:0},b:{x:10,y:0},r:1}]}};
 try{
  assert.match(bodyTransform(robot,1),/scale\(1\.065\)/);
  assert.equal(bodyTransform(robot,0),'');
  ctx.arenaPlanes=[{nx:1,ny:0,c:11}];assert.equal(bodyTransform(robot,1),'');
 }finally{ctx.arenaPlanes=saved;}
});

test('a wall limits crouch and leg motion without pushing any bone through it',()=>{
 const {dom,r,intent}=setup();try{
  // The hind foot and shin approach this obstacle during the flight.
  ctx.obstacles=[{left:330,right:338,top:378,bottom:386,
    points:[{x:330,y:378},{x:338,y:378},{x:338,y:386},{x:330,y:386}]}];
  assert.ok(r.clear());
  for(let i=1;i<=70;i++){
   ctx.game.time=10+i/60;r.tick(1/60,intent);
   assert.ok(r.clear(),'collision checks apply to body and animated legs');
  }
  assert.equal(r.actualPose.leap,null);
 }finally{dom.window.close();}
});

test('losing a shin or an entire leg during the push preserves the other foot and finishes the jump',()=>{
 for(const segment of ['leg-1-lower','leg-1-upper']){
  const {dom,r,intent}=setup();try{
   for(let i=1;i<=70;i++){
    ctx.game.time=10+i/60;
    if(i===12){r.damage(segment,1,10);}
    r.tick(1/60,intent);
    assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));
    assert.ok(r.clear());
   }
   assert.equal(r.actualPose.leap,null);
   assert.equal(r.attackSources.some(s=>s.key===segment),false);
  }finally{dom.window.close();}
 }
});
