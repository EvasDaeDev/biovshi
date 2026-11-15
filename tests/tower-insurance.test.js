import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {towerFor,completeTower,resetTower,validTower,buyTowerInsurance,rewardTower} from '../src/tower/model.js';
import {validInsurance} from '../src/tower/insurance.js';
import {redistributeStat} from '../src/garage/model.js';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {towerPreparation,settleTower,towerResults} from '../src/tower/ui.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
function reach(s,player,floor){while(towerFor(s,player).level<floor)completeTower(s,player,true,()=>.99);const t=towerFor(s,player);t.preparing=false;return t;}

test('DMS costs 50 then grows by ten percent rounded upward; active policy cannot be purchased twice',()=>{
 const s=betNewSession(['Игрок'],1000),t=reach(s,0,3);
 assert.equal(buyTowerInsurance(s,0),50);assert.equal(s.players[0].balance,950);assert.equal(s.insuranceSpent,50);assert.equal(t.insurance.price,55);
 assert.throws(()=>buyTowerInsurance(s,0),/уже/);assert.equal(s.players[0].balance,950);
 for(const [price,next] of [[55,61],[61,68],[68,75]]){
  completeTower(s,0,false);assert.equal(buyTowerInsurance(s,0),price);assert.equal(towerFor(s,0).insurance.price,next);
 }
 assert.equal(s.insuranceSpent,50+55+61+68);
});

test('defeat restores the insured floor, patient and chosen build with intact prostheses and consumes the policy',()=>{
 const s=betNewSession(['Игрок'],1000),t=reach(s,0,3);t.patient=2;t.stats=redistributeStat(t,0,t.stats[0]+1);t.prosthetics=['arm--1-upper'];
 const chosen=structuredClone({stats:t.stats,prosthetics:t.prosthetics});buyTowerInsurance(s,0);
 reach(s,0,8);const progress=towerFor(s,0);progress.prosthetics.push('leg-1-lower');progress.runCoins=120;progress.runKills=3;
 const pieces=[...progress.artifacts.pieces],record=progress.record;
 const restored=completeTower(s,0,false);
 assert.equal(restored.level,3);assert.equal(restored.wins,2);assert.equal(restored.patient,2);assert.deepEqual(restored.stats,chosen.stats);assert.deepEqual(restored.prosthetics,chosen.prosthetics);
 assert.equal(restored.record,record);assert.deepEqual(restored.artifacts.pieces,pieces);assert.equal(restored.insurance.checkpoint,null);assert.equal(restored.insurance.price,55);
 assert.equal(restored.runCoins,120);assert.equal(restored.runKills,3);assert.ok(validTower(restored));
 const second=completeTower(s,0,false);assert.equal(second.level,1);assert.deepEqual(second.stats,[3,3,3]);assert.equal(second.insurance.price,55);
});

test('policies are independent per player and survive victories, menu restarts and voluntary run reset',()=>{
 const s=betNewSession(['Первый','Второй'],1000);reach(s,0,5);buyTowerInsurance(s,0);const insured=structuredClone(towerFor(s,0).insurance);
 completeTower(s,0,true,()=>0);assert.deepEqual(towerFor(s,0).insurance,insured);assert.equal(towerFor(s,1).insurance.checkpoint,null);
 resetTower(s,0);assert.deepEqual(towerFor(s,0).insurance,insured);assert.equal(completeTower(s,0,false).level,5);assert.ok(validTower(towerFor(s,0)));
});

test('insufficient funds do not change price, policy or bank',()=>{
 const s=betNewSession(['Игрок'],49),before=structuredClone(towerFor(s,0));
 assert.throws(()=>buyTowerInsurance(s,0),/Недостаточно/);assert.deepEqual(towerFor(s,0),before);assert.equal(s.players[0].balance,49);assert.equal(s.insuranceSpent,0);
});

