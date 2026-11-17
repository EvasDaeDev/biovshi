import test from 'node:test';
import assert from 'node:assert/strict';
import {createSkinReadiness} from '../src/render/skin-readiness.js';

test('modified body stays in fallback until every torso and arm cell has loaded',()=>{
 let ready=0,failed=0;
 const gate=createSkinReadiness(['head','spine-0','spine-1','arm-1-upper','arm-1-graft-upper'],
  ()=>ready++,()=>failed++);
 for(const key of ['head','spine-0','spine-1','arm-1-upper'])gate.loaded(key);
 assert.equal(ready,0,'one pending graft cell must not hide the body fallback');
 assert.equal(gate.pending,1);
 gate.loaded('arm-1-graft-upper');
 assert.equal(ready,1);
 gate.loaded('head');assert.equal(ready,1,'duplicate events must not reactivate skin');
 assert.equal(failed,0);
});
test('a broken SVG cell does not activate an incompletely skinned patient',()=>{
 let ready=0,failed=0;
 const gate=createSkinReadiness(['head','arm-1-graft-upper'],
  ()=>ready++,()=>failed++);
 gate.failed('arm-1-graft-upper');gate.loaded('head');
 assert.equal(ready,0);
 assert.equal(failed,1);
 assert.equal(gate.failedCount,1);
});
