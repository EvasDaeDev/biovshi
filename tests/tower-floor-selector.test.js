import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
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
  const reroll=container.querySelector('.tower-reroll-button');
  assert.equal(reroll.disabled,false);
  reroll.click();reroll.click();
  assert.equal(session.players[0].balance,290,'stale button cannot double-charge');
  assert.equal(run.arenaRerolls,1);
  assert.equal(run.floorPlan.options[0].arenaId,run.floorPlan.options[1].arenaId);
  assert.notEqual(run.floorPlan.options[0].arenaId,'ward');
  assert.equal(run.floorPlan.selected,1);
  assert.equal(loads,0);
  assert.equal(saves,2);
 }finally{dom.window.close();}
});

