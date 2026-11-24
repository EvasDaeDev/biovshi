import test from 'node:test';
import assert from 'node:assert/strict';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';
import {towerSurgeryAvailableSites,validTowerSurgeries} from '../src/tower/surgery.js';
import {newTower,towerFor,buyTowerSurgery,buyTowerInsurance,completeTower} from '../src/tower/model.js';
import {betNewSession} from '../src/betting/ledger.js';

test('F3 grafts reuse combat rig segments, parents and atlas mapping',()=>{
 const baseline=newTower(0);
 assert.equal(towerPatientAnatomy(baseline),null);
 baseline.level=16;baseline.wins=15;baseline.record=15;
 baseline.surgeries=[
  {site:'arm-1-upper',procedure:'graft_arm'},
  {site:'leg--1-upper',procedure:'graft_leg'},
  {site:'spine-2',procedure:'extend_spine'}
 ];
 assert.equal(validTowerSurgeries(baseline.surgeries,baseline.level),true);
 const body=towerPatientAnatomy(baseline);
 assert.equal(body.spineSegments,5);
 assert.equal(body.pelvisKey,'spine-4');
 assert.equal(body.limbs.length,6);
 assert.ok(body.segments.includes('arm-1-graft-upper'));
 assert.ok(body.segments.includes('arm-1-graft-lower'));
 assert.ok(body.segments.includes('leg--1-graft-upper'));
 assert.ok(body.segments.includes('spine-4'));
 assert.equal(body.parent.get('arm-1-graft-lower'),'arm-1-graft-upper');
 assert.equal(body.parent.get('leg--1-graft-upper'),'spine-3');
 assert.deepEqual(body.skinParts['arm-1-graft-upper'],body.skinParts['arm-1-upper']);
 assert.ok(body.skinParts['spine-4']);
});
test('F3 rejects lower-limb grafts and leaves other modes with ordinary rig',()=>{
 const run=newTower(0);run.level=6;run.wins=5;run.record=5;
 assert.deepEqual(towerSurgeryAvailableSites(run,'graft_arm').sort(),['arm--1-upper','arm-1-upper']);
 assert.deepEqual(towerSurgeryAvailableSites(run,'graft_leg').sort(),['leg--1-upper','leg-1-upper']);
 assert.equal(validTowerSurgeries([{site:'arm-1-lower',procedure:'graft_arm'}],6),false);
 assert.equal(validTowerSurgeries([{site:'leg-1-lower',procedure:'graft_leg'}],6),false);
 assert.equal(validTowerSurgeries([{site:'spine-1',procedure:'extend_spine'}],6),true);
 assert.equal(validTowerSurgeries([{site:'arm-1-upper',procedure:'graft_arm'},
  {site:'arm-1-upper',procedure:'graft_arm'}],11),false);
 const withOne={...run,surgeries:[{site:'arm-1-upper',procedure:'graft_arm'}]};
 assert.equal(towerPatientAnatomy(withOne).spineSegments,4);
 assert.equal(towerPatientAnatomy(withOne).limbs.length,5);
 assert.equal(towerPatientAnatomy(newTower(0)),null);
});

test('F3 graft purchase is charged once and anatomy persists through DMS restore',()=>{
 const session=betNewSession(['Хирург'],1000);
 const run=towerFor(session,0);
 Object.assign(run,{level:11,wins:10,record:10,preparing:true});
 const before=session.players[0].balance;
 assert.equal(buyTowerSurgery(session,0,'graft_arm','arm-1-upper'),600);
 assert.equal(session.players[0].balance,before-600);
 assert.equal(session.surgerySpent,600);
 assert.equal(towerPatientAnatomy(run).limbs.length,5);
 assert.throws(()=>buyTowerSurgery(session,0,'graft_arm','arm-1-upper'),/недоступна/);
 assert.equal(buyTowerInsurance(session,0),300);
 assert.deepEqual(run.insurance.checkpoint.surgeries,run.surgeries);
 const restored=completeTower(session,0,false);
 assert.deepEqual(restored.surgeries,run.surgeries);
 assert.equal(towerPatientAnatomy(restored).limbs.length,5);
 assert.equal(restored.insurance.checkpoint,null);
});
