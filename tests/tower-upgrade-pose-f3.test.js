import test from 'node:test';
import assert from 'node:assert/strict';
import {towerUpgradePose,towerPoseFit} from '../src/tower/upgrade-pose.js';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';
import {ROBOT_PARTS} from '../src/render/robot-skin.js';
import {CONFIG} from '../src/config.js';
test('normal patient preview contains all thirteen atlas pieces',()=>{
 const pose=towerUpgradePose(null);
 assert.deepEqual(Object.keys(pose).sort(),Object.keys(ROBOT_PARTS).sort());
 for(const [key,coords] of Object.entries(pose)){
  assert.equal(coords.length,2,key);assert.ok(coords.flat().every(Number.isFinite),key);
 }
});
test('surgical preview adds real grafts and a spine segment',()=>{
 const run={surgeries:[{site:'arm-1-upper',procedure:'graft_arm'},
  {site:'leg--1-upper',procedure:'graft_leg'},
  {site:'spine-2',procedure:'extend_spine'}]};
 const body=towerPatientAnatomy(run),pose=towerUpgradePose(run);
 assert.deepEqual(Object.keys(pose).sort(),body.segments.slice().sort());
 assert.equal(Object.keys(pose).length,18);
 assert.equal(pose['spine-4'][0][0],226);
 assert.ok(pose['leg--1-graft-upper'][0][1]<100);
 assert.match(towerPoseFit(pose),/^translate\([\d.\-]+ [\d.\-]+\) scale\([\d.]+\)$/);
});
test('extra arm changes preview, without altering opposite arm',()=>{
 const normal=towerUpgradePose(null);
 const graft=towerUpgradePose({surgeries:[{site:'arm-1-upper',procedure:'graft_arm'}]});
 assert.equal(Object.keys(normal).length,13);assert.equal(Object.keys(graft).length,15);
 assert.deepEqual(normal['arm--1-upper'],graft['arm--1-upper']);
});
test('lengthening affects real IK limb geometry',async()=>{
 const {lengths}=await import('../src/robot/kinematics.js');
 const {CONFIG}=await import('../src/config.js');
 const body=towerPatientAnatomy({surgeries:[{site:'arm-1-upper',procedure:'lengthen_arm'}]});
 const changed=body.limbs.find(l=>l.key==='arm-1'),normal=body.limbs.find(l=>l.key==='arm--1');
 assert.equal(changed.lengthScale,1.2);
 const baseline=lengths({scale:CONFIG.robot.scale},normal);
 assert.ok(Math.abs(baseline[0]-15.176256662989397)<1e-7);
 assert.ok(Math.abs(baseline[1]-19.16528032449229)<1e-7);
 assert.deepEqual(lengths({scale:CONFIG.robot.scale},changed),baseline.map(length=>length*1.2));
});

test('preview neck faces right and hands attach to offset shoulders rather than spine centre',()=>{

 const unit=CONFIG.robot.scale*3.2,base=towerUpgradePose(null);
 const chest=base['spine-0'][0],pelvis=base['spine-3'][1];
 const head=base.head;
 assert.ok(head[1][0]>head[0][0],'atlas head anchor points toward the right');
 assert.deepEqual(base['arm-1-upper'][0],[chest[0],chest[1]+12*unit]);
 assert.deepEqual(base['arm--1-upper'][0],[chest[0],chest[1]-12*unit]);
 assert.deepEqual(base['leg-1-upper'][0],[pelvis[0]-5*unit,pelvis[1]+12*unit]);
 assert.deepEqual(base['leg--1-upper'][0],[pelvis[0]-5*unit,pelvis[1]-12*unit]);
 const extra=towerUpgradePose({surgeries:[{site:'arm-1-upper',procedure:'graft_arm'}]});
 const anchor=extra['spine-1'][0];
 assert.deepEqual(extra['arm-1-graft-upper'][0],[anchor[0]+3*unit,anchor[1]+15*unit]);
});
