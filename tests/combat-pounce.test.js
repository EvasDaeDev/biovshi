import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {pounceContactSegment,pounceOpportunity} from '../src/systems/combat.js';
import {ctx} from '../src/game/state.js';
import {startCombatPounceRetreat,jumpTick} from '../src/robot/scenes.js';

test('combat pounce settings give a 20% chance at 60-100cm and fixed 2HP',()=>{
  assert.equal(CONFIG.attack.combatPounceChance,.2);
  assert.equal(CONFIG.attack.combatPounceMinCm,60);
  assert.equal(CONFIG.attack.combatPounceMaxCm,100);
  assert.equal(CONFIG.attack.combatPounceDamage,2);
  assert.equal(CONFIG.attack.combatPounceRetreatCm,30);
  assert.equal(CONFIG.attack.combatPounceRecoverSec,.4);
});

test('head collision sweep selects actual segment, never fabricates hits',()=>{
  const target=[{segment:'spine-1',a:{x:40,y:-5},b:{x:40,y:5},r:6},
                {segment:'head',a:{x:90,y:20},b:{x:90,y:20},r:7}];
  assert.equal(pounceContactSegment({x:0,y:0},{x:80,y:0},target), 'spine-1');
  assert.equal(pounceContactSegment({x:0,y:45},{x:80,y:45},target), null);
  assert.equal(pounceContactSegment({x:0,y:0},{x:80,y:0},target,k=>k==='head'),null);
  // Peer collision stops the head at about 13cm from the victim's
  // capsule surface. This must count as impact, not as a miss.
  const edge=[{segment:'head',a:{x:30,y:0},b:{x:30,y:0},r:8}];
  assert.equal(pounceContactSegment({x:0,y:0},{x:9,y:0},edge),'head');
  assert.equal(pounceContactSegment({x:0,y:0},{x:8,y:0},edge),null);
});

test('retreat is 30cm backward with unchanged heading and not a teleport to origin',()=>{
  const saved=ctx.game;
  ctx.game={time:14,events:[]};
  const robot={id:0,x:210,y:280,angle:1.2};
  try{
    startCombatPounceRetreat(robot,{direction:{x:0,y:1}});
    assert.equal(robot.leap.kind,'combat-retreat');
    assert.deepEqual(robot.leap.goal,{x:210,y:250});
    assert.equal(Math.abs(robot.leap.direction.x),0);
    assert.equal(robot.leap.direction.y,-1);
    assert.equal(robot.angle,1.2);
    assert.equal(robot.leap.started,14);
  }finally{ctx.game=saved;}
});

test('full forward leap sounds at actual movement, hops 30cm back and then recovers',()=>{
  const saved=ctx.game;
  ctx.game={time:0,events:[]};
  const startX=260,startY=240;
  const robot={
    id:0,x:startX,y:startY,angle:0,
    chest:{x:startX,y:startY,angle:0},
    spine:Array.from({length:5},()=>({x:startX,y:startY})),
    pelvis:{x:startX,y:startY},headFrame:{x:startX+20,y:startY},
    leap:{kind:'combat-pounce',started:0,launched:true,impactDone:false,
      direction:{x:1,y:0},goal:{x:startX+75,y:startY}},
    allLimbs:()=>[],savePose(){return{x:this.x,y:this.y};},
    mixPose(){},updateTail(){},rigClear(){return true;},
    updateHead(){},makeCapsules(){return[];},api:{capsules:[]}
  };
  const intent={mode:'преследует',speed:0,goal:{x:startX+75,y:startY},lookPoint:null};
  try{
    for(let i=1;i<=90;i++){
      ctx.game.time=i/60;
      if(robot.leap)jumpTick(robot,1/60,intent);
    }
    assert.equal(robot.leap,null,'the retreat must finish');
    assert.ok(Math.abs(robot.x-(startX+45))<.01,
      'the fighter advances 75cm and backs up only 30cm');
    assert.equal(robot.y,startY);
    assert.equal(robot.angle,0,'the fighter never rotates to retreat');
    assert.ok(robot.combatRecoveryUntil>ctx.game.time-.4);
    assert.equal(ctx.game.events.filter(e=>e.type==='pounce-launch').length,1);
    assert.equal(ctx.game.events.filter(e=>e.type==='pounce-retreat').length,1);
    assert.equal(ctx.game.events.filter(e=>e.type==='footstep').length,1);
  }finally{ctx.game=saved;}
});
