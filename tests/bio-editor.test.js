import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import {newPatient,patientBones,readPatient,syncBody} from '../bio_editor/patient-model.js';
import {skinMatrix} from '../src/render/robot-skin.js';
import preset from '../src/render/hit-preset.json' with {type:'json'};

test('patient anatomy round-trips additional limbs, atlas anchors and custom pixels',()=>{
 const project=newPatient();
 project.body.spineSegments=7;
 project.body.limbs.push({key:'leg-1-custom1',kind:'leg',side:1,anchor:4,lengthScale:1.5,massScale:1});
 syncBody(project.body);
 const part=project.body.skinParts['leg-1-custom1-upper'];
 Object.assign(part,{col:3,row:1,from:49,to:11,widthScale:1.25});
 project.atlas={key:'custom',name:'patient.png',data:'data:image/png;base64,AAAA'};
 const imported=readPatient(JSON.parse(JSON.stringify(project)));
 assert.deepEqual(imported,project);
 const bone=patientBones(imported.body).find(candidate=>candidate.key==='leg-1-custom1-upper');
 assert.ok(bone.b.y>bone.a.y);
 const [a,b,c,d,e,f]=skinMatrix(bone.a,bone.b,part);
 assert.ok(Math.abs(a*part.from+c*32+e-bone.a.x)<1e-8);
 assert.ok(Math.abs(b*part.to+d*32+f-bone.b.y)<1e-8);
 project.body.limbs.at(-1).anchor=99;
 assert.throws(()=>readPatient(project),/крепление/);
 project.body.limbs.pop();
 syncBody(project.body);
 assert.ok(!project.body.skinParts['leg-1-custom1-upper']);
});

async function loadEditor(t,page){
 const markup=await fs.readFile(new URL('../bio_editor/'+page+'.html',import.meta.url),'utf8');
 const dom=new JSDOM(markup,{url:'https://game.test/biovshi/bio_editor/'+page+'.html'});
 t.after(()=>dom.window.close());
 for(const key of ['document','Option','requestAnimationFrame','cancelAnimationFrame']){
  const previous=Object.getOwnPropertyDescriptor(globalThis,key);
  t.after(()=>previous?Object.defineProperty(globalThis,key,previous):delete globalThis[key]);
 }
 globalThis.document=dom.window.document;
 globalThis.Option=dom.window.Option;
 globalThis.requestAnimationFrame=()=>0;
 globalThis.cancelAnimationFrame=()=>{};
 let file;
 t.mock.method(URL,'createObjectURL',blob=>{file=blob;return 'blob:test';});
 t.mock.method(URL,'revokeObjectURL',()=>{});
 t.mock.method(dom.window.HTMLAnchorElement.prototype,'click',()=>{});
 await import('../bio_editor/'+page+'.js');
 return {doc:dom.window.document,json:async()=>JSON.parse(await file.text()),
  change:(element,value)=>{element.value=value;element.dispatchEvent(new dom.window.Event('change'));}};
}

test('patient editor adds a limb, opens the atlas dialog and exports the chosen sprite cell',async t=>{
 const {doc,json,change}=await loadEditor(t,'patients');
 const $=id=>doc.getElementById(id);
 $('add-limb').click();
 change($('limb-kind'),'leg');
 $('editor-preview').showModal=()=>$('editor-preview').setAttribute('open','');
 $('preview-open').click();
 assert.ok($('editor-preview').open);
 const bone=[...$('bone').options].find(option=>option.textContent.startsWith('Конечность 5 · верх')).value;
 change($('bone'),bone);
 $('atlas-grid').children[2].click();
 const tile=$('atlas-stage').querySelector('[data-texture-bone="'+bone+'"] svg');
 assert.equal(tile.getAttribute('viewBox'),'128 0 64 64');
 $('export').click();
 const result=await json();
 assert.equal(result.body.limbs.length,5);
 assert.equal(result.body.skinParts[bone].col,2);
 assert.ok(readPatient(result));
});

test('effects editor uses the configured hit and sever counts and exports the runtime preset',async t=>{
 const {doc,json,change}=await loadEditor(t,'effects');
 const $=id=>doc.getElementById(id);
 assert.equal($('particles').children.length,preset.hitParticles+1);
 $('sever').click();
 assert.equal($('particles').children.length,preset.severParticles+1);
 change($('severParticles'),'22');
 assert.equal($('particles').children.length,23);
 $('export').click();
 assert.deepEqual(await json(),{...preset,severParticles:22});
 change($('hitFlashSec'),'.70');
 $('export').click();
 assert.equal($('status').dataset.error,'true');
});
