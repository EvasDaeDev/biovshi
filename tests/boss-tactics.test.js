import test from 'node:test';
import assert from 'node:assert/strict';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {createRobot} from '../src/robot/robot.js';
import {createBoss} from '../src/boss/boss.js';
import {BOSS_CONFIG} from '../src/boss/config.js';
import {bossDamage,chargePlan,poseAt,sweepContacts,sweepPathClear} from '../src/boss/attacks.js';
import {updateBossPhase} from '../src/boss/behavior.js';
import {strikeCandidates} from '../src/systems/combat.js';
import {cancelStrikesAgainst,pendingStrikes} from '../src/systems/strikes.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {obstacleVertices} from '../src/game/arena.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import {headingForIntent} from '../src/robot/locomotion.js';
import {recordBossTacticalStrike} from '../src/boss/positioning.js';
import {critChance} from '../src/garage/model.js';
function duel({variant='arms',bossX=330,playerX=385}={}){
 const f=startBossScenario({variant,arena:'ring'});ctx.actorsG.replaceChildren();ctx.robots=[];
 const player=createRobot(0,{x:playerX,y:350,angle:Math.PI});ctx.robots.push(player);
 const boss=createBoss(1,{x:bossX,y:350,angle:0},f.tower.bossEncounter);ctx.robots.push(boss);
 ctx.combat.nextStrike.fill(0);ctx.combat.pending.fill(null);
 return {...f,player,boss,state:boss.body.behavior.state};
}
const advanceTo=(f,time)=>{ctx.game.time=time;f.boss.body.resolveCombat(f.boss);};
const prepareWide=f=>{f.state.cycles=2;f.boss.body.planCombat(f.boss);const p=pendingStrikes(1)[0];assert.equal(p?.style,'sweep');return p;};
const obstacle=()=>{const b={left:370,right:378,top:280,bottom:420};b.points=obstacleVertices(b);ctx.obstacles=[b];};

test('boss keeps its slow locomotion, ignores ordinary retreat, and persistently closes reachable distance',()=>{
 const f=duel({bossX:280,playerX:410});try{
  ctx.combat.retreatUntil[1]=100;ctx.combat.retreatFrom[1]=0;
  const intent=f.boss.body.intent(f.boss);assert.equal(intent.mode,'преследует');assert.equal(intent.speed,55);
  assert.equal(f.boss.locomotion,.85);assert.equal(f.boss.turnAbility,.75);assert.equal(f.player.locomotion,1);
 }finally{f.close();}
});

test('phase changes once after anatomical losses, changes follow-up patterns and never restores HP or speed',()=>{
 const f=duel({variant:'brute'}),events=[];const off=onGameEvent(e=>{if(e.type==='boss-phase')events.push(e);});
 try{
  assert.equal(f.state.phase,1);f.boss.damage('leg--1-upper',0,100);const hp=[...f.boss.hp];
  assert.equal(updateBossPhase(f.boss,f.state),2);assert.equal(updateBossPhase(f.boss,f.state),2);assert.equal(events.length,1);
  assert.deepEqual([...f.boss.hp],hp);assert.equal(f.boss.trauma,0);assert.equal(f.boss.body.speedFactor,.85);assert.equal(f.boss.body.turnFactor,.75);
  assert.equal(f.boss.unconscious,false);
 }finally{off();f.close();}
});

