import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {towerFor,completeTower,resetTower,validTower,buyTowerInsurance,rewardTower} from '../src/tower/model.js';
import {validInsurance} from '../src/tower/insurance.js';
import {chooseTowerMutation} from '../src/tower/mutations.js';
import {redistributeStat} from '../src/garage/model.js';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {towerPreparation,settleTower,towerResults} from '../src/tower/ui.js';
import {advanceStartup} from '../src/game/session.js';
import {ctx} from '../src/game/state.js';
function confirmDms(){
 const dialog=document.querySelector('#game-action-confirm');
 assert.ok(dialog,'DMS requires explicit confirmation');
 dialog.querySelector('.game-action-confirm-submit').click();
 assert.equal(document.querySelector('#game-action-confirm'),null);
}
function cancelDms(){
 const dialog=document.querySelector('#game-action-confirm');
 assert.ok(dialog,'renewal should open confirmation');
 dialog.querySelector('.game-action-confirm-close').click();
 assert.equal(document.querySelector('#game-action-confirm'),null);
}
function reach(s,player,floor){
 while(towerFor(s,player).level<floor){
  const run=towerFor(s,player);
  if(run.mutationDraft)assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
  completeTower(s,player,true,()=>.99);
 }
 const t=towerFor(s,player);t.preparing=false;return t;
}

test('new DMS purchases leave the tariff unchanged and block repeat purchase on the same floor',()=>{
 const s=betNewSession(['Игрок'],1000),t=reach(s,0,3);
 assert.equal(buyTowerInsurance(s,0),300);assert.equal(s.players[0].balance,700);assert.equal(s.insuranceSpent,300);assert.equal(t.insurance.price,300);
 assert.throws(()=>buyTowerInsurance(s,0),/уже/);assert.equal(s.players[0].balance,700);
 completeTower(s,0,false);assert.equal(buyTowerInsurance(s,0),300);
 assert.equal(towerFor(s,0).insurance.price,300);assert.equal(s.insuranceSpent,600);
});

test('defeat restores the insured floor, patient and chosen build with intact prostheses and consumes the policy',()=>{
 const s=betNewSession(['Игрок'],1000),t=reach(s,0,3);t.patient=2;t.stats=redistributeStat(t,0,t.stats[0]+1);t.prosthetics=['arm--1-upper'];
 const chosen=structuredClone({stats:t.stats,prosthetics:t.prosthetics});buyTowerInsurance(s,0);
 reach(s,0,8);const progress=towerFor(s,0);progress.prosthetics.push('leg-1-lower');progress.runCoins=120;progress.runKills=3;
 const pieces=[...progress.artifacts.pieces],record=progress.record;
 const restored=completeTower(s,0,false);
 assert.equal(restored.level,3);assert.equal(restored.wins,2);assert.equal(restored.patient,2);assert.deepEqual(restored.stats,chosen.stats);assert.deepEqual(restored.prosthetics,chosen.prosthetics);
 assert.equal(restored.record,record);assert.deepEqual(restored.artifacts.pieces,pieces);assert.equal(restored.insurance.checkpoint,null);assert.equal(restored.insurance.price,300);
 assert.equal(restored.runCoins,120);assert.equal(restored.runKills,3);assert.ok(validTower(restored));
 const second=completeTower(s,0,false);assert.equal(second.level,1);assert.deepEqual(second.stats,[3,3,3]);assert.equal(second.insurance.price,300);
});

