import test from 'node:test';
import assert from 'node:assert/strict';
import {CONFIG} from '../src/config.js';
import {ctx} from '../src/game/state.js';
import {updateHead} from '../src/robot/locomotion.js';

const deg=value=>value*Math.PI/180;
function dummy(){
  return {
    chest:{x:350,y:350,angle:0},
    gazeYaw:0,look:0,scanAngle:0,scanDirection:1,headMotion:0,
    headFrame:{x:350,y:350,angle:0},
    currentIntent:{lookPoint:null},
    local(s,a,b){return{x:s.x+Math.cos(s.angle)*a-Math.sin(s.angle)*b,
                       y:s.y+Math.sin(s.angle)*a+Math.cos(s.angle)*b};},
    headFrameAt(yaw){return{x:350-14*Math.cos(yaw),y:350-14*Math.sin(yaw),angle:yaw};},
    clearCircle(){return true;}
  };
}
test('head turns up to 60 degrees each side with doubled scan and tracking speeds',()=>{
  assert.equal(CONFIG.vision.headScanDeg,60);
  assert.equal(CONFIG.vision.scanSpeedDeg,20);
  assert.equal(CONFIG.vision.trackingSpeedDeg,40);
  const saved={HEAD_LIMIT:ctx.HEAD_LIMIT,TRACK_SPEED:ctx.TRACK_SPEED,SCAN_SPEED:ctx.SCAN_SPEED,scale:ctx.scale};
  Object.assign(ctx,{HEAD_LIMIT:deg(60),TRACK_SPEED:deg(40),SCAN_SPEED:deg(20),scale:1});
  try{
    const r=dummy();
    updateHead(r,1);
    assert.ok(Math.abs(r.look-deg(20))<1e-9,'idle scan must move 20 degrees in one second');
    r.currentIntent.lookPoint={x:350,y:500};
    updateHead(r,1);
    assert.ok(Math.abs(r.look-deg(60))<1e-9,'tracking must move another 40 degrees and reach +60');
    for(let i=0;i<5;i++){updateHead(r,1);assert.ok(Math.abs(r.look)<=deg(60)+1e-9);}
    r.currentIntent.lookPoint={x:350,y:150};
    for(let i=0;i<4;i++)updateHead(r,1);
    assert.ok(Math.abs(r.look+deg(60))<1e-9,'tracking must reach -60 without twisting further');
  }finally{Object.assign(ctx,saved);}
});