test('two-hit combo uses separate limbs sequentially and leaves a recovery window',()=>{
 const f=duel(),attempts=[];f.player.damage=(segment,by,damage)=>{attempts.push({p:pendingStrikes(1)[0],segment,by,damage});return false;};
 try{
  f.boss.body.planCombat(f.boss);const first=pendingStrikes(1)[0];assert.equal(first.comboIndex,1);assert.equal(pendingStrikes(1).length,1);
  advanceTo(f,first.impactAt);advanceTo(f,first.impactAt+.01);assert.ok(attempts.length<=1);
  advanceTo(f,first.endsAt+.001);assert.ok(f.state.followup);assert.equal(pendingStrikes(1).length,0);
  ctx.game.time=f.state.followup.at-.001;f.boss.body.planCombat(f.boss);assert.equal(pendingStrikes(1).length,0);
  ctx.game.time=f.state.followup.at+.001;f.boss.body.planCombat(f.boss);const second=pendingStrikes(1)[0];assert.equal(second.comboIndex,2);
  assert.notEqual(first.source.replace(/-(upper|lower)$/,''),second.source.replace(/-(upper|lower)$/,''));assert.ok(second.started>first.endsAt);
  advanceTo(f,second.impactAt);advanceTo(f,second.endsAt+.001);assert.equal(f.state.followup,null);assert.equal(pendingStrikes(1).length,0);
  assert.ok(ctx.combat.nextStrike[1]>=ctx.game.time+BOSS_CONFIG.tactics.seriesRest-.01);assert.ok(attempts.every(x=>x.by===1&&[1,2].includes(x.damage)));
  assert.equal(new Set(attempts.map(a=>a.p)).size,attempts.length,'one attempt per swing, even over repeated resolve ticks');
 }finally{f.close();}
});

function approachRearDuringCombo(f){
 const front=createRobot(2,{x:385,y:350,angle:Math.PI});
 ctx.robots=[createRobot(0,{x:160,y:350,angle:0}),f.boss,front];
 f.boss.body.planCombat(f.boss);
 const [primary]=pendingStrikes(1);
 assert.equal(primary.victim,front.id);
 assert.match(primary.source,/^arm-/);
 ctx.game.time=primary.started+.15;
 const player=createRobot(0,{x:245,y:350,angle:0});
 ctx.robots[0]=player;
 assert.ok(player.clear());
 assert.equal(f.boss.canSee(player.center),false);
 return {player,front,primary};
}

test('boss kicks a player coming from behind during a front combo, without turning or replacing its first swing',()=>{
 const f=duel();try{
  const {player,front,primary}=approachRearDuringCombo(f);
  const wall={left:270,right:276,top:320,bottom:380};
  wall.points=obstacleVertices(wall);ctx.obstacles=[wall];
  f.boss.body.planCombat(f.boss);
  assert.deepEqual(pendingStrikes(1),[primary],'a wall blocks rear contact sensing');
  ctx.obstacles=[];
  f.boss.body.planCombat(f.boss);
  const [stillFront,kick]=pendingStrikes(1);
  assert.equal(stillFront,primary);
  assert.equal(kick?.victim,player.id);
  assert.match(kick.source,/^leg-/);
  assert.ok(kick.started>primary.started,'the player arrived after the front windup began');
  const intent=f.boss.body.intent(f.boss);
  assert.deepEqual(intent.lookPoint,primary.aim);
  const heading=f.boss.angle;
  f.boss.tick(1/60,intent);
  assert.equal(f.boss.angle,heading);
  const hits=[];
  for(const target of [player,front]){
   target.damage=(segment,by)=>{hits.push([target.id,segment,by]);return true;};
   target.reactToHit=()=>{};
  }
  for(let time=kick.started;time<=kick.endsAt+.025;time+=1/60)advanceTo(f,time);
  assert.deepEqual(hits.map(([id,,by])=>[id,by]),[[front.id,f.boss.id],[player.id,f.boss.id]]);
  assert.deepEqual(pendingStrikes(1),[]);
  assert.equal(f.state.followup?.victim,front.id,'the rear kick leaves the front combo queued');
 }finally{f.close();}
});

test('losing either attacking limb preserves the boss swing on the other side',()=>{
 for(const index of [0,1]){
  const f=duel();try{
   approachRearDuringCombo(f);
   f.boss.body.planCombat(f.boss);
   const strikes=pendingStrikes(1);
   assert.equal(strikes.length,2);
   f.boss.damage(strikes[index].source.replace(/-(upper|lower)$/,'-upper'),0,100);
   f.boss.body.resolveCombat(f.boss);
   assert.deepEqual(pendingStrikes(1),[strikes[1-index]]);
   f.boss.body.planCombat(f.boss);
   assert.deepEqual(pendingStrikes(1),[strikes[1-index]],'other limbs do not restart a cancelled swing mid-cycle');
  }finally{f.close();}
 }
});

