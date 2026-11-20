import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {retireTowerEnemyCard} from '../src/ui/paint-telemetry.js';

test('Tower enemy cards fade out, collapse and remain hidden after animation',()=>{
 const dom=new JSDOM('<div id="robot-tag-hops-v22"><section class="robot-card"></section></div>');
 try{
  const card=dom.window.document.querySelector('.robot-card');
  assert.equal(retireTowerEnemyCard(card,{id:2,mobile:false},'tower'),true);
  assert.ok(card.classList.contains('tower-card-exiting'));
  assert.equal(card.getAttribute('aria-hidden'),'true');
  assert.equal(card.hidden,false,'transition begins before card disappears');
  assert.equal(retireTowerEnemyCard(card,{id:2,mobile:false},'tower'),false,'cannot animate twice');
  card.dispatchEvent(new dom.window.Event('animationend'));
  assert.equal(card.hidden,true,'animation removes defeated card from layout');
 }finally{dom.window.close();}
});

test('only defeated Tower enemies retire; player, healthy enemies and other modes remain',()=>{
 const dom=new JSDOM('<section class="robot-card"></section>');
 try{
  const card=dom.window.document.querySelector('.robot-card');
  for(const [robot,mode] of [[{id:0,mobile:false},'tower'],[{id:1,mobile:true},'tower'],[{id:1,mobile:false},'betting']]){
   assert.equal(retireTowerEnemyCard(card,robot,mode),false);
   assert.equal(card.hidden,false);
   assert.equal(card.classList.contains('tower-card-exiting'),false);
  }
 }finally{dom.window.close();}
});

test('Tower card exit style respects reduced-motion preference',()=>{
 const css=fs.readFileSync(new URL('../styles/tower.css',import.meta.url),'utf8');
 assert.match(css,/\.robot-card\.tower-card-exiting\s*\{[\s\S]*?animation:tower-card-exit 340ms/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
