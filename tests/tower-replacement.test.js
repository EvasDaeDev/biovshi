import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {chooseTowerModuleReplacement} from '../src/tower/replacement-dialog.js';
import {TOWER_MUTATION_IDS} from '../src/tower/mutations.js';

function fixture(){
 const dom=new JSDOM('<!doctype html><body><main id="robot-tag-hops-v22"><button class="tower-mutation-install">УСТАНОВИТЬ</button></main></body>',{url:'https://tower.test/'});
 return {dom,root:dom.window.document.querySelector('main')};
}

test('full-slot replacement popup is inert until explicit selection and confirmation',()=>{
 const {dom,root}=fixture();
 try{
  const ids=TOWER_MUTATION_IDS.slice(0,6);
  assert.equal(ids.length,6);
  const entries=ids.map((type,i)=>({type,id:'slot-'+i,rarity:0}));
  let calls=0,chosen=null;
  chooseTowerModuleReplacement({root,installed:entries,installName:'Новый модуль',price:100,onConfirm:id=>{calls++;chosen=id;}});
  const dialog=root.querySelector('#tower-module-replacement');
  assert.ok(dialog);
  assert.ok(dialog.open||dialog.hasAttribute('open'));
  assert.equal(dialog.querySelectorAll('.tower-replacement-option').length,6);
  const apply=dialog.querySelector('.tower-replacement-apply');
  assert.equal(apply.disabled,true);
  assert.equal(calls,0);
  const options=[...dialog.querySelectorAll('.tower-replacement-option')];
  options[2].click();
  assert.equal(apply.disabled,false);
  assert.equal(options[2].getAttribute('aria-pressed'),'true');
  assert.equal(options[0].getAttribute('aria-pressed'),'false');
  assert.match(dialog.querySelector('.tower-replacement-status').textContent,/100 монет/);
  assert.equal(calls,0);
  apply.click();
  assert.equal(calls,1);
  assert.equal(chosen,'slot-2');
  assert.equal(root.querySelector('#tower-module-replacement'),null);
 }finally{dom.window.close();}
});

test('closing replacement dialog cancels without any equipment action',()=>{
 const {dom,root}=fixture();
 try{
  const entries=[{type:TOWER_MUTATION_IDS[0],id:'slot-0',rarity:0}];
  let calls=0;
  chooseTowerModuleReplacement({root,installed:entries,installName:'Модуль',price:90,onConfirm:()=>calls++});
  root.querySelector('.tower-replacement-option').click();
  root.querySelector('.tower-replacement-close').click();
  assert.equal(calls,0);
  assert.equal(root.querySelector('#tower-module-replacement'),null);
  chooseTowerModuleReplacement({root,installed:entries,installName:'Модуль',price:90,onConfirm:()=>calls++});
  root.querySelector('.tower-replacement-dialog footer button').click();
  assert.equal(calls,0);
  assert.equal(root.querySelector('#tower-module-replacement'),null);
 }finally{dom.window.close();}
});

test('replacement returns focus to its real opener and cannot submit twice',()=>{
 const {dom,root}=fixture();
 try{
  const opener=root.querySelector('.tower-mutation-install');
  opener.focus();
  const entries=[{type:TOWER_MUTATION_IDS[0],id:'slot-a',rarity:0}];
  let calls=0;
  chooseTowerModuleReplacement({root,installed:entries,installName:'Новый',price:75,onConfirm:()=>calls++});
  const dialog=root.querySelector('#tower-module-replacement');
  dialog.querySelector('.tower-replacement-option').click();
  const submit=dialog.querySelector('.tower-replacement-apply');
  submit.click();
  submit.click();
  assert.equal(calls,1,'same confirmation cannot be submitted twice');
  assert.equal(dom.window.document.activeElement,opener);
  assert.equal(root.querySelector('#tower-module-replacement'),null);
 }finally{dom.window.close();}
});

test('reopening an already open replacement dialog removes the old top layer',()=>{
 const {dom,root}=fixture();
 try{
  const entries=[{type:TOWER_MUTATION_IDS[0],id:'slot-a',rarity:0}];
  let calls=0;
  chooseTowerModuleReplacement({root,installed:entries,installName:'Новый',price:75,onConfirm:()=>calls++});
  const old=root.querySelector('#tower-module-replacement');
  chooseTowerModuleReplacement({root,installed:entries,installName:'Новый',price:75,onConfirm:()=>calls++});
  assert.equal(old.isConnected,false);
  assert.equal(root.querySelectorAll('#tower-module-replacement').length,1);
  root.querySelector('.tower-replacement-close').click();
  assert.equal(calls,0);
 }finally{dom.window.close();}
});