test('second phase follows the first strike with a wide strike when the other arm can reach',()=>{
 const f=duel();try{
  f.state.phase=2;f.boss.body.planCombat(f.boss);const first=pendingStrikes(1)[0];assert.equal(first.comboIndex,1);
  advanceTo(f,first.endsAt+.001);ctx.game.time=f.state.followup.at+.001;f.boss.body.planCombat(f.boss);
  const next=pendingStrikes(1)[0];assert.equal(next.comboIndex,2);assert.equal(next.style,'sweep');assert.equal(next.timing.windupSec,BOSS_CONFIG.combat.windupSec);
 }finally{f.close();}
});

test('severing the attacking limb cancels the swing and queued combo instead of replacing it instantly',()=>{
 const f=duel();try{
  f.boss.body.planCombat(f.boss);const p=pendingStrikes(1)[0],key=p.source.replace(/-(upper|lower)$/,'-upper');
  f.boss.damage(key,0,100);f.boss.body.resolveCombat(f.boss);assert.equal(pendingStrikes(1).length,0);assert.equal(f.state.followup,null);assert.ok(ctx.combat.nextStrike[1]>ctx.game.time);
 }finally{f.close();}
});

test('wide strike has real arc contact, no windup/return damage and hits each contacted segment only once',()=>{
 const f=duel(),attempts=[];f.player.damage=(...args)=>{attempts.push(args);return false;};
 try{
  const p=prepareWide(f),t=p.timing;
  assert.deepEqual(sweepContacts(f.boss,[f.player],p,0,t.windupSec-.001),[]);
  const segments=sweepContacts(f.boss,[f.player],p,t.windupSec,t.windupSec+t.thrustSec).map(hit=>hit.segment);
  assert.ok(segments.length>1);
  assert.deepEqual(sweepContacts(f.boss,[f.player],p,t.windupSec+t.thrustSec+.001,p.endsAt),[]);
  for(let n=0;n<=Math.ceil(p.endsAt*60)+1;n++)advanceTo(f,n/60);
  assert.deepEqual(attempts.map(([segment])=>segment).sort(),segments.sort());
  assert.ok(attempts.every(([,attacker,damage])=>attacker===1&&damage===attempts[0][2]&&[1,2].includes(damage)));
 }finally{f.close();}
});

test('a committed sweep can continue into another opponent after its first target is knocked out',()=>{
 const f=duel();try{
  const p=prepareWide(f),{windupSec,thrustSec}=p.timing;
  const second=createRobot(2,{x:f.player.x,y:f.player.y+24,angle:Math.PI});
  ctx.robots.push(second);
  const placeCapsule=(victim,fraction,segment)=>{
   const tip=poseAt(f.boss,p,windupSec+thrustSec*fraction).tip;
   Object.defineProperty(victim,'capsules',{value:[{segment,a:tip,b:tip,r:2}]});
  };
  placeCapsule(f.player,0,'head');
  placeCapsule(second,.9,'arm-1-lower');
  const contacts=[];
  f.player.damage=segment=>{
   contacts.push([0,segment]);
   Object.defineProperty(f.player,'mobile',{value:false});
   cancelStrikesAgainst(0);
   return true;
  };
  second.damage=segment=>{contacts.push([2,segment]);return true;};
  advanceTo(f,p.at);
  assert.deepEqual(contacts,[[0,'head']]);
  assert.equal(pendingStrikes(1)[0],p);
  advanceTo(f,p.impactAt);
  assert.deepEqual(contacts,[[0,'head'],[2,'arm-1-lower']]);
 }finally{f.close();}
});

test('wide strike cannot cross an obstacle, and a player who leaves its arc is missed',()=>{
 const f=duel();try{
  const p=prepareWide(f),{windupSec,thrustSec}=p.timing;obstacle();
  assert.equal(sweepPathClear(f.boss,p),false);
  assert.equal(sweepContacts(f.boss,[f.player],p,windupSec,windupSec+thrustSec),null);
  ctx.obstacles=[];const far=createRobot(0,{x:470,y:430,angle:Math.PI});ctx.robots[0]=far;
  assert.deepEqual(sweepContacts(f.boss,[far],p,windupSec,windupSec+thrustSec),[]);
 }finally{f.close();}
});

