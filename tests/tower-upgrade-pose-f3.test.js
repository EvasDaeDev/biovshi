import test from 'node:test';
import assert from 'node:assert/strict';
import {towerUpgradePose,towerPoseFit} from '../src/tower/upgrade-pose.js';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';
import {ROBOT_PARTS} from '../src/render/robot-skin.js';
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
 assert.deepEqual(lengths({scale:CONFIG.robot.scale},changed),[27*CONFIG.robot.scale*1.2,29*CONFIG.robot.scale*1.2]);
 assert.deepEqual(lengths({scale:CONFIG.robot.scale},normal),[27*CONFIG.robot.scale,29*CONFIG.robot.scale]);
});
