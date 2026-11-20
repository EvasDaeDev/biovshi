import test from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT_PARTS, skinMatrix,recordSegmentHitTint,segmentHitTint,segmentHitTintMatrix,SEGMENT_HIT_TINT,SEGMENT_HIT_TINT_SEC } from '../src/render/robot-skin.js';

test('all spine sprites widen by one third while bone lengths and limb atlas anchors stay fixed',()=>{
  for(const [key,part] of Object.entries(ROBOT_PARTS))for(const angle of [0,Math.PI/2,Math.PI,-.73]) {
    const a={x:100,y:80},b={x:a.x+17*Math.cos(angle),y:a.y+17*Math.sin(angle)};
    const [A,B,C,D,E,F]=skinMatrix(a,b,part);
    const apply=x=>({x:A*x+C*32+E,y:B*x+D*32+F});
    for(const [actual,expected] of [[apply(part.from??8),a],[apply(part.to??56),b]]) {
      assert.ok(Math.abs(actual.x-expected.x)<1e-8);
      assert.ok(Math.abs(actual.y-expected.y)<1e-8);
    }
    assert.ok(A*D-B*C>0,'handedness is preserved');
    const widthScale=/^spine-[0-3]$/.test(key)?4/3:1;
    assert.ok(Math.abs(Math.hypot(C,D)/Math.hypot(A,B)-widthScale)<1e-8,'only the four spine sprites are one third wider');
  }
  assert.equal(Object.keys(ROBOT_PARTS).length,13);
  for(const [key,part] of Object.entries(ROBOT_PARTS)) {
    if(key==='head')assert.deepEqual([part.from,part.to],[33,8]);
    if(key==='spine-0')assert.deepEqual([part.from,part.to],[30,54]);
    if(/^spine-[123]$/.test(key))assert.deepEqual([part.from,part.to],[8,32]);
    if(/^(arm|leg)/.test(key))assert.deepEqual([part.from??8,part.to??56],[8,56]);
  }
});

test('ordinary damage tints only the exact struck segment, not its descendants or siblings',()=>{
 const robot={};
 recordSegmentHitTint(robot,'arm-1-upper',2,1);
 assert.deepEqual([...robot.segmentHitTints.keys()],['arm-1-upper']);
 assert.equal(robot.segmentHitTints.has('arm-1-lower'),false,'child bone is not tinted');
 assert.equal(robot.segmentHitTints.has('arm--1-upper'),false,'opposite limb is not tinted');
 assert.equal(segmentHitTint(2,robot.segmentHitTints.get('arm-1-upper')),SEGMENT_HIT_TINT);
 assert.ok(Math.abs(segmentHitTint(2+SEGMENT_HIT_TINT_SEC/2,2)-.075)<1e-10);
 assert.equal(segmentHitTint(2+SEGMENT_HIT_TINT_SEC,2),0);
 recordSegmentHitTint(robot,'head',3,1);
 assert.deepEqual([...robot.segmentHitTints.keys()],['arm-1-upper','head']);
 recordSegmentHitTint(robot,'arm-1-upper',4,1);
 assert.equal(robot.segmentHitTints.get('arm-1-upper'),4,'repeat hit restarts one bone fade');
 recordSegmentHitTint(robot,'head',5,2);
 assert.equal(robot.segmentHitTints.has('head'),false,'critical effect does not stack with normal tint');
 assert.equal(robot.segmentHitTints.has('arm-1-upper'),true,'other segments stay independent');
});

test('red tint blends source colour at exactly 15 percent without changing alpha',()=>{
 assert.equal(SEGMENT_HIT_TINT,.15);
 const matrix=segmentHitTintMatrix(SEGMENT_HIT_TINT);
 const rgba=[.4,.6,.8,1];
 const apply=row=>rgba.reduce((sum,v,i)=>sum+matrix[row*5+i]*v,0)+matrix[row*5+4];
 assert.ok(Math.abs(apply(0)-(.4*.85+.15))<1e-12);
 assert.ok(Math.abs(apply(1)-(.6*.85))<1e-12);
 assert.ok(Math.abs(apply(2)-(.8*.85))<1e-12);
 assert.equal(apply(3),1,'source transparency is unchanged');
 const untouched=segmentHitTintMatrix(0);
 assert.deepEqual(untouched,[1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,1,0]);
});
