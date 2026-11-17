import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {TOWER_MUTATION_IDS} from '../src/tower/mutations.js';
import {TOWER_SURGERY_IDS} from '../src/tower/surgery.js';
import {ASSETS} from '../src/assets/manifest.js';
import {ROBOT_PARTS} from '../src/render/robot-skin.js';
import {TOWER_PATIENT_POSE,renderTowerUpgradePatient} from '../src/tower/upgrade-preview.js';
import {TOWER_MUTATION_ATLAS,TOWER_SURGERY_ATLAS,towerUpgradeAtlas,
 towerUpgradeApplies} from '../src/tower/upgrade-appearance.js';

test('every one of the twenty-three upgrade PNG placeholders is registered for standalone builds',()=>{
 const registered=new Set(Object.values(ASSETS.textures));
 assert.equal(Object.keys(TOWER_MUTATION_ATLAS).length,18);
 assert.equal(Object.keys(TOWER_SURGERY_ATLAS).length,5);
 for(const id of TOWER_MUTATION_IDS)
  assert.ok(registered.has(TOWER_MUTATION_ATLAS[id]),'missing offline asset for '+id);
 for(const id of TOWER_SURGERY_IDS)
  assert.ok(registered.has(TOWER_SURGERY_ATLAS[id]),'missing offline surgery for '+id);
 assert.equal(Object.keys(TOWER_PATIENT_POSE).length,13);
 assert.deepEqual(Object.keys(TOWER_PATIENT_POSE).sort(),Object.keys(ROBOT_PARTS).sort());
});
test('exact segment surgery wins, installed mutations have stable order, previews do not hide them',()=>{
 const patient={mutations:['servo','piston','optic'],surgeries:[{site:'arm-1-upper',procedure:'impact'}]};
 assert.match(towerUpgradeAtlas(patient,'arm-1-upper'),/ar_surg_impact\.png$/);
 assert.match(towerUpgradeAtlas(patient,'arm--1-lower'),/ar_mod_servo\.png$/);
 assert.match(towerUpgradeAtlas(patient,'head'),/ar_mod_optic\.png$/);
 assert.equal(towerUpgradeAtlas(patient,'leg-1-upper',{previewMutation:'turbo'}),TOWER_MUTATION_ATLAS.servo);
 assert.equal(towerUpgradeAtlas(patient,'leg-1-upper',{previewSurgery:{site:'leg-1-upper',procedure:'drive'}}),TOWER_SURGERY_ATLAS.drive);
 assert.equal(towerUpgradeAtlas({mutations:['piston']},'head'),null);
 assert.equal(towerUpgradeApplies('optic','arm-1-upper'),false);
 assert.equal(towerUpgradeApplies('servo','leg--1-upper'),true);
});
test('horizontal atlas preview makes the thirteen cells selectable with specific surgery highlighting',()=>{
 const dom=new JSDOM('<div id="table"></div>',{url:'https://tower-preview.test/'});
 const previous=globalThis.document;globalThis.document=dom.window.document;
 try{
  const element=document.querySelector('#table');
  const run={patient:2,mutations:['optic'],surgeries:[{site:'arm-1-upper',procedure:'impact'}],
   prosthetics:['leg-1-upper']};
  const selected=[];
  const svg=renderTowerUpgradePatient(element,run,{
   selectedSite:'leg-1-upper',availableSites:['leg-1-upper','leg--1-upper'],
   previewSurgery:{site:'leg-1-upper',procedure:'drive'},
   onSelect:site=>selected.push(site)
  });
  assert.equal(svg.getAttribute('data-tower-patient-pose'),'horizontal');
  assert.match(svg.getAttribute('aria-label'),/головой вправо/);
  assert.equal(svg.querySelectorAll('[data-upgrade-site]').length,13);
  const leg=svg.querySelector('[data-upgrade-site="leg-1-upper"]');
  assert.equal(leg.getAttribute('data-upgrade-selected'),'true');
  assert.match(leg.querySelector('image').getAttribute('href'),/ar_surg_drive\.png$/);
  assert.match(svg.querySelector('[data-upgrade-site="arm-1-upper"] image').getAttribute('href'),/ar_surg_impact\.png$/);
  assert.match(svg.querySelector('[data-upgrade-site="head"] image').getAttribute('href'),/ar_mod_optic\.png$/);
  assert.match(svg.querySelector('[data-upgrade-site="spine-3"] image').getAttribute('href'),/r_03\.png$/);
  leg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  assert.deepEqual(selected,['leg-1-upper']);
  const head=svg.querySelector('[data-upgrade-site="head"]');
  assert.equal(head.getAttribute('aria-disabled'),'true');
  head.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  assert.deepEqual(selected,['leg-1-upper'],'unavailable segment is not selectable');
 }finally{globalThis.document=previous;dom.window.close();}
});