test('voluntary Tower reset cancels the active DMS without refunding coins or resetting tariff',()=>{
 const s=betNewSession(['Первый','Второй'],1000);
 reach(s,0,5);buyTowerInsurance(s,0);
 const insured=structuredClone(towerFor(s,0).insurance);
 const balance=s.players[0].balance,spent=s.insuranceSpent;
 completeTower(s,0,true,()=>0);
 assert.deepEqual(towerFor(s,0).insurance,insured,'victory keeps the checkpoint');
 assert.equal(towerFor(s,1).insurance.checkpoint,null,'other player is unaffected');
 const artifacts=structuredClone(towerFor(s,0).artifacts),record=towerFor(s,0).record;
 const reset=resetTower(s,0);
 assert.equal(reset.level,1);
 assert.equal(reset.insurance.checkpoint,null,'manual reset cancels the policy');
 assert.equal(reset.insurance.price,insured.price,'next DMS tariff remains escalated');
 assert.equal(s.players[0].balance,balance,'manual reset never refunds insurance');
 assert.equal(s.insuranceSpent,spent,'spent funds stay in the currency ledger');
 assert.equal(reset.record,record);
 assert.deepEqual(reset.artifacts,artifacts);
 assert.ok(validTower(reset));
 assert.equal(completeTower(s,0,false).level,1,'defeat after reset cannot return to the old insured floor');
 assert.equal(buyTowerInsurance(s,0),insured.price,'new DMS purchase uses existing tariff');
 assert.ok(validTower(towerFor(s,0)));
});

test('insufficient funds do not change price, policy or bank',()=>{
 const s=betNewSession(['Игрок'],49),before=structuredClone(towerFor(s,0));
 assert.throws(()=>buyTowerInsurance(s,0),/Недостаточно/);assert.deepEqual(towerFor(s,0),before);assert.equal(s.players[0].balance,49);assert.equal(s.insuranceSpent,0);
});

test('renewal moves the checkpoint from floor five to seven, captures the new build and is consumed once',()=>{
 const s=betNewSession(['Игрок'],1000);reach(s,0,5);buyTowerInsurance(s,0);
 const old=structuredClone(towerFor(s,0).insurance.checkpoint),t=reach(s,0,7);
 t.stats=redistributeStat(t,0,t.stats[0]+1);t.prosthetics=['leg-1-lower'];
 const chosen=structuredClone({stats:t.stats,prosthetics:t.prosthetics});
 assert.equal(buyTowerInsurance(s,0),60);
 assert.equal(s.players[0].balance,640);assert.equal(s.insuranceSpent,360);
 assert.equal(t.insurance.price,330);assert.equal(t.insurance.checkpoint.level,7);
 assert.deepEqual(t.insurance.checkpoint.stats,chosen.stats);
 assert.deepEqual(t.insurance.checkpoint.prosthetics,chosen.prosthetics);
 assert.equal(t.insurance.checkpoint.bossEncounter,undefined,'old floor-five boss encounter is replaced too');
 assert.equal(old.level,5);assert.ok(validTower(t));
 reach(s,0,8);const restored=completeTower(s,0,false);
 assert.equal(restored.level,7);assert.deepEqual(restored.stats,chosen.stats);
 assert.deepEqual(restored.prosthetics,chosen.prosthetics);
 assert.equal(restored.insurance.checkpoint,null);assert.equal(restored.insurance.price,330);
 assert.equal(completeTower(s,0,false).level,1,'renewal replaces the old policy rather than stacking it');
});


test('successive renewals rise by 10% and repurchase uses the current tariff without increasing it',()=>{
 const s=betNewSession(['Игрок'],1000);reach(s,0,5);
 assert.equal(buyTowerInsurance(s,0),300);assert.equal(towerFor(s,0).insurance.price,300);
 reach(s,0,7);assert.equal(buyTowerInsurance(s,0),60);assert.equal(towerFor(s,0).insurance.price,330);
 reach(s,0,8);assert.equal(buyTowerInsurance(s,0),66);assert.equal(towerFor(s,0).insurance.price,363);
 const restored=completeTower(s,0,false);
 assert.equal(restored.level,8);assert.equal(restored.insurance.checkpoint,null);
 assert.equal(buyTowerInsurance(s,0),363);assert.equal(towerFor(s,0).insurance.price,363);
 assert.equal(s.insuranceSpent,789);assert.equal(s.players[0].balance,211);
});

test('unaffordable renewal preserves the old checkpoint, tariff and money accounting',()=>{
 const s=betNewSession(['Игрок'],350);reach(s,0,5);buyTowerInsurance(s,0);reach(s,0,7);
 const before=structuredClone(s);
 assert.throws(()=>buyTowerInsurance(s,0),/Недостаточно/);
 assert.deepEqual(s,before);assert.equal(completeTower(s,0,false).level,5);
});

