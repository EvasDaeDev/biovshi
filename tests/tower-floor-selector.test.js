import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {newTower} from '../src/tower/model.js';
import {renderTowerFloorChoices} from '../src/tower/floor-selector.js';
import {betNewSession} from '../src/betting/ledger.js';

test('difficulty and arena selection live in the original preparation panel and never load fighters',()=>{
 const dom=new JSDOM('<div id="robot-tag-hops-v22"><div id="tower-preparation"><div id="tower-floor-preview"></div><button id="tower-fight">НА АРЕНУ</button></div></div>',{url:'https://tower.test/'});
 globalThis.document=dom.window.document;
 const container=document.querySelector('#tower-floor-preview'),session=betNewSession(['Игрок'],300),run=newTower(0);
 run.floorPlan={floor:1,selected:0,options:[
  {arenaId:'ward',kind:'standard',profiles:['basic']},
  {arenaId:'ward',kind:'danger',style:'mixed',profiles:['fast','strong']}
 ]};
 let saves=0,loads=0;
 try{
  renderTowerFloorChoices({container,session,player:0,run,
   onSave:()=>{saves++;},onChange:()=>{}});
  assert.equal(document.querySelector('#tower-floor-selector'),null,'no extra window');
  assert.ok(document.querySelector('#tower-fight'),'existing arena button retained');
  const buttons=[...container.querySelectorAll('.tower-challenge-option')];
  assert.equal(buttons.length,2);
  assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
  assert.match(buttons[1].dataset.hint,/Крит/);
  assert.doesNotMatch(buttons[1].textContent,/Поворот 160%/);
  assert.equal(buttons[1].classList.contains('is-danger'),true);
  buttons[1].click();
  assert.equal(run.floorPlan.selected,1);
  assert.equal(container.querySelector('.tower-challenge-option.is-selected').getAttribute('aria-pressed'),'true');
  assert.equal(loads,0,'changing difficulty does not initialize the arena');
  assert.equal(container.querySelector('.tower-arena-map').textContent.includes('РЕКОРД'),false,
    'record belongs beside the nickname, not the floor map');
  assert.match(container.querySelector('.tower-reroll-line').textContent,/СМЕНИТЬ АРЕНУ/);
  assert.match(container.querySelector('.tower-reroll-line').textContent,/10/);
  assert.ok(container.querySelector('.tower-reroll-line .chip-icon'));
  const reroll=container.querySelector('.tower-reroll-button');
  assert.equal(reroll.disabled,false);
  assert.equal(reroll.contains(container.querySelector('.tower-reroll-line')),false,'price is separate from die image to preserve its size');
  assert.equal(container.querySelector('.tower-reroll-line').tagName,'BUTTON');
  const css=fs.readFileSync(new URL('../styles/ui-redesign.css',import.meta.url),'utf8');
  assert.match(css,/#robot-tag-hops-v22 #tower-floor-preview \.tower-arena-dice \.tower-reroll-button\s*\{[\s\S]*?width:94px;[\s\S]*?height:94px;/);
  assert.match(css,/#robot-tag-hops-v22 #tower-floor-preview \.tower-arena-dice \.tower-reroll-price img\s*\{[\s\S]*?width:1em;[\s\S]*?height:1em;/);
  container.querySelector('.tower-reroll-caption').click();reroll.click();
  assert.equal(session.players[0].balance,200,'stale button cannot double-charge');
  assert.equal(run.arenaRerolls,1);
  assert.equal(run.floorPlan.options[0].arenaId,run.floorPlan.options[1].arenaId);
  assert.notEqual(run.floorPlan.options[0].arenaId,'ward');
  assert.equal(run.floorPlan.selected,1);
  assert.equal(loads,0);
  assert.equal(saves,2);
 }finally{dom.window.close();}
});



test('late-floor crowded fight can reroll from columns to ward without changing opponents',async()=>{
 const {ensureTowerFloorPlan}=await import('../src/tower/floors.js');
 const {towerRerollCandidates,purchaseTowerArenaReroll}=await import('../src/tower/economy.js');
 const dom=new JSDOM('<div id="tower-floor-preview"></div>',{url:'https://tower.test/'});
 const oldDocument=globalThis.document;
 globalThis.document=dom.window.document;
 try{
  const session=betNewSession(['Игрок'],300),run=newTower(0);
  run.level=13;
  ensureTowerFloorPlan(run,()=>.4);
  run.floorPlan={
   floor:13,selected:0,options:[
    {arenaId:'columns',kind:'standard',profiles:Array(7).fill('basic')},
    {arenaId:'columns',kind:'danger',style:'crowd',profiles:Array(8).fill('fast')}
   ]
  };
  assert.ok(towerRerollCandidates(run).includes('ward'));
  const before=run.floorPlan.options.map(o=>[...o.profiles]);
  const view=renderTowerFloorChoices({container:document.getElementById('tower-floor-preview'),session,player:0,run});
  const reroll=document.querySelector('.tower-reroll-button');
  assert.equal(reroll.disabled,false);
  document.querySelector('.tower-reroll-caption').click();
  assert.equal(run.floorPlan.options[0].arenaId,'ward');
  assert.deepEqual(run.floorPlan.options.map(o=>o.profiles),before);
  assert.equal(session.players[0].balance,200);
  assert.ok(view);
 }finally{globalThis.document=oldDocument;dom.window.close();}
});
