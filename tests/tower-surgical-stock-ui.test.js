import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor,completeTower,buyTowerSurgery,validTower} from '../src/tower/model.js';
import {chooseTowerMutation} from '../src/tower/mutations.js';
import {initializeGame} from '../src/game/initialize.js';
import {installTowerUI} from '../src/tower/ui.js';
import {ctx} from '../src/game/state.js';

function setup(session,run){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),
  {url:'https://tower-surgical-stock-ui.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});
 globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 globalThis.confirm=()=>true;
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 initializeGame({session,entry:'tower',tower:structuredClone(run),arenaId:'ward'});
 installTowerUI();return dom;
}

test('Shelter offers paid stock reinstallation and consumes one stored implant',()=>{
 const session=betNewSession(['Хирург'],15000),run=towerFor(session,0);
 while(run.level<11){
  if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.17);
 }
 chooseTowerMutation(run,run.mutationDraft.options[0]);
 buyTowerSurgery(session,0,'drive','leg-1-upper');
 buyTowerSurgery(session,0,'impact','arm-1-upper',null,'leg-1-upper');
 const dom=setup(session,run);
 try{
  const panel=document.querySelector('#tower-prep-surgery');
  assert.match(panel.textContent,/СКЛАД ИМПЛАНТОВ · 1/);
  const modal=document.querySelector('#tower-upgrade-window');
  document.querySelector('#tower-upgrade-open').click();
  modal.querySelector('[data-upgrade-tab="surgery"]').click();
  const stock=panel.querySelector('[aria-label="Имплант со склада"]');
  assert.ok(stock&&!stock.hidden);
  assert.equal(stock.options.length,2);
  assert.match(stock.options[1].textContent,/Привод/);
  stock.value='s1';stock.dispatchEvent(new Event('change'));
  assert.match(modal.querySelector('#tower-upgrade-stats').textContent,/ПРЕДПРОСМОТР: Привод/,
    'selecting a stored implant updates the live preview before payment');
  const proc=panel.querySelector('[aria-label="Вид операции"]');
  assert.equal(proc.value,'drive');assert.equal(proc.disabled,true);
  const site=panel.querySelector('[aria-label="Сегмент для операции"]');
  site.value='leg--1-upper';
  const before=session.players[0].balance;
  const install=panel.querySelector('.tower-surgery-purchase');
  assert.equal(install.disabled,false);
  assert.match(install.textContent,/УСТАНОВИТЬ СО СКЛАДА/);
  install.click();
  const confirmation=document.querySelector('#game-action-confirm');
  assert.ok(confirmation,'stock reinstallation requires explicit confirmation');
  assert.match(confirmation.textContent,/−85/);
  assert.ok(confirmation.querySelector('.game-action-confirm-submit .chip-icon'),
    'purchase confirmation renders the shared coin icon instead of a text label');
  assert.equal(session.players[0].balance,before,'no coins are charged before confirmation');
  confirmation.querySelector('.game-action-confirm-submit').click();
  assert.equal(document.querySelector('#game-action-confirm'),null);
  assert.equal(session.players[0].balance,before-850);
  assert.deepEqual(run.surgeries,[{site:'leg--1-upper',procedure:'drive',stockId:'s1'}]);
  assert.deepEqual(run.surgicalStock,[{id:'s2',procedure:'impact',fromSite:'arm-1-upper'}]);
  assert.equal(ctx.towerGarage[0].surgeries[0].stockId,'s1');
  assert.equal(validTower(run),true);
  assert.match(document.querySelector('#tower-prep-surgery').textContent,/СКЛАД ИМПЛАНТОВ · 1/);
 }finally{ctx.root?.__disposeTag?.();ctx.mode='spectator';dom.window.close();}
});
