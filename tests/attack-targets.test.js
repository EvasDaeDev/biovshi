import {startBossScenario} from '../scripts/boss-harness.mjs';
import {createRobot} from '../src/robot/robot.js';
import {pointSegment,segmentDistance} from '../src/utils/math.js';
import {CONFIG} from '../src/config.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareStrikeCandidates,strikeCandidates,struckSegment,inStrikeSector} from '../src/systems/combat.js';
import {ctx} from '../src/game/state.js';

const candidate=(segment,score=0,kind='arm')=>({segment,score,source:{kind}});
test('reachable arms and legs outrank torso and pelvis, which outrank the head regardless of geometry score',()=>{
 const limb=candidate('leg-1-lower',5000),arm=candidate('arm--1-upper',6000),
  spine=candidate('spine-1',100),pelvis=candidate('spine-3',200),head=candidate('head',-100);
 assert.deepEqual([head,pelvis,limb,spine,arm].sort(compareStrikeCandidates),[limb,arm,spine,pelvis,head]);
 assert.ok(compareStrikeCandidates(candidate('arm-1-upper',40),candidate('leg-1-upper',50))<0);
 assert.ok(compareStrikeCandidates(candidate('leg-1-upper',40),candidate('arm-1-upper',50))<0);
 assert.ok(compareStrikeCandidates(candidate('arm-1-lower',10,'arm'),candidate('arm-1-lower',10,'head'))<0);
});

function fixture(){
 ctx.obstacles=[];ctx.game={time:1};
 const source={key:'arm-1-lower',kind:'arm',point:{x:0,y:0},reachFactor:1};
 const attacker={x:0,y:0,angle:0,center:{x:0,y:0},attackSources:[source],
  attackPose:p=>({kind:'arm',tip:{...p.aim}}),canSee:()=>true};
 const capsule=(segment,x)=>({segment,a:{x,y:0},b:{x,y:0},r:2});
 const victim={x:15,y:0,center:{x:15,y:0},isDamageable:k=>k!=='spine-0',
  capsules:[capsule('head',10),capsule('spine-0',12),capsule('spine-2',20),capsule('leg-1-upper',30)]};
 return {attacker,victim,source};
}
test('actual candidate selection prefers a reachable leg and falls back to torso then head when parts are unreachable',()=>{
 const saved={game:ctx.game,obstacles:ctx.obstacles};try{
  const {attacker,victim,source}=fixture();
  assert.deepEqual(strikeCandidates(attacker,victim,source).map(c=>c.segment),['leg-1-upper','spine-2','head']);
  victim.capsules.find(c=>c.segment==='leg-1-upper').a.x=200;
  victim.capsules.find(c=>c.segment==='leg-1-upper').b.x=200;
  assert.equal(strikeCandidates(attacker,victim,source)[0].segment,'spine-2');
  victim.capsules=victim.capsules.filter(c=>c.segment!=='spine-2');
  assert.equal(strikeCandidates(attacker,victim,source)[0].segment,'head');
 }finally{Object.assign(ctx,saved);}
});

test('aiming at a limb still damages a head intercepted first along the thrust',()=>{
 const saved={game:ctx.game,obstacles:ctx.obstacles};try{
  const {attacker,victim}=fixture();let calls=0;
  attacker.attackPose=()=>({kind:'arm',tip:{x:calls++===0?30:0,y:0}});
  assert.equal(struckSegment(attacker,victim,{segment:'leg-1-upper',source:'arm-1-lower',aim:{x:30,y:0},started:0}),'head');
 }finally{Object.assign(ctx,saved);}
});


test('a touching hand can strike an exposed leg in front even when its owner stands behind, at every orientation',()=>{
 const f=startBossScenario({arena:'ward'});
 try{
  ctx.obstacles=[];
  for(const angle of [0,.73,Math.PI/2,Math.PI])for(const side of [-1,1]){
   ctx.actorsG.replaceChildren();ctx.robots=[];
   const a=createRobot(0,{x:350,y:350,angle});
   const dx=-20,dy=side*25;
   const b=createRobot(1,{x:350+dx*Math.cos(angle)-dy*Math.sin(angle),y:350+dx*Math.sin(angle)+dy*Math.cos(angle),angle:angle+Math.PI});ctx.robots=[a,b];
   const source=a.attackSources.find(s=>s.key===`arm-${side}-lower`);
   assert.equal(inStrikeSector(a,source,b),false,'owner is outside the coarse facing sector');
   const core=c=>c.segment==='head'||c.segment?.startsWith('spine-');
   assert.ok(a.capsules.filter(core).every(c=>b.capsules.filter(core).every(d=>segmentDistance(c.a,c.b,d.a,d.b)>=c.r+d.r)),'solid bodies do not overlap');
   assert.ok(b.capsules.some(c=>b.isDamageable(c.segment)&&pointSegment(source.point,c.a,c.b)<=c.r+2.2),'hand actually touches a damageable part');
   const selected=strikeCandidates(a,b,source);assert.ok(selected.length);assert.ok(selected.every(c=>inStrikeSector(a,source,c.aim)));
   const p={source:source.key,aim:selected[0].aim,started:ctx.game.time-CONFIG.combat.windupSec-CONFIG.combat.thrustSec};
   assert.ok(struckSegment(a,b,p)?.startsWith('leg-'),'the real contact, not the distant owner, receives the hit');
  }
 }finally{f.close();}
});

test('a frontal owner does not allow attacks on body parts lying outside the actual strike sector',()=>{
 const saved={game:ctx.game,obstacles:ctx.obstacles};
 try{
  const {attacker,victim,source}=fixture();victim.capsules=[{segment:'leg-1-lower',a:{x:-10,y:0},b:{x:-10,y:0},r:2}];
  assert.equal(inStrikeSector(attacker,source,victim),true);assert.equal(strikeCandidates(attacker,victim,source).length,0);
 }finally{Object.assign(ctx,saved);}
});

test('contact targeting still respects blocked sight and the actual reach of the limb',()=>{
 const saved={game:ctx.game,obstacles:ctx.obstacles};
 try{
  const {attacker,victim,source}=fixture();ctx.obstacles=[{left:4,right:6,top:-50,bottom:50}];
  assert.equal(strikeCandidates(attacker,victim,source).length,0);
  ctx.obstacles=[];victim.capsules=[{segment:'leg-1-lower',a:{x:200,y:0},b:{x:200,y:0},r:2}];
  assert.equal(strikeCandidates(attacker,victim,source).length,0);
 }finally{Object.assign(ctx,saved);}
});