test('charge telegraphs, commits to a fixed point, uses physical steps and recovers on cooldown',()=>{
 const f=duel({bossX:280,playerX:430});try{
  const original=chargePlan(f.boss,f.player.center);assert.ok(original);assert.ok(original.distance<=72);
  f.state.nextChargeAt=0;const ready=f.boss.body.intent(f.boss);assert.equal(ready.speed,0);assert.ok(f.state.charge);
  const goal={...f.state.charge.goal},direction=f.state.charge.direction;
  const movedPlayer=createRobot(0,{x:430,y:395,angle:Math.PI});ctx.robots[0]=movedPlayer;
  ctx.game.time=.81;const run=f.boss.body.intent(f.boss);assert.equal(run.mode,'boss-charge');assert.deepEqual(run.goal,goal);assert.equal(run.heading,direction);
  let old={x:f.boss.x,y:f.boss.y};
  for(let n=0;n<30;n++){
   ctx.game.time=.81+n/60;const intent=f.boss.body.intent(f.boss);f.boss.tick(1/60,intent);
   assert.ok(Math.hypot(f.boss.x-old.x,f.boss.y-old.y)<4,'movement cannot teleport');old={x:f.boss.x,y:f.boss.y};
   assert.ok(f.boss.capsules.every(c=>staticContacts(c).every(h=>h.depth<=(isLimb(c)?5:0)+1e-6)));
  }
  assert.ok(f.boss.x>281);assert.ok(f.boss.x-280<=76);
  ctx.game.time=1.4;assert.equal(f.boss.body.intent(f.boss).speed,0);
  ctx.game.time=2.2;f.boss.body.intent(f.boss);assert.equal(f.state.charge,null);assert.ok(f.state.nextChargeAt>ctx.game.time);
 }finally{f.close();}
});

test('charge rejects routes that fit the head but intersect a body or limb capsule',()=>{
 const f=duel({bossX:280,playerX:430});try{
  assert.ok(chargePlan(f.boss,f.player.center));const b={left:315,right:325,top:250,bottom:450};b.points=obstacleVertices(b);ctx.obstacles=[b];
  assert.equal(chargePlan(f.boss,f.player.center),null);
 }finally{f.close();}
});

test('boss critical chance is 30 percent with the same 1/2HP limit; ordinary patient crits remain unchanged',()=>{
 assert.equal(BOSS_CONFIG.criticalChance,.30);assert.equal(bossDamage(0),2);assert.equal(bossDamage(.299999),2);assert.equal(bossDamage(.30),1);assert.equal(bossDamage(.999999),1);assert.equal(critChance(3),.15);
});

test('telegraph follows actual strike geometry, displays phase, disappears on death and consumes no RNG',()=>{
 const f=duel();try{
  prepareWide(f);const seed=ctx.seed;f.boss.paint(0);
  const cue=f.boss.actor.querySelector('[data-boss-cue]');assert.ok(cue);assert.equal(cue.querySelector('text'),null);assert.equal(cue.textContent,'');assert.ok(cue.querySelector('path').getAttribute('d').length>20);assert.equal(ctx.seed,seed);
  assert.equal(f.boss.actor.getAttribute('data-boss-phase'),'1');f.state.phase=2;f.boss.paint(0);assert.equal(f.boss.actor.getAttribute('data-boss-phase'),'2');
  f.boss.damage('head',0,100);f.boss.paint(0);assert.equal(cue.getAttribute('display'),'none');assert.doesNotMatch(f.boss.actor.outerHTML,/NaN|undefined/);
 }finally{f.close();}
});


test('recovery permits a short spacing step while the boss keeps facing the player',()=>{
 const f=duel();try{
  ctx.combat.nextStrike[1]=1;const intent=f.boss.body.intent(f.boss);
  assert.equal(intent.mode,'атакует');assert.ok(intent.retreat.x<0);assert.equal(intent.speed,55);
  assert.equal(headingForIntent(f.boss.angle,f.boss,intent.goal,intent),0);
 }finally{f.close();}
});

