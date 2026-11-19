import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {confirmGameAction} from '../src/ui/confirm-action.js';

function fixture(){
 const dom=new JSDOM('<!doctype html><body><main id="robot-tag-hops-v22"><button id="tower-trigger">Открыть</button></main></body>',{url:'https://biovshi.test/'});
 return {dom,root:dom.window.document.querySelector('main')};
}

test('confirmation is a popup; cancelling never calls the paid operation',()=>{
 const {dom,root}=fixture();
 try{
  const opener=root.querySelector('#tower-trigger');
  opener.focus();
  let purchased=0;
  const dialog=confirmGameAction({
   root,title:'УСТАНОВКА',details:['Скорость +1','Мобильность −1'],cost:85,
   onConfirm:()=>purchased++
  });
  assert.ok(dialog.open||dialog.hasAttribute('open'));
  assert.match(dialog.textContent,/Скорость \+1/);
  assert.match(dialog.textContent,/Мобильность −1/);
  assert.match(dialog.querySelector('.game-action-confirm-submit').textContent,/−85/);
  assert.ok(dialog.querySelector('.game-action-confirm-submit .chip-icon'));
  assert.ok(dialog.querySelector('.game-action-confirm-submit').innerHTML.includes('coin_01.png'));
  assert.equal(purchased,0);
  dialog.querySelector('.game-action-confirm-close').click();
  assert.equal(purchased,0);
  assert.equal(dialog.isConnected,false);
  assert.equal(dom.window.document.activeElement,opener);
 }finally{dom.window.close();}
});

test('confirmation invokes operation exactly once even with repeated clicks',()=>{
 const {dom,root}=fixture();
 try{
  root.querySelector('#tower-trigger').focus();
  let purchased=0;
  const dialog=confirmGameAction({root,title:'ДМС',cost:50,onConfirm:()=>purchased++});
  const submit=dialog.querySelector('.game-action-confirm-submit');
  submit.click();
  submit.click();
  assert.equal(purchased,1);
  assert.equal(root.querySelector('#game-action-confirm'),null);
 }finally{dom.window.close();}
});

test('opening a new confirmation replaces and closes an old confirmation without charging',()=>{
 const {dom,root}=fixture();
 try{
  let charged=0;
  const first=confirmGameAction({root,title:'Старая операция',cost:120,onConfirm:()=>charged++});
  const second=confirmGameAction({root,title:'Новая операция',cost:60,onConfirm:()=>charged++});
  assert.equal(first.isConnected,false);
  assert.equal(root.querySelectorAll('#game-action-confirm').length,1);
  second.querySelector('footer button').click();
  assert.equal(charged,0);
  assert.equal(root.querySelector('#game-action-confirm'),null);
 }finally{dom.window.close();}
});
