import test from 'node:test';
import assert from 'node:assert/strict';
import { ROBOT_PARTS, skinMatrix } from '../src/render/robot-skin.js';

test('atlas anchors follow bone endpoints without reflecting or squeezing any part',()=>{
  for(const part of Object.values(ROBOT_PARTS))for(const angle of [0,Math.PI/2,Math.PI,-.73]) {
    const a={x:100,y:80},b={x:a.x+17*Math.cos(angle),y:a.y+17*Math.sin(angle)};
    const [A,B,C,D,E,F]=skinMatrix(a,b,part);
    const apply=x=>({x:A*x+C*32+E,y:B*x+D*32+F});
    for(const [actual,expected] of [[apply(part.from??8),a],[apply(part.to??56),b]]) {
      assert.ok(Math.abs(actual.x-expected.x)<1e-8);
      assert.ok(Math.abs(actual.y-expected.y)<1e-8);
    }
    assert.ok(A*D-B*C>0,'handedness is preserved');
    assert.ok(Math.abs(Math.hypot(A,B)-Math.hypot(C,D))<1e-8,'atlas proportions must be preserved');
  }
  assert.equal(Object.keys(ROBOT_PARTS).length,13);
  for(const [key,part] of Object.entries(ROBOT_PARTS)) {
    if(key.startsWith('spine-'))assert.deepEqual([part.from,part.to],[8,32]);
    if(/^(arm|leg)/.test(key))assert.deepEqual([part.from??8,part.to??56],[8,56]);
  }
});
