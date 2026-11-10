import test from 'node:test';
import assert from 'node:assert/strict';
import {updateHead} from '../src/robot/locomotion.js';
import {strikePriority} from '../src/systems/combat.js';
import {ctx} from '../src/game/state.js';

test('tracking always respects neck limit even with a target behind the body',()=>{
  const saved={HEAD_LIMIT:ctx.HEAD_LIMIT,TRACK_SPEED:ctx.TRACK_SPEED,SCAN_SPEED:ctx.SCAN_SPEED,scale:ctx.scale};
  ctx.HEAD_LIMIT=Math.PI/6;ctx.TRACK_SPEED=Math.PI;ctx.SCAN_SPEED=Math.PI/18;ctx.scale=1;
  const state={
    chest:{x:100,y:100,angle:0},
    gazeYaw:0,look:0,scanAngle:0,scanDirection:1,headMotion:0,
    headFrame:{x:100,y:100,angle:0},
    currentIntent:{lookPoint:{x:0,y:100}},
    local(s,a,b){return {x:s.x+a*Math.cos(s.angle)-b*Math.sin(s.angle),y:s.y+a*Math.sin(s.angle)+b*Math.cos(s.angle)};},
    headFrameAt(yaw){return {x:100-14*Math.cos(yaw),y:100-14*Math.sin(yaw),angle:yaw};},
    clearCircle(){return true;}
  };
  try{
    for(let i=0;i<100;i++){
      state.chest.angle=i*.045;
      updateHead(state,1/60);
      assert.ok(Math.abs(state.look)<=ctx.HEAD_LIMIT+1e-9,
        'head must not twist beyond physical limit');
      assert.ok(Math.abs(Math.atan2(Math.sin(state.gazeYaw-state.chest.angle),
        Math.cos(state.gazeYaw-state.chest.angle)))<=ctx.HEAD_LIMIT+1e-9);
    }
    state.currentIntent.lookPoint=null;
    for(let i=0;i<200;i++){updateHead(state,1/60);assert.ok(Math.abs(state.look)<=ctx.HEAD_LIMIT+1e-9);}
  }finally{Object.assign(ctx,saved);}
});

test('arms and legs outrank a valid head-butt; the head remains selectable alone',()=>{
  const arm={score:60,source:{kind:'arm'}},leg={score:70,source:{kind:'leg'}},
    head={score:0,source:{kind:'head'}};
  assert.ok(strikePriority(arm)<strikePriority(head));
  assert.ok(strikePriority(leg)<strikePriority(head));
  assert.equal([head].sort((a,b)=>strikePriority(a)-strikePriority(b))[0],head);
});
