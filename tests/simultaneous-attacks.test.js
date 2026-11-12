import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {ctx} from '../src/game/state.js';
import {CONFIG} from '../src/config.js';
import {initializeGame} from '../src/game/initialize.js';
import {createRobot} from '../src/robot/robot.js';
import {combatAttacks,selectSimultaneousStrikes,strikeCandidates} from '../src/systems/combat.js';
import {pendingStrikes,cancelStrikesAgainst} from '../src/systems/strikes.js';
import {lifted} from '../src/robot/scenes.js';
import {onGameEvent} from '../src/game/event-bus.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://two-targets.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame({entry:'setup'});ctx.game.time=10;ctx.obstacles=[];ctx.robots=[];ctx.scale=1;
 const r=createRobot(0,{x:350,y:350,angle:0});r.setVisible(true);ctx.robots=[r];
 ctx.agentAI[0].nextPounceDecisionAt=Infinity;
 return {dom,r,close(){ctx.root.__disposeTag();dom.window.close();}};
}
function target(id,point){
 const hits=[];return {id,x:point.x,y:point.y,center:point,visible:true,mobile:true,hasHead:true,segmentCount:1,
 actualPose:{leap:null,scene:null},combatRecoverUntil:0,canSee:()=>false,
 capsules:[{a:point,b:point,r:4,segment:'head'}],isDamageable:()=>true,
 damage(segment,by,damage){hits.push({segment,by,damage});return true;},hits,
 reactToHit(){},flashHitLight(){},movementLimbs:4,attackSources:[]};
}
function rearTargets(r){
 const pelvis=r.actualPose.pelvis;
 return [1,-1].map((side,i)=>target(i+1,{x:pelvis.x+Math.cos(side*2*Math.PI/3)*40,y:pelvis.y+Math.sin(side*2*Math.PI/3)*40}));
}
const candidate=(victim,source,score=0)=>({victim:{id:victim},source:{key:source,kind:source.startsWith('arm')?'arm':'leg'},segment:'arm-1-upper',score});
test('selection caps attacks at two distinct opponents and distinct limbs, including alternate assignments',()=>{
 const a=candidate(1,'arm-1-lower'),b=candidate(2,'arm-1-lower',1),c=candidate(1,'arm--1-lower',2),d=candidate(3,'leg-1-lower',3);
 assert.equal(selectSimultaneousStrikes([a,b]).length,1,'one arm cannot attack two patients');
 assert.equal(selectSimultaneousStrikes([a,c]).length,1,'two limbs do not double-hit one patient');
 const pair=selectSimultaneousStrikes([a,b,c]);assert.equal(pair.length,2);assert.deepEqual(new Set(pair.map(x=>x.victim.id)),new Set([1,2]));
 assert.equal(selectSimultaneousStrikes([a,b,c,d]).length,2,'no third opponent');
});
test('two actual legs strike two opponents once each and both appear in the pose',()=>{
 const f=setup();try{
  const foes=rearTargets(f.r);ctx.robots.push(...foes);const events=[];const off=onGameEvent(e=>events.push(e));
  try{
   combatAttacks();const strikes=pendingStrikes(0);assert.equal(strikes.length,2);assert.equal(new Set(strikes.map(p=>p.victim)).size,2);assert.equal(new Set(strikes.map(p=>p.source)).size,2);
   assert.equal(ctx.combat.strikes,2);assert.equal(ctx.combat.fighterSwings[0],2);
   for(const limb of f.r.limbs.filter(l=>l.kind==='leg'))assert.equal(lifted({id:0},limb),true);
   ctx.game.time=strikes[0].impactAt;f.r.paint(false);
   for(const p of strikes){const pose=f.r.attackPose(p);assert.ok(pose);assert.ok(Math.hypot(pose.limb.pose[2].x-pose.tip.x,pose.limb.pose[2].y-pose.tip.y)<.01,'each rendered limb reaches its own attack tip');}
   combatAttacks();assert.deepEqual(foes.map(v=>v.hits.length),[1,1]);assert.equal(ctx.combat.hits,2);assert.equal(ctx.combat.fighterHits[0],2);
   combatAttacks();assert.deepEqual(foes.map(v=>v.hits.length),[1,1]);assert.equal(events.filter(e=>e.type==='combat-strike').length,2);
   ctx.game.time=strikes[0].endsAt;ctx.combat.nextStrike[0]=Infinity;combatAttacks();assert.deepEqual(pendingStrikes(0),[]);
  }finally{off();}
 }finally{f.close();}
});
test('two actual hands can attack separate opponents without duplicating a hit',()=>{
 const f=setup();try{
  const arms=f.r.attackSources.filter(s=>s.kind==='arm');
  const foes=arms.map((s,i)=>target(i+1,{x:s.point.x+20,y:s.point.y}));ctx.robots.push(...foes);
  for(let i=0;i<arms.length;i++)assert.ok(strikeCandidates(f.r,foes[i],arms[i]).length,'hand has a physically reachable target');
  combatAttacks();const strikes=pendingStrikes(0);assert.equal(strikes.length,2);assert.ok(strikes.every(p=>p.source.startsWith('arm-')));
  ctx.game.time=strikes[0].impactAt;combatAttacks();combatAttacks();assert.deepEqual(foes.map(v=>v.hits.length),[1,1]);
 }finally{f.close();}
});
test('a hand and a leg can attack different sides at the same time',()=>{
 const f=setup();try{
  const arm=f.r.attackSources.find(s=>s.kind==='arm');
  const foes=[target(1,{x:arm.point.x+20,y:arm.point.y}),rearTargets(f.r)[1]];foes[1].id=2;ctx.robots.push(...foes);
  combatAttacks();const strikes=pendingStrikes(0);assert.equal(strikes.length,2);assert.deepEqual(new Set(strikes.map(p=>p.source.split('-')[0])),new Set(['arm','leg']));
  ctx.game.time=strikes[0].impactAt;combatAttacks();assert.deepEqual(foes.map(v=>v.hits.length),[1,1]);
 }finally{f.close();}
});
test('real patient death cancels only attacks at that patient, including secondary targets',()=>{
 for(const secondary of [false,true]){const f=setup();try{
  ctx.robots.push(...rearTargets(f.r),target(3,{x:500,y:500}));
  const atPlayer={victim:0,source:'arm-1-lower'},atOther={victim:1,source:'arm--1-lower'};
  ctx.combat.pending[3]=secondary?{...atOther,secondary:atPlayer}:{...atPlayer,secondary:atOther};
  f.r.damage('head',1,100);assert.equal(f.r.mobile,false);assert.deepEqual(pendingStrikes(3).map(p=>p.victim),[1]);
 }finally{f.close();}}
});
test('loss of one attacking limb only cancels that limb, not the other strike',()=>{
 const f=setup();try{
  const foes=rearTargets(f.r);ctx.robots.push(...foes);combatAttacks();const strikes=pendingStrikes(0);
  assert.equal(strikes.length,2);const lost=strikes[0],other=strikes[1];
  f.r.damage(lost.source.replace('lower','upper'),1,100);
  ctx.game.time=lost.impactAt;combatAttacks();assert.equal(foes[lost.victim-1].hits.length,0);assert.equal(foes[other.victim-1].hits.length,1);
 }finally{f.close();}
});
test('removing either target preserves its partner attack and permits reusing the attack slot later',()=>{
 for(const removed of [0,1]){const f=setup();try{
  const foes=rearTargets(f.r);ctx.robots.push(...foes);combatAttacks();const strikes=pendingStrikes(0);assert.equal(strikes.length,2);
  cancelStrikesAgainst(strikes[removed].victim);const remaining=pendingStrikes(0);assert.equal(remaining.length,1);assert.equal(remaining[0].victim,strikes[1-removed].victim);
  ctx.game.time=remaining[0].impactAt;combatAttacks();assert.equal(foes[remaining[0].victim-1].hits.length,1);
 }finally{f.close();}}
});
test('a launched jump never starts a second attack against another reachable opponent',()=>{
 const f=setup();try{
  const foes=rearTargets(f.r);ctx.robots.push(...foes);
  assert.equal(f.r.pounce({x:425,y:350},{victimId:1}),true);f.r.actualPose.leap.launched=true;
  combatAttacks();assert.deepEqual(pendingStrikes(0),[]);assert.deepEqual(foes.map(v=>v.hits.length),[0,0]);
 }finally{f.close();}
});
test('jump impact damages only its designated target even when two patients overlap the contact',()=>{
 const f=setup();try{
  const point={...f.r.eye},foes=[target(1,point),target(2,point)];ctx.robots.push(...foes);
  assert.equal(f.r.pounce({x:425,y:350},{victimId:1}),true);
  Object.assign(f.r.actualPose.leap,{kind:'combat-pounce',launched:true,soundStarted:true,victim:1,lastHead:point});
  combatAttacks();combatAttacks();assert.deepEqual(foes.map(v=>v.hits.length),[1,0]);assert.equal(foes[0].hits[0].damage,CONFIG.attack.combatPounceDamage);assert.deepEqual(pendingStrikes(0),[]);
 }finally{f.close();}
});
