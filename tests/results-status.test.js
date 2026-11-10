import test from 'node:test';
import assert from 'node:assert/strict';
import { resultPatientStatus } from '../src/ui/results.js';

test('battle results distinguish fatal head loss from nonfatal coma',()=>{
  assert.equal(resultPatientStatus({hasHead:false,mobile:false}), 'ПОГИБ');
  assert.equal(resultPatientStatus({hasHead:true,mobile:false}), 'В КОМАТОЗЕ');
  assert.equal(resultPatientStatus({hasHead:true,mobile:true}), 'ПОДВИЖЕН');
  assert.equal(resultPatientStatus({hasHead:true,mobile:true},true), 'ПОБЕДИЛ');
});

test('winner status takes priority; losing consciousness does not count as death',()=>{
  assert.equal(resultPatientStatus({hasHead:true,mobile:false},true),'ПОБЕДИЛ');
  assert.notEqual(resultPatientStatus({hasHead:true,mobile:false}),resultPatientStatus({hasHead:false,mobile:false}));
});
