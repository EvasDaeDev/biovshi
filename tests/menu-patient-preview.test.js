import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {renderMenuPatient,menuPatientTransform,menuPatientPose,menuPatientFramePose,menuRaisedContactOffset,startMenuPatientIdle,stopMenuPatientIdle} from '../src/ui/menu-patient-preview.js';
import {towerUpgradePose} from '../src/tower/upgrade-pose.js';

const svgSetup=()=>new JSDOM('<main id="menu-patient-preview"></main>',{url:'https://test.local/'});

test('menu uses real Tower atlas, shared surgery pose, grafts and equipped segment skins',()=>{
 const dom=svgSetup(),old=globalThis.document;
 globalThis.document=dom.window.document;
 try{
  const run={
   patient:2,
   surgeries:[{site:'arm-1-upper',procedure:'graft_arm'},{site:'leg--1-upper',procedure:'graft_leg'}],
   prosthetics:['arm--1-upper'],
   graftProsthetics:['arm-1-graft-lower'],
   segmentInventory:[{id:'seg1',type:'piston',site:'arm-1-upper',rarity:0}],
   equippedSegments:['seg1'],mutations:[]
  };
  const host=document.getElementById('menu-patient-preview');
  const svg=renderMenuPatient(host,run);
  assert.equal(svg.getAttribute('data-menu-patient'),'true');
  assert.equal(svg.querySelectorAll('[data-menu-site]').length,Object.keys(towerUpgradePose(run)).length);
  assert.ok(svg.querySelector('[data-menu-site="arm-1-graft-upper"]'));
  assert.ok(svg.querySelector('[data-menu-site="leg--1-graft-lower"]'));
  const atlas=site=>svg.querySelector('[data-menu-site="'+site+'"] image')?.getAttribute('href');
  assert.match(atlas('arm-1-upper'),/ar_mod_piston\.png/);
  assert.match(atlas('arm--1-upper'),/ar_01\.png/);
  assert.match(atlas('head'),/r_03\.png/);
  assert.match(svg.querySelector('g[transform]')?.getAttribute('transform')??'',/rotate\(-/);
  assert.match(menuPatientTransform(towerUpgradePose(run)),/scale\(/);
 }finally{globalThis.document=old;dom.window.close();}
});

test('menu preview updates with selected player and does not use stale atlas references',()=>{
 const dom=svgSetup(),old=globalThis.document;
 globalThis.document=dom.window.document;
 try{
  const target=document.getElementById('menu-patient-preview');
  renderMenuPatient(target,{patient:0,surgeries:[],mutations:[]});
  assert.match(target.querySelector('[data-menu-site="head"] image').getAttribute('href'),/r_01\.png/);
  renderMenuPatient(target,{
   patient:1,surgeries:[{site:'spine-1',procedure:'brace'}],mutations:[]});
  assert.equal(target.querySelectorAll('svg[data-menu-patient]').length,1);
  assert.match(target.querySelector('[data-menu-site="head"] image').getAttribute('href'),/r_02\.png/);
  assert.match(target.querySelector('[data-menu-site="spine-1"] image').getAttribute('href'),/ar_surg_brace\.png/);
  renderMenuPatient(target,null);
  assert.equal(target.hidden,true);
  assert.equal(target.children.length,0);
 }finally{globalThis.document=old;dom.window.close();}
});

test('menu sketch pose spreads limbs while preserving actual bone lengths and graft anchors',()=>{
 const run={surgeries:[{site:'arm-1-upper',procedure:'graft_arm'},{site:'leg--1-upper',procedure:'graft_leg'}]};
 const base=towerUpgradePose(run),pose=menuPatientPose(run);
 const length=segment=>Math.hypot(segment[1][0]-segment[0][0],segment[1][1]-segment[0][1]);
 for(const [site,points] of Object.entries(base)){
  assert.ok(pose[site],'all real bones remain in the menu');
  assert.ok(Math.abs(length(pose[site])-length(points))<1e-8,'unchanged segment length: '+site);
  if(/^(arm|leg)-.*-upper$/.test(site))
   assert.deepEqual(pose[site][0],points[0],'shoulder or hip attachment stays fixed: '+site);
 }
 // Evaluate the displayed directions after the same -30 degree rotation used
 // by menuPatientTransform. Right arm reaches right, left arm points up-left.
 const angle=site=>{
  const [a,b]=pose[site],dx=b[0]-a[0],dy=b[1]-a[1];
  return Math.atan2(dy,dx)*180/Math.PI-30;
 };
 assert.ok(angle('arm--1-upper')<-110,'left arm points above and left of the body');
 assert.ok(angle('arm-1-upper')>-15&&angle('arm-1-upper')<50,'right arm stretches out');
 // Feet now sit 15 cm higher than the original sketch; their former
 // upper-bone angles are intentionally no longer invariant. The contact
 // elevation and bone lengths are checked in the dedicated test below.
 assert.ok(pose['arm-1-graft-upper'],'additional graft follows the display pose');
 assert.ok(pose['leg--1-graft-lower'],'surgical graft remains visible');
});

test('menu placement and idle style integrate with existing CSS; reduced motion supported',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const css=fs.readFileSync(new URL('../styles/ui-redesign.css',import.meta.url),'utf8');
 assert.match(html,/<select id="menu-player"[^>]*><\/select>\s*<span id="menu-patient-preview"/);
 assert.match(css,/#robot-tag-hops-v22 #launch-overlay \.menu-patient-preview > svg\s*\{[^}]*overflow:hidden;/,
  'the main patient SVG is kept inside its menu viewport');
 assert.match(css,/#robot-tag-hops-v22 #launch-overlay \.menu-patient-preview svg svg\s*\{[^}]*overflow:hidden;/,
  'nested per-part atlas viewports must clip to their 64x64 texture cell');
 assert.doesNotMatch(css,/#robot-tag-hops-v22 #launch-overlay \.menu-patient-preview svg\s*\{[^}]*overflow:visible;/,
  'never expose full 4x4 atlases inside a menu patient');
 assert.match(css,/grid-template-columns:auto minmax\(0,1fr\) 146px auto/,'preview has room to display the full patient');
 assert.match(css,/\.menu-patient-idle\s*\{[^}]*transform:none;/);
 assert.doesNotMatch(css,/@keyframes\s+menu-patient-idle/,'full-body motion would unpin hands and feet');
});

test('idle locks every hand and foot tip including grafts while torso moves',()=>{
 const run={surgeries:[{site:'arm-1-upper',procedure:'graft_arm'},{site:'leg--1-upper',procedure:'graft_leg'},
  {site:'spine-2',procedure:'extend_spine'}]};
 const base=menuPatientPose(run),moving=menuPatientFramePose(base,Math.PI/2);
 assert.notDeepEqual(moving['spine-0'][0],base['spine-0'][0]);
 for(const site of Object.keys(base).filter(s=>/^(arm|leg)-.*-lower$/.test(s))){
  assert.deepEqual(moving[site][1],base[site][1],site+' contact stays planted');
  const upperKey=site.slice(0,-5)+'upper';
  assert.deepEqual(moving[upperKey][1],moving[site][0],'joint stays connected: '+site);
  for(const key of [site,upperKey]){
   const length=points=>Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]);
   assert.ok(Math.abs(length(base[key])-length(moving[key]))<1e-6,'bone length preserved: '+key);
  }
 }
});

