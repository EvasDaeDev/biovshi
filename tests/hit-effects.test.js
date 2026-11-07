import test from 'node:test';
import assert from 'node:assert/strict';
import { hitParticle } from '../src/render/hit-effects.js';

test('retro spray is deterministic, travels away from the hit and strengthens on severing',()=>{
  const original=Math.random;Math.random=()=>{throw new Error('visuals must not use RNG');};
  try {
    for(const angle of [0,Math.PI/2,Math.PI,-.73])for(let i=0;i<14;i++) {
      const p=hitParticle(42,i,angle,false),strong=hitParticle(42,i,angle,true);
      assert.deepEqual(hitParticle(42,i,angle,false),p);
      assert.ok(p.vx*Math.cos(angle)+p.vy*Math.sin(angle)>0);
      assert.ok(Number.isInteger(p.width)&&Number.isInteger(p.height));
      assert.ok(strong.life>p.life);
      assert.ok(Math.hypot(strong.vx,strong.vy+35)>Math.hypot(p.vx,p.vy+35));
    }
  } finally {Math.random=original;}
});
