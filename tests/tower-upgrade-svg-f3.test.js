import test from 'node:test';
import assert from 'node:assert/strict';
import {renderTowerUpgradePatient} from '../src/tower/upgrade-preview.js';
class Element {
 constructor(tag){this.tagName=tag;this.attributes={};this.children=[];this.listeners={};}
 setAttribute(k,v){this.attributes[k]=String(v);}
 getAttribute(k){return this.attributes[k]??null;}
 appendChild(c){this.children.push(c);return c;}
 replaceChildren(...nodes){this.children=[...nodes];}
 addEventListener(k,fn){this.listeners[k]=fn;}
 set textContent(value){this.text=String(value);}
 queryAll(pred){return [...(pred(this)?[this]:[]),...this.children.flatMap(c=>c.queryAll(pred))];}
}
test('F3 SVG draws grafted segments using atlas cells',()=>{
 const prior=globalThis.document;
 globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
 try{
  const surgeries=[{site:'arm-1-upper',procedure:'graft_arm'},
   {site:'leg--1-upper',procedure:'graft_leg'},
   {site:'spine-2',procedure:'extend_spine'}];
  const svg=renderTowerUpgradePatient(new Element('div'),{patient:0,surgeries,prosthetics:[],
   graftProsthetics:['arm-1-graft-lower']});
  const parts=svg.queryAll(x=>x.getAttribute('data-upgrade-site')!==null);
  assert.equal(parts.length,18);
  for(const part of parts){
   const images=part.queryAll(x=>x.tagName==='image');
   assert.equal(images.length,1);
   assert.match(images[0].getAttribute('href'),/\.png$/);
  }
  assert.equal(svg.queryAll(x=>x.getAttribute('data-upgrade-anatomy')==='true').length,1);
 }finally{globalThis.document=prior;}
});
test('anatomical surgery preview includes graft before purchasing',()=>{
 const prior=globalThis.document;
 globalThis.document={createElementNS:(_,tag)=>new Element(tag)};
 try{
  const svg=renderTowerUpgradePatient(new Element('div'),{patient:0,surgeries:[]},{
   previewSurgery:{site:'leg-1-upper',procedure:'graft_leg'}});
  assert.equal(svg.queryAll(x=>x.getAttribute('data-upgrade-site')!==null).length,15);
 }finally{globalThis.document=prior;}
});