test('menu idle only updates existing bone transforms and stops when menu is hidden',()=>{
 const dom=svgSetup(),prior=globalThis.document;
 const oldFrame=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame,oldMedia=globalThis.matchMedia;
 const frames=new Map();let serial=0;
 globalThis.document=dom.window.document;
 globalThis.requestAnimationFrame=fn=>{frames.set(++serial,fn);return serial;};
 globalThis.cancelAnimationFrame=id=>frames.delete(id);
 globalThis.matchMedia=()=>({matches:false});
 try{
  const menu=document.createElement('section');
  const host=document.getElementById('menu-patient-preview');
  menu.append(host);document.body.append(menu);
  const svg=renderMenuPatient(host,{patient:0,surgeries:[]});
  const before=svg.querySelector('[data-menu-site="spine-0"]').getAttribute('transform');
  const contact=svg.querySelector('[data-menu-site="arm--1-lower"]');
  const imageCount=svg.querySelectorAll('image').length;
  startMenuPatientIdle(host,menu);
  assert.equal(frames.size,1);
  const fn=[...frames.values()][0];frames.clear();fn(performance.now()+1200);
  assert.notEqual(svg.querySelector('[data-menu-site="spine-0"]').getAttribute('transform'),before);
  assert.equal(svg.querySelectorAll('image').length,imageCount,'no duplicate SVG/atlas resources');
  assert.ok(contact.isConnected,'existing limb image is reused');
  menu.hidden=true;
  const next=[...frames.values()][0];frames.clear();next(performance.now()+1600);
  assert.equal(frames.size,0,'menu hidden stops scheduling animation frames');
 }finally{
  stopMenuPatientIdle();globalThis.document=prior;
  globalThis.requestAnimationFrame=oldFrame;globalThis.cancelAnimationFrame=oldCancel;
  globalThis.matchMedia=oldMedia;dom.window.close();
 }
});