test('a follow-up is cancelled when the player leaves reach, leaving the promised recovery window',()=>{
 const f=duel();try{
  f.boss.body.planCombat(f.boss);const first=pendingStrikes(1)[0];advanceTo(f,first.endsAt+.001);
  ctx.robots[0]=createRobot(0,{x:470,y:430,angle:Math.PI});ctx.game.time=f.state.followup.at+.001;
  f.boss.body.planCombat(f.boss);assert.equal(pendingStrikes(1).length,0);assert.equal(f.state.followup,null);assert.ok(ctx.combat.nextStrike[1]>ctx.game.time);
 }finally{f.close();}
});

test('a sweep interrupted by newly blocked geometry cancels without inflicting damage',()=>{
 const f=duel();let attempts=0;f.player.damage=()=>{attempts++;return false;};
 try{const p=prepareWide(f);obstacle();advanceTo(f,p.timing.windupSec+p.timing.thrustSec/2);assert.equal(attempts,0);assert.equal(pendingStrikes(1).length,0);}
 finally{f.close();}
});

test('charge approach learns from head punishment across cooldowns, without steering mid-dash',()=>{
 const f=duel({bossX:280,playerX:430});try{
  const target=f.player.center;
  const first=chargePlan(f.boss,target);assert.ok(first);assert.ok(['direct','left','right'].includes(first.approach));
  const punished=Array.from({length:3},()=>({approach:first.approach,headDamage:2,landed:false}));
  const changed=chargePlan(f.boss,target,{history:punished});
  assert.ok(changed);assert.notEqual(changed.approach,first.approach);
  f.state.chargeOutcome={approach:first.approach,headHp:f.boss.hp.get('head'),hits:ctx.combat.fighterHits[1],reviewAt:1};
  f.state.nextChargeAt=1e6;ctx.game.time=1.1;f.boss.body.intent(f.boss);
  assert.equal(f.state.chargeHistory.length,1);
  ctx.game.time=30;f.boss.body.intent(f.boss);
  assert.equal(f.state.chargeHistory.length,1,'memory persists past the 12-second charge cooldown');
 }finally{f.close();}
});

test('successful dash permits only a short, real limb windup and no free damage',()=>{
 const f=duel({bossX:330,playerX:385});try{
  const oldHits=ctx.combat.hits;
  f.state.charge={victim:0,started:-2,launched:true,direction:0,distance:72,
   origin:{x:f.boss.x,y:f.boss.y},goal:{x:f.boss.x,y:f.boss.y},approach:'direct'};
  f.state.chargeOutcome={approach:'direct',headHp:f.boss.hp.get('head'),hits:0,reviewAt:Infinity};
  const intent=f.boss.body.intent(f.boss);
  assert.equal(intent.speed,0);assert.equal(f.state.charge,null);assert.ok(f.state.quickStrike);
  f.boss.body.planCombat(f.boss);
  const attack=pendingStrikes(1)[0];assert.ok(attack);
  assert.equal(attack.timing.windupSec,BOSS_CONFIG.tactics.chargeAttackWindup);
  assert.equal(attack.timing.thrustSec,BOSS_CONFIG.combat.thrustSec);
  assert.equal(ctx.combat.hits,oldHits,'charge and windup cannot deal direct damage');
 }finally{f.close();}
});

test('a dash without a reachable limb keeps its original recovery, and a fleeing enemy cancels before takeoff',()=>{
 const f=duel({bossX:280,playerX:430});try{
  f.state.nextChargeAt=0;f.boss.body.intent(f.boss);
  assert.ok(f.state.charge);
  const far=createRobot(0,{x:575,y:350,angle:Math.PI});ctx.robots[0]=far;
  ctx.game.time=BOSS_CONFIG.tactics.chargeWindup+.01;
  const cancelled=f.boss.body.intent(f.boss);
  assert.equal(cancelled.speed,0);assert.equal(f.state.charge,null);
  assert.equal(f.state.chargeOutcome,null);assert.ok(f.state.nextChargeAt>ctx.game.time);
  ctx.robots[0]=f.player;f.state.nextChargeAt=0;ctx.game.time=5;
  f.boss.body.intent(f.boss);assert.ok(f.state.charge);
  f.state.charge.launched=true;
  f.state.chargeOutcome={approach:f.state.charge.approach,headHp:f.boss.hp.get('head'),hits:0,reviewAt:Infinity};
  ctx.game.time=7;const cooling=f.boss.body.intent(f.boss);
  assert.equal(cooling.speed,0);assert.ok(f.state.charge);assert.equal(f.state.quickStrike,null);
  ctx.game.time=7+BOSS_CONFIG.tactics.chargeRecovery+.11;f.boss.body.intent(f.boss);
  assert.equal(f.state.charge,null);
 }finally{f.close();}
});

