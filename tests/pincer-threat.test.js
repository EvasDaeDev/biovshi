import test from 'node:test';
import assert from 'node:assert/strict';
import {pincerThreat} from '../src/systems/ai.js';

const patient={id:0,x:350,y:350};
const armed=(x,y,angle=0)=>({
  x,y,angle,mobile:true,
  attackSources:[{kind:'arm',key:'arm--1-lower'}]
});

test('encirclement radius uses 60 + closeRange = 92..104 cm',()=>{
  for(const closeRange of [32,38,44]){
    const radius=60+closeRange;
    assert.ok(pincerThreat(patient,armed(350+radius-.01,350,Math.PI),radius,true));
    assert.equal(pincerThreat(patient,armed(350+radius,350,Math.PI),radius,true),false);
    assert.equal(pincerThreat(patient,armed(350+radius+10,350,Math.PI),radius,true),false);
  }
});

test('off-screen, obstructed, unarmed and unthreatening opponents never trigger pincer',()=>{
  const foe=armed(420,350,Math.PI);
  assert.equal(pincerThreat(patient,foe,98,false),false,'not visible, including behind obstacles');
  assert.equal(pincerThreat(patient,{...foe,attackSources:[]},98,true),false);
  assert.equal(pincerThreat(patient,{...foe,mobile:false},98,true),false);
  assert.equal(pincerThreat(patient,armed(420,350,0),98,true),false,'enemy running away');
  assert.equal(pincerThreat(patient,armed(420,350,0),98,true,true),true,
    'active strike toward this patient is a threat even when the torso faces away');
});

test('a close armed opponent facing the patient is a real threat',()=>{
  assert.equal(pincerThreat(patient,armed(420,350,Math.PI),98,true),true);
  assert.equal(pincerThreat(patient,armed(350,420,-Math.PI/2),98,true),true);
});
