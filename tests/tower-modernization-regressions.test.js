import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {installTowerUpgradeWindow} from '../src/tower/upgrade-modal.js';
import {towerUpgradePose} from '../src/tower/upgrade-pose.js';
import {paintPatientPortrait,PORTRAIT_BONES} from '../src/ui/patient-portrait.js';
import {ctx} from '../src/game/state.js';

test('surgery modal does not preview an implant with a missing or stale donor',()=>{
 const dom=new JSDOM('<div id="root"><div id="tower-preparation"></div><div id="stats"></div><div id="mutations"></div><div id="surgery"></div><div id="artifacts"></div></div>',{url:'https://tower-modal.test/'});
 const previous=globalThis.document;globalThis.document=dom.window.document;
 try{
  const root=document.querySelector('#root'),panel=document.querySelector('#surgery');
  panel.innerHTML='<select aria-label="Вид операции"><option value="transplant_arm">Донорская рука</option></select>'+
   '<select aria-label="Сегмент для операции"><option value="arm-1-upper">Правая рука</option></select>'+
   '<select aria-label="Донор для пересадки"><option value="5:1:arm">Старый донор</option></select>';
  const run={level:11,patient:0,stats:[3,3,3],wins:10,
   mutations:[],surgeries:[],donorTissues:[],prosthetics:[],preparing:true};
  const modal=installTowerUpgradeWindow({root,run,statsPanel:document.querySelector('#stats'),
   mutationPanel:document.querySelector('#mutations'),surgeryPanel:panel,artifactPanel:document.querySelector('#artifacts')});
  modal.open('surgery');
  assert.equal(root.querySelectorAll('[data-upgrade-site]').length,13,
   'a stale select must not create a phantom donor arm');
  assert.match(root.querySelector('#tower-upgrade-stats').textContent,/нужен доступный донор/);
  run.donorTissues=[{id:'5:1:arm',profile:'boss',kind:'arm'}];
  panel.querySelector('[aria-label="Донор для пересадки"]').dispatchEvent(new dom.window.Event('change'));
  modal.refresh();
  assert.equal(root.querySelectorAll('[data-upgrade-site]').length,15,
   'a verified available donor previews its extra two segments');
  modal.close();
 }finally{globalThis.document=previous;dom.window.close();}
});

test('player combat card key includes surgery and mutation atlas replacements for torso',()=>{
 const dom=new JSDOM('<canvas width="260" height="112"></canvas>');
 const prev={mode:ctx.mode,robots:ctx.robots,towerGarage:ctx.towerGarage,
  telemetryPortraitsReady:ctx.telemetryPortraitsReady};
 try{
  const patient={patient:0,stats:[3,3,3],prosthetics:[],mutations:['adrenal'],
   surgeries:[{site:'spine-1',procedure:'brace'}]};
  ctx.mode='tower';ctx.robots=[{prosthetics:[]}];ctx.towerGarage=[patient];
  ctx.telemetryPortraitsReady=false;
  const card={portrait:dom.window.document.querySelector('canvas')};
  const states=PORTRAIT_BONES.map(b=>({key:b.key,state:'good',opacity:1}));
  paintPatientPortrait(card,0,states);
  assert.match(card.portraitStateKey,/ar_surg_brace\.png/,'operated spine is in the card atlas list');
  assert.match(card.portraitStateKey,/ar_mod_adrenal\.png/,'other torso segments use mutation atlas');
  assert.equal(card.portraitPaintKey,undefined);
 }finally{Object.assign(ctx,prev);dom.window.close();}
});

test('surgical graft preview keeps both shoulder anchors separate from the spinal axis',()=>{
 const pose=towerUpgradePose({surgeries:[{site:'arm-1-upper',procedure:'graft_arm'}]});
 assert.notEqual(pose['arm-1-upper'][0][1],pose['spine-0'][0][1]);
 assert.notEqual(pose['arm-1-graft-upper'][0][1],pose['spine-1'][0][1]);
 assert.ok(pose.head[0][0]<pose.head[1][0]);
});