test('purchased DMS and its monetary sink survive storage, and old saves receive a free empty policy',()=>{
 const dom=new JSDOM('',{url:'https://dms-save.test/'});globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='dms';
 try{
  const s=betNewSession(['Игрок'],1000);reach(s,0,5);buyTowerInsurance(s,0);ctx.betting=s;bettingSave();
  const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.insuranceSpent,50);assert.equal(loaded.players[0].balance,950);assert.deepEqual(loaded.towers[0].insurance,s.towers[0].insurance);
  completeTower(loaded,0,false);ctx.betting=loaded;bettingSave();const used=bettingLoad();assert.ok(used);assert.equal(used.towers[0].level,5);assert.equal(used.towers[0].insurance.checkpoint,null);
  used.insuranceSpent=0;localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(used));assert.equal(bettingLoad(),null,'currency imbalance is rejected');
  const legacy=betNewSession(['Старый'],100);towerFor(legacy,0);delete legacy.insuranceSpent;delete legacy.towers[0].insurance;
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(legacy));const migrated=bettingLoad();assert.ok(migrated);assert.deepEqual(migrated.towers[0].insurance,{price:50,checkpoint:null});assert.equal(migrated.players[0].balance,100);
 }finally{dom.window.close();}
});

test('policy validation rejects impossible checkpoint skills, levels and prices',()=>{
 const s=betNewSession(['Игрок'],1000),t=reach(s,0,3);buyTowerInsurance(s,0);const good=t.insurance;assert.ok(validInsurance(good,t.record));
 assert.equal(validInsurance({...good,price:49},t.record),false);
 assert.equal(validInsurance({...good,checkpoint:{...good.checkpoint,stats:[99,99,99]}},t.record),false);
 assert.equal(validInsurance({...good,checkpoint:{...good.checkpoint,level:20}},t.record),false);
});

test('preparation replaces Menu with grey priced DMS, turns green after buying, and reports insured defeat',()=>{
 const f=startBossScenario({floor:5});
 try{
  towerPreparation();const button=document.querySelector('#tower-insurance');assert.equal(document.querySelector('#tower-prep-menu'),null);assert.match(button.textContent,/ДМС.*50/);assert.equal(button.classList.contains('is-active'),false);
  button.click();assert.equal(f.session.players[0].balance,950);assert.match(button.textContent,/ДМС.*ЭТАЖ 5/);assert.ok(button.classList.contains('is-active'));assert.ok(button.disabled);
  button.click();towerPreparation();assert.equal(f.session.insuranceSpent,50);assert.match(button.textContent,/ЭТАЖ 5/);
  document.querySelector('#tower-fight').click();advanceStartup(10);ctx.combat.winner=1;ctx.combat.finished=true;settleTower(1);towerResults();
  assert.equal(towerFor(f.session,0).level,5);assert.equal(towerFor(f.session,0).insurance.checkpoint,null);assert.match(ctx.resultsSummary.textContent,/ДМС сработала/);assert.match(ctx.resultsAgain.textContent,/ДМС.*5/);assert.ok(bettingLoad());
  towerPreparation();assert.match(button.textContent,/ДМС.*55/);assert.equal(button.classList.contains('is-active'),false);
 }finally{f.close();}
});

test('the live tower settings button is visually above preparation dimming and remains operable',()=>{
 const f=startBossScenario({floor:5});
 try{
  towerPreparation();const style=document.createElement('style');style.textContent=fs.readFileSync(new URL('../styles/wasteland.css',import.meta.url),'utf8')+fs.readFileSync(new URL('../styles/tower.css',import.meta.url),'utf8');document.head.append(style);
  const menu=document.querySelector('#arena-settings-button'),panel=document.querySelector('#tower-preparation'),win=f.dom.window;
  assert.ok(Number(win.getComputedStyle(menu).zIndex)>Number(win.getComputedStyle(panel).zIndex));
  menu.click();assert.equal(ctx.settingsOpen,true);assert.equal(document.querySelector('#arena-settings').hidden,false);
 }finally{f.close();}
});
