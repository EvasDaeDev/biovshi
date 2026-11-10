import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {CONFIG} from '../src/config.js';
import {initializeGame} from '../src/game/initialize.js';
import {createRobot} from '../src/robot/robot.js';
import {fighterIntent} from '../src/systems/ai.js';
import {inStrikeSector,strikeCandidates,kickPathClear,struckSegment,combatAttacks} from '../src/systems/combat.js';
import {lifted} from '../src/robot/scenes.js';

function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://biovshi.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=class{observe(){} disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});
 ctx.game.time=10;ctx.obstacles=[];ctx.robots=[];ctx.scale=1;
 const r=createRobot(0,{x:350,y:350,angle:0});r.setVisible(true);ctx.robots=[r];
 return {dom,r};
}
function target(point){return {id:1,x:point.x,y:point.y,center:point,visible:true,mobile:true,hasHead:true,segmentCount:1,
 actualPose:{leap:null,scene:null},combatRecoverUntil:0,canSee:()=>false,
 capsules:[{a:point,b:point,r:4,segment:'head'}],isDamageable:()=>true,damage:()=>true,
 reactToHit(){},movementLimbs:4,attackSources:[]};}
function pointAt(r,degrees,distance=40){const p=r.actualPose.pelvis,a=p.angle+degrees*Math.PI/180;return {x:p.x+Math.cos(a)*distance,y:p.y+Math.sin(a)*distance};}

test('each leg covers its own side and both cover the rear, at every body orientation',()=>{
 for(const yaw of [0,.73,Math.PI/2,Math.PI]){
  const attacker={x:350,y:350,angle:yaw,actualPose:{pelvis:{x:310,y:350,angle:yaw}}};
  for(const side of [-1,1]){
   const leg={kind:'leg',side};
   assert.equal(inStrikeSector(attacker,leg,pointAt(attacker,0)),false);
   assert.equal(inStrikeSector(attacker,leg,pointAt(attacker,side*90)),true);
   assert.equal(inStrikeSector(attacker,leg,pointAt(attacker,-side*90)),false);
   assert.equal(inStrikeSector(attacker,leg,pointAt(attacker,180)),true);
  }
  const rear={x:350-Math.cos(yaw)*50,y:350-Math.sin(yaw)*50};
  for(const kind of ['arm','head'])assert.equal(inStrikeSector(attacker,{kind},rear),false);
 }
});

test('real legs choose lateral/rear targets, reject the opposite side and distant unseen targets',()=>{
 const {dom,r}=setup();try{
  for(const side of [-1,1]){
   const source=r.attackSources.find(s=>s.kind==='leg'&&s.side===side);
   const foe=target(pointAt(r,side*120));
   assert.ok(strikeCandidates(r,foe,source).length);
   assert.equal(strikeCandidates(r,target(pointAt(r,-side*90)),source).length,0);
   assert.equal(strikeCandidates(r,target(pointAt(r,0)),source).length,0);
   assert.equal(strikeCandidates(r,target(pointAt(r,180,100)),source).length,0);
   const sensedEdge=target({x:source.point.x-37,y:source.point.y});
   assert.ok(strikeCandidates({...r,canSee:()=>true},sensedEdge,source).length,'same target is physically reachable when seen');
   assert.equal(strikeCandidates({...r,canSee:()=>false},sensedEdge,source).length,0,'unseen target outside contact sensing stays unknown');
  }
 }finally{dom.window.close();}
});

