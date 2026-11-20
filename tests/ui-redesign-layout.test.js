import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles/ui-redesign.css',import.meta.url),'utf8');

test('main menu keeps all gameplay entry points in landscape layout',()=>{
 const dom=new JSDOM(html);
 try{
  const root=dom.window.document.querySelector('#robot-tag-hops-v22');
  for(const id of ['launch-game','launch-tower','tower-reset','launch-totalizator','launch-setup','menu-player','menu-bank','menu-tower-progress']){
   assert.ok(root.querySelector('#'+id),id+' must be preserved for existing handlers');
  }
  assert.match(css,/#robot-tag-hops-v22 #launch-overlay \.launch-paper\s*\{[\s\S]*?display:grid;\s*grid-template-columns:minmax\(0,\.87fr\) minmax\(0,1\.13fr\)/);
  assert.match(css,/#robot-tag-hops-v22 #launch-overlay #tower-reset\s*\{[\s\S]*?border:1px solid #83514a/);
  assert.match(css,/@media\(max-width:690px\)/);
 }finally{dom.window.close();}
});

test('global navigation remains outside local menu and settings documents',()=>{
 const dom=new JSDOM(html);
 try{
  const root=dom.window.document.querySelector('#robot-tag-hops-v22');
  const nav=root.querySelector('#game-navigation');
  assert.ok(nav);
  assert.equal(nav.parentElement,root);
  assert.ok(nav.querySelector('#game-nav-settings'));
  assert.ok(nav.querySelector('#game-nav-back'));
  assert.equal(root.querySelector('.launch-paper #game-nav-settings'),null);
  const settings=root.querySelector('#arena-settings');
  assert.ok(settings.querySelector('#arena-settings-close'));
  assert.equal(nav.contains(settings),false);
  assert.match(css,/#robot-tag-hops-v22 #game-nav-settings\s*\{\s*right:12px;/);
  assert.match(css,/#robot-tag-hops-v22 #arena-settings \.settings-panel>header\s*\{\s*position:sticky;/);
  assert.match(css,/#robot-tag-hops-v22 #arena-settings #arena-settings-close\s*\{[\s\S]*?min-width:44px/);
 }finally{dom.window.close();}
});

test('dark settings preserve volume, quality and controls without text loss',()=>{
 const dom=new JSDOM(html);
 try{
  const doc=dom.window.document;
  for(const id of ['graphics-quality','sound-volume','music-volume','tower-control-mode','tutorial-start','settings-main-menu','arena-credits-open']){
   assert.ok(doc.getElementById(id),id+' remains actionable');
  }
  assert.match(css,/#robot-tag-hops-v22 #arena-settings \.settings-panel\s*\{[\s\S]*?background:#22271f;\s*background-image:none;/);
  assert.match(css,/#robot-tag-hops-v22 #arena-settings \.settings-panel :is\(button,select,input,summary\):focus-visible/);
 }finally{dom.window.close();}
});

test('small landscape touch devices keep global controls fixed and full combat telemetry visible',async()=>{
 const {viewportLayout}=await import('../src/ui/viewport.js');
 const small=viewportLayout(844,390,12);
 assert.ok(small.scale<.7,'small landscape devices have a downscaled logical layout');
 assert.ok(small.width>=1000,'original landscape HUD still fits logically');
 const rootCss=css.slice(css.indexOf('/* Small physical landscape viewports'));
 assert.match(rootCss,/@media \(pointer:coarse\) and \(orientation:landscape\) and \(max-width:950px\)/);
 assert.match(rootCss,/--ui-touch-target:calc\(44px \/ var\(--interface-scale,1\)\)/);
 assert.match(rootCss,/#robot-tag-hops-v22\.mobile-layout #game-nav-back\s*\{\s*left:calc\(10px \/ var\(--interface-scale,1\)\)/);
 assert.match(rootCss,/#robot-tag-hops-v22\.mobile-layout #game-nav-settings\s*\{\s*right:calc\(10px \/ var\(--interface-scale,1\)\)/);
 assert.match(rootCss,/#robot-tag-hops-v22\.mobile-layout #tower-upgrade-window \.tower-upgrade-heading-actions \.tower-upgrade-settings\s*\{\s*top:calc\(10px \/ var\(--interface-scale,1\)\);\s*right:calc\(10px \/ var\(--interface-scale,1\)\)/);
 assert.doesNotMatch(rootCss,/(?:\.robot-card|\.robot-card-metrics|\.patient-skills)\s*\{[^}]*display:none/);
});

test('Tower preparation remains dark and uses logical height across scaled layouts',()=>{
 const tower=css.slice(css.indexOf('#robot-tag-hops-v22 #tower-preparation .bet-panel{'),
  css.indexOf('/* Shelter: keep the native top-layer dialog'));
 assert.match(tower,/background:#22271f;/);
 assert.match(tower,/background-image:none;/);
 assert.match(tower,/#tower-floor-preview \.tower-challenge-option\.is-selected\s*\{[\s\S]*?border:2px solid var\(--ui-selected\)/);
 assert.match(tower,/#tower-preparation>\.bet-panel>\.bet-actions #tower-fight\s*\{[\s\S]*?background:#884734/);
 const shelter=css.slice(css.indexOf('/* Shelter: keep the native top-layer dialog'),css.indexOf('/* Module replacement is a true popup'));
 assert.match(shelter,/max-height:calc\(var\(--game-height,100dvh\) - 20px\);/);
 assert.doesNotMatch(shelter,/max-height:calc\(100dvh - 20px\)/);
 assert.doesNotMatch(shelter,/max-height:min\(30dvh,235px\)/);
 assert.match(css,/#robot-tag-hops-v22 \.tower-replacement-dialog\s*\{[\s\S]*?max-height:min\(calc\(var\(--game-height,100dvh\) - 18px\),650px\)/);
});

test('retired per-window navigation hooks cannot be reached by keyboard or screen reader',()=>{
 const dom=new JSDOM(html);
 try{
  const root=dom.window.document.querySelector('#robot-tag-hops-v22');
  const globalBack=root.querySelector('#game-nav-back');
  const globalSettings=root.querySelector('#game-nav-settings');
  assert.equal(globalBack.hasAttribute('aria-hidden'),false);
  assert.equal(globalSettings.hasAttribute('aria-hidden'),false);
  for(const id of ['launch-settings-button','tower-prep-back','tower-prep-settings','arena-settings-button']){
   const legacy=root.querySelector('#'+id);
   assert.ok(legacy,'legacy hook remains for existing handlers');
   assert.equal(legacy.getAttribute('tabindex'),'-1',id+' is not part of keyboard navigation');
   assert.equal(legacy.getAttribute('aria-hidden'),'true',id+' is hidden from accessibility tree');
  }
  const modalFocus=fs.readFileSync(new URL('../src/ui/modal-focus.js',import.meta.url),'utf8');
  assert.match(modalFocus,/!node\.closest\('\[aria-hidden="true"\]'\)/);
 }finally{dom.window.close();}
});

test('Shelter modal places a working back button in its own top layer',()=>{
 const source=fs.readFileSync(new URL('../src/tower/upgrade-modal.js',import.meta.url),'utf8');
 assert.match(source,/create\('button','tower-upgrade-back game-nav-back-control','← НАЗАД'\)/);
 assert.match(source,/overlay\.append\(backButton\)/);
 assert.match(source,/backButton\.onclick=close/);
 assert.match(css,/#robot-tag-hops-v22 #tower-upgrade-window \.tower-upgrade-back\s*\{[\s\S]*?position:fixed;[\s\S]*?top:12px;[\s\S]*?left:12px;/);
 assert.match(css,/#robot-tag-hops-v22 \.game-nav-back-control:focus-visible/);
 assert.match(css,/#robot-tag-hops-v22 \.game-nav-back-control\s*\{[\s\S]*?height:44px;/);
 assert.match(html,/id="game-nav-back" class="game-nav-back-control"/);
});
