import test from 'node:test';
import assert from 'node:assert/strict';
import { wavePoint } from '../src/render/floor-warp.js';
import { CONFIG } from '../src/config.js';

test('shockwave displaces radially, keeps arena edges fixed and expires',()=>{
  const pulse={x:350,y:350,time:1},time=1.1;
  const p=wavePoint(414,350,pulse,time),q=wavePoint(286,350,pulse,time);
  assert.ok(p.x>414&&q.x<286);
  assert.equal(p.y,350);
  assert.ok(Math.abs((p.x-414)-(286-q.x))<1e-8);
  assert.deepEqual(wavePoint(350,350,pulse,time),{x:350,y:350});
  for(const [x,y] of [[0,150],[700,350],[150,0],[350,700]])
    assert.deepEqual(wavePoint(x,y,pulse,time),{x,y});
  assert.deepEqual(wavePoint(414,350,pulse,1+CONFIG.effects.waveSec),{x:414,y:350});
});
