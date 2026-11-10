import test from 'node:test';
import assert from 'node:assert/strict';
import {headingForIntent,steerTo} from '../src/robot/locomotion.js';

test('stationary melee faces the opponent without chasing a stale navigation waypoint',()=>{
  const robot={x:100,y:100,route:[{x:50,y:50}],routeGoal:{x:50,y:50},routeIndex:0};
  const goal={x:100,y:100};
  const waypoint=steerTo(robot,goal);
  assert.deepEqual(waypoint,goal);
  assert.equal(robot.route.length,0);
  assert.equal(robot.routeGoal,null);
  const desired=headingForIntent(-1.2,robot,waypoint,{
    mode:'атакует',lookPoint:{x:100,y:140}
  });
  assert.ok(Math.abs(desired-Math.PI/2)<1e-9);
});

test('non-attack idle does not spin; movement uses waypoint and distant attack remains directed',()=>{
  const actor={x:100,y:100};
  assert.equal(headingForIntent(.9,actor,actor,{mode:'осматривается',lookPoint:null}),.9);
  assert.equal(headingForIntent(0,actor,{x:80,y:100},{mode:'преследует',lookPoint:{x:140,y:100}}),Math.PI);
  assert.equal(headingForIntent(0,actor,{x:100,y:140},{mode:'атакует',lookPoint:{x:140,y:100}}),0);
});