test('legacy policy migrates with its checkpoint and new renewals survive reloading',()=>{
 const dom=new JSDOM('',{url:'https://dms-renew.test/'});globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='dms-renew';
 try{
  const s=betNewSession(['Игрок'],1000);reach(s,0,5);buyTowerInsurance(s,0);
  // Reproduce a saved policy bought under the old tariff and denomination.
  delete s.economyVersion;s.capital=100;s.insuranceSpent=50;s.players[0].balance=50;
  towerFor(s,0).insurance.price=52;ctx.betting=s;bettingSave();
  const legacy=bettingLoad();assert.ok(legacy);assert.equal(towerFor(legacy,0).insurance.price,300);
  reach(legacy,0,7);assert.equal(buyTowerInsurance(legacy,0),60);
  assert.equal(towerFor(legacy,0).insurance.price,330);
  ctx.betting=legacy;bettingSave();const loaded=bettingLoad();assert.ok(loaded);
  assert.equal(loaded.players[0].balance,440);assert.equal(loaded.insuranceSpent,560);
  assert.equal(completeTower(loaded,0,false).level,7);
 }finally{dom.window.close();}
});

test('DMS never renews itself during wins, reentry or Shelter switching',()=>{
 const f=startBossScenario({floor:5});
 const previous=globalThis.confirm;globalThis.confirm=()=>false;
 try{
  towerPreparation();document.querySelector('#tower-insurance').click();confirmDms();
  const paid=structuredClone(towerFor(f.session,0).insurance);
  const bank=f.session.players[0].balance,spent=f.session.insuranceSpent;
  reach(f.session,0,7);towerPreparation();
  document.querySelector('#tower-upgrade-open').click();
  document.querySelector('[data-upgrade-tab="artifacts"]').click();
  document.querySelector('.tower-upgrade-close').click();
  towerPreparation();
  assert.deepEqual(towerFor(f.session,0).insurance,paid,'neither winning nor reopening Shelter buys a renewal');
  assert.equal(f.session.players[0].balance,bank);
  assert.equal(f.session.insuranceSpent,spent);
  assert.equal(document.querySelector('#tower-insurance-status').hidden,true,'redundant DMS status is not visible');
  assert.equal(document.querySelector('#tower-insurance-status').textContent,'');
  assert.match(document.querySelector('#tower-insurance').title,/ПРОДЛЕНИЕ ВРУЧНУЮ/,
    'manual renewal is still explained on the actionable insurance control');
  document.querySelector('#tower-insurance').click();cancelDms();
  assert.deepEqual(towerFor(f.session,0).insurance,paid,'cancelled renewal is free');
  assert.equal(f.session.insuranceSpent,spent);
 }finally{globalThis.confirm=previous;f.close();}
});

test('preparation offers active-policy renewal on a higher floor and blocks accidental repeat charging',()=>{
 const f=startBossScenario({floor:5});
 const previous=globalThis.confirm;let confirmations=0;globalThis.confirm=()=>{confirmations++;return true;};
 try{
  towerPreparation();const button=document.querySelector('#tower-insurance');button.click();confirmDms();
  reach(f.session,0,7);towerPreparation();
  assert.equal(button.disabled,false);assert.ok(button.classList.contains('is-active'));
  assert.match(button.textContent,/ПРОДЛИТЬ ДМС.*60/);assert.match(button.title,/этажа 5 на этаж 7/);
  button.click();assert.equal(f.session.players[0].balance,700,'renewal is not charged before confirmation');confirmDms();assert.equal(f.session.players[0].balance,640);
  assert.equal(towerFor(f.session,0).insurance.checkpoint.level,7);
  assert.match(button.textContent,/ДМС.*ЭТАЖ 7/);assert.ok(button.disabled);
  assert.match(document.querySelector('#tower-prep-error').textContent,/ДМС продлена/);
  button.click();towerPreparation();assert.equal(confirmations,0,'no browser confirmation is used');assert.equal(f.session.insuranceSpent,360);
  assert.equal(bettingLoad().towers[0].insurance.checkpoint.level,7);
 }finally{globalThis.confirm=previous;f.close();}
});

