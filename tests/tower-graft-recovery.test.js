import test from 'node:test';
import assert from 'node:assert/strict';
import {towerGraftSegments,recoverTowerGrafts,normalizeTowerGraftProsthetics} from '../src/tower/anatomy.js';
import {towerFor,buyTowerSurgery,buyTowerInsurance,completeTower} from '../src/tower/model.js';
import {betNewSession} from '../src/betting/ledger.js';
test('graft amputations are prosthetized on victory and insured',()=>{
 const s=betNewSession(['F3'],1000),run=towerFor(s,0);
 Object.assign(run,{level:11,wins:10,record:10,preparing:true});
 buyTowerSurgery(s,0,'graft_arm','arm-1-upper');
 assert.deepEqual(towerGraftSegments(run),['arm-1-graft-upper','arm-1-graft-lower']);
 recoverTowerGrafts(run,{hasHead:true,missingSegments:['arm-1-graft-lower','arm-1-graft-upper']});
 assert.deepEqual(run.graftProsthetics,towerGraftSegments(run));
 assert.deepEqual(normalizeTowerGraftProsthetics(['arm-1-graft-upper','leg-1-graft-upper','spine-5'],run),['arm-1-graft-upper']);
 buyTowerInsurance(s,0);
 assert.deepEqual(run.insurance.checkpoint.graftProsthetics,run.graftProsthetics);
 const restored=completeTower(s,0,false);
 assert.deepEqual(restored.graftProsthetics,run.graftProsthetics);
});
test('new uninsured run loses surgical grafts',()=>{
 const s=betNewSession(['F3'],1000),run=towerFor(s,0);
 Object.assign(run,{level:11,wins:10,record:10,preparing:true});
 buyTowerSurgery(s,0,'graft_leg','leg--1-upper');
 recoverTowerGrafts(run,{hasHead:false,missingSegments:['leg--1-graft-upper']});
 assert.deepEqual(run.graftProsthetics,[]);
 const next=completeTower(s,0,false);
 assert.deepEqual(next.graftProsthetics,[]);
});
