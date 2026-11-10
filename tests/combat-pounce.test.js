import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {pounceContactSegment,pounceOpportunity} from '../src/systems/combat.js';
import {ctx} from '../src/game/state.js';
import {startCombatPounceRetreat} from '../src/robot/scenes.js';

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
});

test('retreat is 30cm backward with unchanged heading and not a teleport to origin',()=>{
  const saved=ctx.game;
  ctx.game={time:14,events:[]};
  const robot={id:0,x:210,y:280,angle:1.2};
  try{
    startCombatPounceRetreat(robot,{direction:{x:0,y:1}});
    assert.equal(robot.leap.kind,'combat-retreat');
    assert.deepEqual(robot.leap.goal,{x:210,y:250});
    assert.deepEqual(robot.leap.direction,{x:0,y:-1});
    assert.equal(robot.angle,1.2);
    assert.equal(robot.leap.started,14);
  }finally{ctx.game=saved;}
});
