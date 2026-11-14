import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {coreClearBone} from '../src/systems/collision.js';
import {staticContacts,isLimb,resolveSurfaceContacts} from '../src/systems/surface-contact.js';
import {initializeGame} from '../src/game/initialize.js';
import {createRobot} from '../src/robot/robot.js';
import {betNewSession} from '../src/betting/ledger.js';
import {newTower} from '../src/tower/model.js';

const square={left:0,right:20,top:0,bottom:20,points:[{x:0,y:0},{x:20,y:0},{x:20,y:20},{x:0,y:20}]};
test('a capsule clears the rounded corner even inside the old expanded square corner',()=>{
 ctx.planeCache=new WeakMap();ctx.arenaPlanes=[];ctx.obstacles=[square];
 const a={x:21.5,y:21.5},b={x:30,y:30};
 assert.ok(Math.hypot(a.x-20,a.y-20)>2,'the nearest point on the obstacle is beyond the capsule radius');
 assert.equal(coreClearBone(a,b,2),true);assert.equal(coreClearBone(a,a,2),true);
 assert.deepEqual(staticContacts({a,b,r:2}),[]);
});
test('real corner intersections are still blocked, and correction makes the same capsule safe',()=>{
 ctx.planeCache=new WeakMap();ctx.arenaPlanes=[];ctx.obstacles=[square];
 const point={x:21,y:21};
 const state={x:21,y:21,chest:point,vx:-1,vy:-1,allLimbs:()=>[],peerRobots:()=>[],makeCapsules:()=>[{a:{...point},b:{...point},r:2,segment:'spine-0'}]};
 assert.equal(coreClearBone(point,point,2),false);assert.ok(staticContacts(state.makeCapsules()[0]).length);
 assert.equal(resolveSurfaceContacts(state),true);assert.equal(coreClearBone(point,point,2),true);
 assert.ok(Math.hypot(point.x-20,point.y-20)>2);
});
test('capsule movement never crosses a polygon edge or the arena perimeter',()=>{
 ctx.planeCache=new WeakMap();ctx.obstacles=[square];ctx.arenaPlanes=[{nx:-1,ny:0,c:10,length:1},{nx:1,ny:0,c:100,length:1}];
 assert.equal(coreClearBone({x:-9,y:30},{x:-9,y:50},2),false);
 assert.equal(coreClearBone({x:-5,y:10},{x:25,y:10},2),false);
 assert.equal(coreClearBone({x:0,y:23},{x:25,y:23},2),true);
});
function fixture(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://corner.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.towerPlayer=0;initializeGame({arenaId:'ward',entry:'tower',session:betNewSession(['Игрок'],100),tower:newTower(0)});
 ctx.game.time=10;ctx.combat.finished=false;ctx.startup.phase='running';ctx.robots=[];ctx.actorsG.replaceChildren();
 return dom;
}
for(const obstacleIndex of [3,4])test(`tower patient can reverse away from triangular obstacle ${obstacleIndex} without losing limbs`,()=>{
 const dom=fixture();
 try{
  const obstacle=ctx.obstacles[obstacleIndex],cx=(obstacle.left+obstacle.right)/2,cy=(obstacle.top+obstacle.bottom)/2;
  const theta=Math.PI/4,start={x:cx+Math.cos(theta)*120,y:cy+Math.sin(theta)*120};
  const robot=createRobot(0,{...start,angle:theta+Math.PI});robot.setVisible(true);ctx.robots=[robot];assert.ok(robot.clear());
  const health=[...robot.hp];
  const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;robot.tick(1/60,{manual:true,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:cx,y:cy},240);const contact={x:robot.x,y:robot.y};
  tick(start,240);
  assert.ok(Math.hypot(robot.x-contact.x,robot.y-contact.y)>20,'a reverse command must free the patient from the corner');
  assert.deepEqual([...robot.hp],health);assert.equal(robot.segmentCount,robot.segmentTotal);assert.equal(robot.recoveryCount,0,'the command stays under player control');
  for(const c of robot.capsules)for(const hit of staticContacts(c))assert.ok(hit.depth<=(isLimb(c)?5:0)+.01);
 }finally{ctx.root.__disposeTag();dom.window.close();}
});

test('a patient can leave the same corner after losing a forearm without losing more anatomy',()=>{
 const dom=fixture();
 try{
  const theta=Math.PI/4,cx=145,cy=450,start={x:cx+Math.cos(theta)*120,y:cy+Math.sin(theta)*120};
  const robot=createRobot(0,{...start,angle:theta+Math.PI});robot.setVisible(true);ctx.robots=[robot];
  const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;robot.tick(1/60,{manual:true,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:cx,y:cy},240);robot.damage('arm-1-lower',1,3);assert.ok(robot.mobile);
  const contact={x:robot.x,y:robot.y},health=[...robot.hp],segments=robot.segmentCount;
  tick(start,240);
  assert.ok(Math.hypot(robot.x-contact.x,robot.y-contact.y)>20);
  assert.equal(robot.segmentCount,segments);assert.deepEqual([...robot.hp],health);
 }finally{ctx.root.__disposeTag();dom.window.close();}
});