test('purchased DMS and its monetary sink survive storage, and old saves receive a free empty policy',()=>{
 const dom=new JSDOM('',{url:'https://dms-save.test/'});globalThis.localStorage=dom.window.localStorage;ctx.BET_STORAGE='dms';
 try{
  const s=betNewSession(['Игрок'],1000);reach(s,0,5);buyTowerInsurance(s,0);ctx.betting=s;bettingSave();
  const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.insuranceSpent,300);assert.equal(loaded.players[0].balance,700);assert.deepEqual(loaded.towers[0].insurance,s.towers[0].insurance);
  completeTower(loaded,0,false);ctx.betting=loaded;bettingSave();const used=bettingLoad();assert.ok(used);assert.equal(used.towers[0].level,5);assert.equal(used.towers[0].insurance.checkpoint,null);
  used.insuranceSpent=0;localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(used));assert.equal(bettingLoad(),null,'currency imbalance is rejected');
  const legacy=betNewSession(['Старый'],100);towerFor(legacy,0);delete legacy.insuranceSpent;delete legacy.towers[0].insurance;
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(legacy));const migrated=bettingLoad();assert.ok(migrated);assert.deepEqual(migrated.towers[0].insurance,{price:300,checkpoint:null});assert.equal(migrated.players[0].balance,100);
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
  towerPreparation();const button=document.querySelector('#tower-insurance'),wallet=document.querySelector('#tower-prep-name');
  assert.equal(wallet.querySelector('.tower-player-name').firstChild.textContent,f.session.players[ctx.towerPlayer].name);
   assert.match(wallet.querySelector('.tower-record-height').textContent,/РЕКОРДНАЯ ВЫСОТА: 4 ЭТАЖ/);
  assert.match(wallet.querySelector('.tower-player-bank').textContent,/1\s*000/);
  assert.equal(document.querySelector('#tower-prep-menu'),null);assert.match(button.textContent,/ДМС.*300/);assert.equal(button.classList.contains('is-active'),false);
  button.click();assert.equal(f.session.players[0].balance,1000);confirmDms();assert.equal(f.session.players[0].balance,700);
  assert.equal(wallet.querySelector('[data-player-balance]').dataset.balanceTarget,'700');
  assert.ok(wallet.querySelector('[data-player-balance]').classList.contains('is-debit'),'DMS charge flashes red');
  assert.match(button.textContent,/ДМС.*ЭТАЖ 5/);assert.ok(button.classList.contains('is-active'));assert.ok(button.disabled);
  button.click();towerPreparation();assert.equal(f.session.insuranceSpent,300);assert.match(button.textContent,/ЭТАЖ 5/);
  document.querySelector('#tower-fight').click();advanceStartup(10);ctx.combat.winner=1;ctx.combat.finished=true;settleTower(1);towerResults();
  assert.equal(towerFor(f.session,0).level,5);assert.equal(towerFor(f.session,0).insurance.checkpoint,null);
  const resultWallet=document.querySelector('#tower-results-player');
  assert.equal(resultWallet.hidden,false);assert.equal(resultWallet.querySelector('.tower-player-name').textContent,f.session.players[ctx.towerPlayer].name);
  assert.equal(resultWallet.querySelector('[data-player-balance]').dataset.balanceTarget,'700');
  assert.doesNotMatch(document.querySelector('#bet-result-summary').textContent,/БАНК:/,'bank is not duplicated below artifacts');
  assert.match(ctx.resultsSummary.textContent,/ДМС сработала/);assert.match(ctx.resultsAgain.textContent,/ДМС.*5/);assert.ok(bettingLoad());
  towerPreparation();assert.match(button.textContent,/ДМС.*300/);assert.equal(button.classList.contains('is-active'),false);
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