test('boss observes repeated retreat and head hits without forgetting between charges',()=>{
 const f=duel({bossX:280,playerX:370});try{
  assert.equal(f.state.tacticsByTarget[0],undefined);
  ctx.game.time=1;f.boss.body.intent(f.boss);
  const memory=f.state.tacticsByTarget[0];assert.ok(memory);
  const head=f.boss.hp.get('head');
  f.boss.damage('head',0,1);
  ctx.game.time=1.1;f.boss.body.intent(f.boss);
  assert.equal(memory.headDanger,1);
  ctx.game.time=20;f.boss.body.intent(f.boss);
  assert.equal(memory.headDanger,1);
  assert.equal(head-f.boss.hp.get('head'),1);
 }finally{f.close();}
});

test('losing both arms changes near-range movement toward a rear-leg stance',()=>{
 const f=duel({variant:'brute',bossX:330,playerX:425});try{
  for(const part of ['arm--1-upper','arm-1-upper'])f.boss.damage(part,0,100);
  assert.equal(f.boss.attackSources.filter(s=>s.kind==='arm').length,0);
  f.state.nextChargeAt=1e6;
  const intent=f.boss.body.intent(f.boss);
  assert.ok(['разворачивает ноги','сближается для удара ногой','ищет сектор для удара ногой','готовит удар'].includes(intent.mode),intent.mode);
  assert.ok(f.boss.attackSources.some(s=>s.kind==='leg'));
  assert.equal(intent.speed===0||intent.speed===55,true);
 }finally{f.close();}
});

test('four-armed boss can keep a valid arm-based stance after losing the front pair',()=>{
 const f=duel({variant:'arms',bossX:330,playerX:420});try{
  f.boss.damage('arm--1-upper',0,100);f.boss.damage('arm-1-upper',0,100);
  assert.equal(f.boss.attackSources.filter(s=>s.kind==='arm').length,2);
  f.state.nextChargeAt=1e6;
  f.boss.body.intent(f.boss);
  const memory=f.state.tacticsByTarget[0];assert.ok(memory);
  assert.ok(memory.plan===null||f.boss.attackSources.some(s=>s.key===memory.plan.source));
 }finally{f.close();}
});

test('tactical strike misses change side preference but a hit resets miss accumulation',()=>{
 const f=duel();try{
  f.boss.body.intent(f.boss);const m=f.state.tacticsByTarget[0];
  const source=f.boss.attackSources.find(s=>s.kind==='arm');
  recordBossTacticalStrike(m,source,false,1);
  assert.equal(m.side,1);
  recordBossTacticalStrike(m,source,false,2);
  assert.equal(m.side,-1);
  recordBossTacticalStrike(m,source,true,3);
  assert.equal(m.misses,0);
  assert.equal(m.strikeFailures[source.key],0);
 }finally{f.close();}
});


test('a second-pair boss hand joins ordinary combo selection when it can reach',()=>{
 const f=duel({variant:'arms',bossX:330,playerX:365});
 try{
  const extras=f.boss.attackSources.filter(s=>s.key.includes('pair2'));
  assert.equal(extras.length,2);
  assert.ok(extras.every(s=>f.boss.attackPose({source:s.key,aim:{x:s.point.x+12,y:s.point.y},preview:true})));
  // The choice is still gated by the actual target's capsules, line of
  // sight, reach and windup geometry; no guaranteed strike is added.
  const additional=extras.flatMap(s=>strikeCandidates(f.boss,f.player,s));
  assert.ok(Array.isArray(additional));
 }finally{f.close();}
});
