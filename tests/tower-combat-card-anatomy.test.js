import test from 'node:test';
import assert from 'node:assert/strict';
import {portraitBonesForBody,PORTRAIT_BONES} from '../src/ui/patient-portrait.js';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';

const bone=(bones,key)=>bones.find(part=>part.key===key);
test('ordinary fighters retain the original 13-piece portrait',()=>{
 assert.equal(portraitBonesForBody(null),PORTRAIT_BONES);
 assert.equal(PORTRAIT_BONES.length,13);
});
test('surgically attached arm starts at spine anchor, not original shoulder',()=>{
 const body=towerPatientAnatomy({surgeries:[{procedure:'graft_arm',site:'arm-1-upper'}]});
 const parts=portraitBonesForBody(body);
 assert.equal(parts.length,15);
 const normal=bone(parts,'arm-1-upper'),extra=bone(parts,'arm-1-graft-upper');
 assert.ok(normal&&extra);
 assert.notDeepEqual(extra.a,normal.a);
 assert.ok(extra.a.x<normal.a.x,'extra arm originates farther along the spine');
 assert.equal(extra.a.x,-7,'spine-1 shoulder anchor');
 assert.equal(extra.part,body.skinParts[extra.key]);
 assert.equal(portraitBonesForBody(body),parts,'cached coordinates remain stable');
});
test('spine extension and leg graft appear at the actual additional anchor',()=>{
 const body=towerPatientAnatomy({surgeries:[{procedure:'extend_spine',site:'spine-2'},
  {procedure:'graft_leg',site:'leg--1-upper'}]});
 const parts=portraitBonesForBody(body);
 assert.equal(parts.length,16);
 assert.ok(bone(parts,'spine-4'));
 const extra=bone(parts,'leg--1-graft-upper'),normal=bone(parts,'leg--1-upper');
 assert.notDeepEqual(extra.a,normal.a);
 assert.equal(extra.a.x,-35,'extra leg is anchored to spine-3');
});
test('lengthening moves hand endpoint in combat card too',()=>{
 const body=towerPatientAnatomy({surgeries:[{procedure:'lengthen_arm',site:'arm-1-upper'}]});
 const parts=portraitBonesForBody(body);
 const base=bone(PORTRAIT_BONES,'arm-1-lower'),long=bone(parts,'arm-1-lower');
 assert.ok(Math.hypot(long.b.x-long.a.x,long.b.y-long.a.y)>
  Math.hypot(base.b.x-base.a.x,base.b.y-base.a.y));
});
