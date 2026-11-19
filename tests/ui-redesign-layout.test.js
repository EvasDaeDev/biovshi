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
  assert.equal(root.querySelector('#launch-paper #game-nav-settings'),null);
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