test('kick tucks under the hip, extends continuously, hits actual contact, and returns to its support',()=>{
 const {dom,r}=setup();try{
  const source=r.attackSources.find(s=>s.kind==='leg'&&s.side===1),foe=target(pointAt(r,120));
  const aim=strikeCandidates(r,foe,source)[0].aim;
  const pending={source:source.key,aim,started:10};
  const poseAt=age=>{ctx.game.time=10+age;return r.attackPose(pending);};
  const base=poseAt(0),tuck=poseAt(CONFIG.combat.windupSec),impact=poseAt(CONFIG.combat.windupSec+CONFIG.combat.thrustSec);
  assert.ok(Math.hypot(tuck.tip.x-tuck.shoulder.x,tuck.tip.y-tuck.shoulder.y)<Math.hypot(base.tip.x-base.shoulder.x,base.tip.y-base.shoulder.y));
  assert.ok(Math.hypot(impact.tip.x-aim.x,impact.tip.y-aim.y)<1e-8);
  for(const boundary of [CONFIG.combat.windupSec,CONFIG.combat.windupSec+CONFIG.combat.thrustSec]){
   const before=poseAt(boundary-1e-7),after=poseAt(boundary+1e-7);
   assert.ok(Math.hypot(before.tip.x-after.tip.x,before.tip.y-after.tip.y)<1e-4);
  }
  ctx.game.time=10+CONFIG.combat.windupSec+CONFIG.combat.thrustSec;
  assert.equal(struckSegment(r,foe,pending),'head');
  assert.equal(struckSegment(r,target({x:500,y:500}),pending),null);
  const end=poseAt(CONFIG.combat.windupSec+CONFIG.combat.thrustSec+CONFIG.combat.recoverSec);
  assert.deepEqual(end.tip,base.tip);
  ctx.obstacles=[{left:aim.x-3,right:aim.x+3,top:aim.y-3,bottom:aim.y+3}];
  assert.equal(kickPathClear(r,pending),false,'kick cannot extend through a wall');
 }finally{dom.window.close();}
});

test('a rear kick holds body and planted feet even under a forward movement intent',()=>{
 const {dom,r}=setup();try{
  const foe=target(pointAt(r,180,48));ctx.robots=[r,foe];
  const initial={x:r.x,y:r.y,angle:r.angle,pelvis:{...r.actualPose.pelvis},feet:r.limbs.map(l=>({...l.foot}))};
  const intent=fighterIntent(r);
  assert.equal(intent.mode,'лягается');assert.equal(intent.speed,0);assert.equal(intent.lookPoint,null);
  ctx.seed=1972; // The next random roll would allow a pounce; the kick must win first.
  combatAttacks();
  const pending=ctx.combat.pending[r.id];assert.ok(pending?.source.startsWith('leg-'));
  assert.equal(r.actualPose.leap,null,'a reachable rear kick wins over a leap requiring a turn');
  const source=r.attackSources.find(s=>s.key===pending.source);
  assert.equal(lifted({id:r.id,mode:'normal'},{kind:'leg',side:source.side}),true);
  for(let i=0;i<30;i++){
   ctx.game.time+=1/60;
   r.tick(1/60,{goal:{x:500,y:500},speed:60,mode:'chase',lookPoint:foe.center});
  }
  assert.equal(r.x,initial.x);assert.equal(r.y,initial.y);assert.equal(r.angle,initial.angle);
  assert.deepEqual(r.actualPose.pelvis,initial.pelvis);
  assert.deepEqual(r.limbs.map(l=>l.foot),initial.feet);
  let hits=0;foe.damage=()=>{hits++;return true;};
  ctx.game.time=pending.impactAt;combatAttacks();assert.equal(hits,1);
  combatAttacks();assert.equal(hits,1,'one kick causes damage only once');
  ctx.game.time=pending.endsAt;combatAttacks();assert.equal(ctx.combat.pending[r.id],null);
 }finally{dom.window.close();}
});

test('loss of a shin keeps only a shorter stump kick; loss of thigh removes the attack',()=>{
 const {dom,r}=setup();try{
  ctx.robots=[r];
  for(let i=0;i<3;i++){ctx.game.time+=1;r.damage('leg-1-lower',1);}
  const source=r.attackSources.find(s=>s.key==='leg-1-upper');assert.ok(source);assert.equal(source.reachFactor,.5);
  const preview=r.attackPose({source:source.key,aim:pointAt(r,120,100),preview:true});
  assert.ok(Math.hypot(preview.tip.x-preview.shoulder.x,preview.tip.y-preview.shoulder.y)<=32);
  for(let i=0;i<3;i++){ctx.game.time+=1;r.damage('leg-1-upper',1);}
  assert.equal(r.attackSources.some(s=>s.kind==='leg'&&s.side===1),false);
 }finally{dom.window.close();}
});