test('both feet and right hand rise exactly 15 cm in display coordinates',()=>{
 const patient={surgeries:[
  {site:'arm-1-upper',procedure:'graft_arm'},
  {site:'leg--1-upper',procedure:'graft_leg'}
 ]};
 const neutral=towerUpgradePose(patient),pose=menuPatientPose(patient);
 const offset=menuRaisedContactOffset();
 const angle=-Math.PI/6;
 const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const toDisplay=([x,y])=>[x*Math.cos(angle)-y*Math.sin(angle),
                            x*Math.sin(angle)+y*Math.cos(angle)];
 const length=seg=>dist(seg[0],seg[1]);
 const expectedRises=['leg--1','leg-1','arm-1','arm-1-graft','leg--1-graft'];
 for(const prefix of expectedRises){
  const upper=neutral[prefix+'-upper'],lower=neutral[prefix+'-lower'];
  assert.ok(upper&&lower,'test patient includes '+prefix);
  const side=prefix.includes('--1')?-1:1;
  const graft=prefix.includes('graft');
  const spread=graft?(side<0?-7:7):0;
  const angles=prefix.startsWith('arm')?(side<0?[-151,-190]:[20,-4]):
                                       (side<0?[144,110]:[48,65]);
  const end=([x,y],len,deg)=>[
   x+len*Math.cos(deg*Math.PI/180-angle),
   y+len*Math.sin(deg*Math.PI/180-angle)
  ];
  const originalJoint=end(upper[0],length(upper),angles[0]+spread);
  const originalTip=end(originalJoint,length(lower),angles[1]+spread);
  const actualTip=pose[prefix+'-lower'][1];
  assert.ok(Math.abs(actualTip[0]-(originalTip[0]+offset[0]))<1e-7,prefix+' horizontal component');
  assert.ok(Math.abs(actualTip[1]-(originalTip[1]+offset[1]))<1e-7,prefix+' vertical component');
  const onscreen=toDisplay(offset);
  assert.ok(Math.abs(onscreen[0])<1e-7,'no sideways change');
  assert.ok(Math.abs(onscreen[1]+24)<1e-7,'raised 15 cm at 1.6 neutral units/cm');
  assert.ok(Math.abs(length(pose[prefix+'-upper'])-length(upper))<1e-6,prefix+' upper bone length');
  assert.ok(Math.abs(length(pose[prefix+'-lower'])-length(lower))<1e-6,prefix+' lower bone length');
 }
 // Left hand contact and its original spread stay unchanged.
 const left=neutral['arm--1-upper'],leftLower=neutral['arm--1-lower'];
 const j=[left[0][0]+length(left)*Math.cos(-151*Math.PI/180-angle),
          left[0][1]+length(left)*Math.sin(-151*Math.PI/180-angle)];
 const tip=[j[0]+length(leftLower)*Math.cos(-190*Math.PI/180-angle),
            j[1]+length(leftLower)*Math.sin(-190*Math.PI/180-angle)];
 assert.ok(dist(tip,pose['arm--1-lower'][1])<1e-7,'left hand is not raised');
 // Planted ends must remain stable throughout the IK idle.
 const animated=menuPatientFramePose(pose,Math.PI/2);
 for(const prefix of expectedRises)
  assert.deepEqual(animated[prefix+'-lower'][1],pose[prefix+'-lower'][1]);
});
