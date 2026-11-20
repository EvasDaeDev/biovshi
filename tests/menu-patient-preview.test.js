import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {renderMenuPatient,menuPatientTransform,menuPatientPose} from '../src/ui/menu-patient-preview.js';
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
 assert.ok(angle('leg--1-upper')>105,'left leg extends down-left');
 assert.ok(angle('leg-1-upper')>10&&angle('leg-1-upper')<90,'right leg extends down-right');
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
 assert.match(css,/\.menu-patient-idle\s*\{[\s\S]*?animation:menu-patient-idle/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
