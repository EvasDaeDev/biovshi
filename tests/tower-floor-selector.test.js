import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {newTower} from '../src/tower/model.js';
import {openTowerFloorSelector} from '../src/tower/floor-selector.js';
import {betNewSession} from '../src/betting/ledger.js';

test('pre-load choice updates saved difficulty without building the arena, rerolls without replacing fighters, and confirms once',async()=>{
 const dom=new JSDOM('<div id="robot-tag-hops-v22"></div>',{url:'https://tower.test/'});
 globalThis.document=dom.window.document;
 const root=document.querySelector('#robot-tag-hops-v22'),session=betNewSession(['Игрок'],300),run=newTower(0);
 run.floorPlan={floor:1,selected:0,options:[
  {arenaId:'ward',kind:'standard',profiles:['basic']},
  {arenaId:'ward',kind:'danger',style:'mixed',profiles:['fast','strong']}
 ]};
 let saves=0,loads=0,cancels=0;
 try{
  const popup=openTowerFloorSelector({root,session,player:0,run,
    onSave:()=>{saves++;},onConfirm:()=>{loads++;},onCancel:()=>{cancels++;}});
  assert.ok(popup.element.isConnected);
  const buttons=[...popup.element.querySelectorAll('.tower-challenge-option')];
  assert.equal(buttons.length,2);
  assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
  assert.match(buttons[1].dataset.hint,/Крит/);
  assert.doesNotMatch(buttons[1].textContent,/Поворот 160%/);
  assert.equal(buttons[1].classList.contains('is-danger'),true);
  buttons[1].click();
  assert.equal(run.floorPlan.selected,1);
  assert.equal(popup.element.querySelector('.tower-challenge-option.is-selected').getAttribute('aria-pressed'),'true');
  assert.equal(loads,0,'switching difficulty never builds the arena');
  const reroll=popup.element.querySelector('.tower-floor-selector-reroll');
  assert.equal(reroll.disabled,false);
  reroll.click();reroll.click();
  assert.equal(session.players[0].balance,250,'stale buttons cannot charge for two rerolls');
  assert.equal(run.arenaRerolls,1);
  assert.equal(run.floorPlan.options[0].arenaId,run.floorPlan.options[1].arenaId);
  assert.notEqual(run.floorPlan.options[0].arenaId,'ward');
  assert.equal(run.floorPlan.selected,1);
  assert.equal(loads,0,'reroll never builds a new world');
  const confirm=popup.element.querySelector('#tower-floor-selector-confirm');
  confirm.click();confirm.click();
  assert.equal(loads,1,'only confirmation builds the selected world');
  assert.ok(saves>=3);
  assert.equal(cancels,0);
 }finally{dom.window.close();}
});
