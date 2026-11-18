import {quipCategory} from '../src/ui/streamer-quips.js';
import {compareStrikeCandidates} from '../src/systems/combat.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import {segmentDistance} from '../src/utils/math.js';
import {TOWER_ARENA_CAPACITY,validTowerFloorPlan} from '../src/tower/floors.js';
import {createRobot} from '../src/robot/robot.js';
import {lightPolygon} from '../src/render/lighting.js';
import {paint} from '../src/render/frame.js';
import {combatAttacks} from '../src/systems/combat.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {newTower,towerFor,rewardTower,completeTower,resetTower,validTower,floorEnemyCount,towerEnemyCount,normalizeTower,buyTowerSurgery} from '../src/tower/model.js';
import {chooseTowerMutation,towerMutationEffectText,TOWER_MUTATIONS,towerMutationSnapshot} from '../src/tower/mutations.js';
import {towerUpgradeApplies} from '../src/tower/upgrade-appearance.js';
import {betNewSession,betCommit,betResolve,betAddPlayer} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {installTowerUI,openMenu,settleTower} from '../src/tower/ui.js';
import {initializeModalFocus} from '../src/ui/modal-focus.js';
import {controlledIntent} from '../src/tower/input.js';
import {advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {note} from '../src/game/events.js';
import {patientGarage,patientSkin,patientCombatStats} from '../src/game/patients.js';
import {patientName} from '../src/ui/patient.js';
import {showResults} from '../src/ui/results.js';
function setup(s,tower,arenaId='ward'){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://tower.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 globalThis.confirm=()=>true;
 initializeGame({session:s,entry:'tower',tower:structuredClone(tower),arenaId});
 // Pixi copies the SVG handler before installTowerUI; exercise that exact order.
 const canvas=document.createElement('canvas');canvas.id='copied-arena';canvas.onclick=ctx.svg.onclick;ctx.svg.after(canvas);
 installTowerUI();return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();ctx.mode='spectator';}

test('saved floor profiles reach live robots, texture keys, voices and preparation choices',()=>{
 const session=betNewSession(['Проверка'],100),t=towerFor(session,0);
 t.floorPlan={floor:1,selected:0,options:[
  {arenaId:'ward',kind:'standard',profiles:['fast','agile']},
  {arenaId:'ward',kind:'danger',style:'crowd',profiles:['strong','elite']}
 ]};
 const dom=setup(session,t,'ward');
 try{
  assert.equal(ctx.robots.length,3);
  assert.deepEqual(ctx.towerGarage[1].stats,[7,2,3]);
  assert.deepEqual(ctx.towerGarage[2].stats,[3,2,7]);
  assert.equal(ctx.towerGarage[1].voice,'male');
  assert.equal(ctx.towerGarage[2].voice,'female');
  assert.equal(ctx.robots[1].body.skinKey,'robotEnemy1');
  assert.equal(ctx.robots[2].body.skinKey,'robotEnemy3');
  assert.equal(ctx.cardNodes[1].card.dataset.enemyProfile,'fast');
  assert.match(ctx.cardNodes[1].card.textContent,/Быстрый/);
  const buttons=[...document.querySelectorAll('.tower-challenge-option')];
  assert.equal(buttons.length,2);
  assert.equal(buttons[0].getAttribute('aria-pressed'),'true');
  assert.match(buttons[1].textContent,/ОПАСНО/);
  assert.match(buttons[1].textContent,/ПЕРЕПОЛНЕНИЕ/);
  assert.match(buttons[0].dataset.hint,/Скорость 160%/);
  assert.match(buttons[0].dataset.hint,/Поворот 160%/);
  assert.match(buttons[1].dataset.hint,/Критический удар 50%/);
  assert.doesNotMatch(buttons[0].textContent,/Скорость 160%/,'long profile descriptions move to the hint');
  assert.equal(buttons[0].classList.contains('is-standard'),true);
  assert.equal(buttons[1].classList.contains('is-danger'),true);
  assert.equal(buttons[0].classList.contains('is-selected'),true);
  assert.ok(buttons.every(b=>b.hasAttribute('data-hint-tap')));
  const css=fs.readFileSync(new URL('../styles/tower.css',import.meta.url),'utf8');
  assert.match(css,/\.tower-challenge-option\.is-selected\{border:2px solid #62cf7d/);
 }finally{close(dom);}
});

test('post-boss module choices lock fight entry and update the actual player combat stats',()=>{
 const s=betNewSession(['Выбор'],1000),t=towerFor(s,0);
 for(let i=0;i<5;i++)completeTower(s,0,true,()=>.24);
 const draft=[...t.mutationDraft.options];
 const dom=setup(s,t,'ward');
 try{
  const panel=document.querySelector('#tower-prep-mutations');
  assert.equal(panel.hidden,false);
  assert.match(panel.textContent,/БОСС СПИСАН/);
  const buttons=[...panel.querySelectorAll('.tower-mutation-option')];
  assert.equal(buttons.length,3);
  const fight=document.querySelector('#tower-fight');
  assert.equal(fight.disabled,true,'must select a module before entering next fight');
  const before=patientCombatStats(0,ctx.robots[0]).effective;
  buttons[0].click();
  assert.ok(t.mutationDraft,'selecting a card never claims or installs');
  document.querySelector('.tower-mutation-claim').click();
  assert.equal(t.mutationDraft,undefined);
  assert.equal(t.mutationInventory[0].type,draft[0]);
  assert.deepEqual(t.mutations,[],'unpaid module does not change combat');
  document.querySelector('.tower-mutation-install').click();
  assert.deepEqual(t.mutations,[draft[0]]);
  assert.deepEqual(ctx.towerGarage[0].mutations,t.mutations);
  assert.equal(fight.disabled,false);
  assert.match(panel.textContent,/УСТАНОВЛЕНО/);
  document.querySelector('.tower-upgrade-close').click();
  const after=patientCombatStats(0,ctx.robots[0]).effective;
  assert.ok(after.some((x,i)=>x>before[i]),'module changes real patient combat statistics');
  assert.ok(validTower(t));
  fight.click();advanceStartup(20);
  assert.equal(ctx.startup.phase,'running');
 }finally{close(dom);}
});

function unlockSurgeryForTest(session,run){
 for(let i=0;i<10;i++){
  if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.24);
 }
}

test('surgeon lets the player buy one body-specific operation and saves combat impact',()=>{
 const s=betNewSession(['Хирург'],300),t=towerFor(s,0);
 unlockSurgeryForTest(s,t);
 const dom=setup(s,t,'ward');
 try{
  const panel=document.querySelector('#tower-prep-surgery');
  assert.equal(panel.hidden,false);
  assert.equal(panel.querySelector('.tower-surgery-purchase').disabled,true,
   'pending mutation choice blocks surgery');
  document.querySelector('#tower-prep-mutations .tower-mutation-option').click();
  document.querySelector('.tower-mutation-claim').click();
  const purchase=panel.querySelector('.tower-surgery-purchase');
  const type=panel.querySelector('[aria-label="Вид операции"]');
  type.value='impact';type.dispatchEvent(new Event('change'));
  const site=panel.querySelector('[aria-label="Сегмент для операции"]');
  site.value='arm-1-upper';
  assert.equal(purchase.disabled,false);
  const base=patientCombatStats(0,ctx.robots[0]).effective[1];
  purchase.click();
  assert.equal(s.players[0].balance,240);
  assert.equal(s.surgerySpent,60);
  assert.deepEqual(t.surgeries,[{site:'arm-1-upper',procedure:'impact'}]);
  assert.deepEqual(ctx.towerGarage[0].surgeries,t.surgeries);
  assert.ok(patientCombatStats(0,ctx.robots[0]).effective[1]>=base+.45-1e-6);
  assert.match(panel.textContent,/ХИРУРГИЯ · 1\/1/);
  assert.equal(bettingLoad().surgerySpent,60);
  const insured=document.querySelector('#tower-insurance');insured.click();
  assert.deepEqual(t.insurance.checkpoint.surgeries,t.surgeries);
  assert.equal(s.players[0].balance,190);
  assert.ok(validTower(t));
 }finally{close(dom);}
});

test('purchases during preparation take effect on the SAME floor, including graft geometry and module atlas',()=>{
 const s=betNewSession(['Момент установки'],1000),run=towerFor(s,0);
 unlockSurgeryForTest(s,run);
 const chosen=run.mutationDraft.options[0];
 const dom=setup(s,run,'ward');
 try{
  const initial=ctx.robots[0];
  assert.equal(initial.body.limbs?.length??4,4,'normal preoperative fighter has four limbs');
  document.querySelector('#tower-prep-mutations .tower-mutation-option').click();
  document.querySelector('.tower-mutation-claim').click();
  const surgery=document.querySelector('#tower-prep-surgery');
  const procedure=surgery.querySelector('[aria-label="Вид операции"]');
  procedure.value='graft_arm';procedure.dispatchEvent(new Event('change'));
  const site=surgery.querySelector('[aria-label="Сегмент для операции"]');
  site.value='arm-1-upper';
  surgery.querySelector('.tower-surgery-purchase').click();
  assert.equal(run.surgeries[0].procedure,'graft_arm');
  assert.equal(run.mutationInventory.at(-1).type,chosen);
  assert.deepEqual(run.mutations,[],'claimed item is not active before paid installation');
  document.querySelector('.tower-mutation-install').click();
  assert.deepEqual(run.mutations,[chosen],'paid installation activates the module');
  assert.equal(s.mutationSpent,100);
  assert.equal(ctx.towerRun.surgeries.length,0,'preparation started from a detached snapshot');
  document.querySelector('.tower-upgrade-close').click();
  document.querySelector('#tower-fight').click();
  assert.equal(ctx.startup.phase,'spawning');
  assert.equal(ctx.towerRun.surgeries[0].procedure,'graft_arm');
  assert.deepEqual(ctx.towerRun.mutations,[chosen]);
  assert.notEqual(ctx.robots[0],initial,'fighter is rebuilt after purchases');
  assert.equal(ctx.robots[0].body.limbs.length,5);
  const piece=ctx.robots[0].actor.querySelector('[data-skin-segment="arm-1-graft-upper"] image');
  assert.ok(piece,'new arm has texture in the immediately upcoming fight');
  const siteForModule=Object.keys(ctx.robots[0].body.skinParts).find(key=>towerUpgradeApplies(chosen,key));
  assert.ok(siteForModule,'selected module changes an atlas part');
  const modified=ctx.robots[0].actor.querySelector('[data-skin-segment="'+siteForModule+'"] image');
  assert.ok(modified,'modified segment has an SVG sprite');
  assert.ok(modified.getAttribute('href').endsWith('ar_mod_'+chosen+'.png'),
   'chosen mutation texture is already active');
  advanceStartup(20);
  assert.equal(ctx.startup.phase,'running');
  assert.ok(validTower(run));
 }finally{close(dom);}
});

test('real global modal guard allows mouse and touch events inside modernization but blocks the background',()=>{
 const s=betNewSession(['Защита кликов'],300),run=towerFor(s,0);
 unlockSurgeryForTest(s,run);
 if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
 const dom=setup(s,run,'ward');
 try{
  document.querySelector('#launch-overlay').hidden=true;
  initializeModalFocus(); // The real app installs this after Tower UI.
  const launch=document.querySelector('#tower-upgrade-open');
  const modal=document.querySelector('#tower-upgrade-window');
  launch.click();
  assert.equal(modal.open,true);
  const surgery=modal.querySelector('[data-upgrade-tab="surgery"]');
  for(const type of ['pointerdown','pointerup'])
   assert.equal(surgery.dispatchEvent(new dom.window.MouseEvent(type,{bubbles:true,cancelable:true})),true,
    type+' must not be cancelled by the global modal guard');
  surgery.click();
  assert.equal(surgery.getAttribute('aria-selected'),'true',
   'actual bubbling click must reach the surgical tab');
  const tabEvent=new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true});
  surgery.dispatchEvent(tabEvent);
  assert.equal(tabEvent.defaultPrevented,false,
   'native modal owns keyboard focus, not the underlying preparation sheet');
  let backgroundClicks=0;
  const fight=document.querySelector('#tower-fight');
  fight.addEventListener('click',()=>backgroundClicks++);
  fight.click();
  assert.equal(backgroundClicks,0,'background fight must remain blocked while upgrading');
  assert.equal(ctx.startup.phase,'tower-ready');
  modal.querySelector('.tower-upgrade-close').click();
  assert.equal(modal.open,false,'cross button must pass global capture handler');
  assert.equal(modal.hidden,true);
  launch.click();
  assert.equal(modal.open,true,'the same dialog must reopen');
  modal.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert.equal(modal.open,false,'Escape must close the dialog');
 }finally{close(dom);}
});
test('global capture guard allows auto-open boss reward choice and live surgery purchase',()=>{
 const s=betNewSession(['Награда и хирургия'],300),run=towerFor(s,0);
 unlockSurgeryForTest(s,run);
 const dom=setup(s,run,'ward');
 try{
  document.querySelector('#launch-overlay').hidden=true;
  const modal=document.querySelector('#tower-upgrade-window');
  assert.equal(modal.open,true,'boss reward dialog opens before global modal focus initialization');
  initializeModalFocus();
  const module=modal.querySelector('.tower-mutation-option');
  module.click();
  assert.ok(run.mutationDraft,'selection has no side effects');
  modal.querySelector('.tower-mutation-claim').click();
  assert.equal(run.mutationDraft,undefined,'claim must not be swallowed by capture guard');
  const tab=modal.querySelector('[data-upgrade-tab="surgery"]');
  tab.click();
  assert.equal(tab.getAttribute('aria-selected'),'true');
  const proc=modal.querySelector('[aria-label="Вид операции"]');
  proc.value='impact';proc.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  const segment=modal.querySelector('[data-upgrade-site="arm-1-upper"]');
  segment.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  assert.equal(modal.querySelector('[aria-label="Сегмент для операции"]').value,'arm-1-upper');
  modal.querySelector('.tower-surgery-purchase').click();
  assert.deepEqual(run.surgeries,[{site:'arm-1-upper',procedure:'impact'}],
   'surgery purchase must receive bubbling click through modal focus');
  modal.querySelector('.tower-upgrade-close').click();
  assert.equal(modal.open,false);
 }finally{close(dom);}
});


test('Tower II upgrade screen displays coin art, real equipped bonuses and one receipt',()=>{
 const s=betNewSession(['Баланс UI'],1000),t=towerFor(s,0);
 for(let i=0;i<5;i++)completeTower(s,0,true,()=>.24);
 const choice=t.mutationDraft.options[0],bonuses=TOWER_MUTATIONS[choice].bonus;
 const dom=setup(s,t,'ward');
 try{
  const modal=document.querySelector('#tower-upgrade-window');
  const stats=modal.querySelector('#tower-upgrade-stats');
  assert.ok(document.querySelector('[data-tower-apply] img.chip-icon'),'skill transfer button shows real coin asset');
  assert.match(modal.querySelector('.tower-upgrade-wallet').textContent,/БАНК:/);
  assert.ok(modal.querySelector('.tower-upgrade-wallet img.chip-icon'));
  const options=[...modal.querySelectorAll('.tower-mutation-option')];
  assert.ok(options[0].textContent.includes(towerMutationEffectText(choice).split(' · ')[0]));
  options[0].click();
  const predicted=[...stats.querySelectorAll('.tower-upgrade-stat .tower-stat-after')];
  bonuses.forEach((value,index)=>assert.equal(predicted[index].classList.contains('is-positive'),value>0));
  const balance=s.players[0].balance;
  modal.querySelector('.tower-mutation-claim').click();
  assert.equal(s.players[0].balance,balance,'claim is free');
  assert.ok(modal.querySelector('.tower-mutation-install img.chip-icon'),'installation button shows coin art');
  assert.equal(modal.querySelector('#tower-upgrade-feedback').textContent,'','claim message is not duplicated at the bottom');
  assert.equal(modal.querySelectorAll('.tower-operation-receipt').length,1);
  const selected=modal.querySelector('.tower-inventory-item.is-selected');
  assert.ok(selected,'just claimed module remains selected in inventory');
  assert.deepEqual(t.mutations,[],'selection still does not apply the module');
  assert.ok([...stats.querySelectorAll('.tower-stat-after')].some(el=>el.classList.contains('is-positive')),
   'owned module previews its bonus before purchase');
  modal.querySelector('.tower-mutation-install').click();
  assert.deepEqual(t.mutations,[choice]);
  assert.equal(s.players[0].balance,balance-100);
  assert.equal(modal.querySelector('#tower-upgrade-feedback').textContent,'');
  assert.equal(modal.querySelectorAll('.tower-operation-receipt').length,1);
  assert.match(modal.querySelector('.tower-operation-receipt').textContent,/установлен/);
  const actual=towerMutationSnapshot(t).effective;
  const formatted=n=>(Math.round(n*100)/100).toLocaleString('ru-RU',{maximumFractionDigits:2});
  const current=[...modal.querySelectorAll('.tower-upgrade-stat .tower-stat-before')].map(e=>e.textContent);
  assert.deepEqual(current,actual.map(formatted),'modal re-reads paid, actually active bonuses');
  assert.equal(modal.querySelector('.tower-upgrade-wallet [data-balance-target]').dataset.balanceTarget,'900');
  assert.ok(modal.querySelector('.tower-inventory-item.is-equipped'));
 }finally{close(dom);}
});

test('surgery implant texture survives a switch between modernization tabs and prices show coins',()=>{
 const s=betNewSession(['Хирургия UI'],1000),t=towerFor(s,0);
 unlockSurgeryForTest(s,t);
 const dom=setup(s,t,'ward');
 try{
  const modal=document.querySelector('#tower-upgrade-window');
  modal.querySelector('.tower-mutation-option').click();
  modal.querySelector('.tower-mutation-claim').click();
  modal.querySelector('[data-upgrade-tab="surgery"]').click();
  const procedure=modal.querySelector('[aria-label="Вид операции"]');
  procedure.value='impact';procedure.dispatchEvent(new Event('change'));
  const site=modal.querySelector('[aria-label="Сегмент для операции"]');
  site.value='arm-1-upper';site.dispatchEvent(new Event('change'));
  const purchase=modal.querySelector('.tower-surgery-purchase');
  assert.ok(purchase.querySelector('img.chip-icon'),'surgery price must render a coin, not its HTML');
  assert.doesNotMatch(purchase.textContent,/<img/);
  purchase.click();
  assert.equal(t.surgeries[0].site,'arm-1-upper');
  const sprite=()=>modal.querySelector('[data-upgrade-site="arm-1-upper"] image');
  assert.match(sprite()?.getAttribute('href')??'',/ar_surg_impact\.png/);
  modal.querySelector('[data-upgrade-tab="mutations"]').click();
  modal.querySelector('[data-upgrade-tab="surgery"]').click();
  assert.match(sprite()?.getAttribute('href')??'',/ar_surg_impact\.png/,
   'default surgery controls must not replace an already implanted texture in the preview');
  assert.equal(modal.querySelector('#tower-upgrade-feedback').textContent,'');
  assert.equal(modal.querySelectorAll('#tower-prep-surgery .tower-operation-receipt').length,1);
  const replacement=modal.querySelector('[aria-label="Вид операции"]');
  replacement.value='reflex';replacement.dispatchEvent(new Event('change'));
  const after=[...modal.querySelectorAll('.tower-upgrade-stat .tower-stat-after')];
  assert.equal(after[1].classList.contains('is-negative'),true,'less strength is red');
  assert.equal(after[2].classList.contains('is-positive'),true,'more maneuver is green');
 }finally{close(dom);}
});
test('Shelter is a separate window with a horizontal patient and three real tabs',()=>{
 const s=betNewSession(['Модернизация'],250),t=towerFor(s,0),dom=setup(s,t,'ward');
 try{
  const launch=document.querySelector('#tower-upgrade-open');
  const modal=document.querySelector('#tower-upgrade-window');
  assert.equal(modal.tagName,'DIALOG','use browser top layer instead of an ordinary DIV');
  assert.ok(launch,'preparation opens the separate upgrade dialog');
  assert.equal(modal.hidden,true,'no forced popup before first boss');
  assert.equal(document.querySelector('#tower-prep-mutations').closest('#tower-upgrade-window'),modal);
  assert.equal(document.querySelector('#tower-prep-surgery').closest('#tower-upgrade-window'),modal);
  launch.click();
  assert.equal(modal.hidden,false);
  assert.equal(modal.hasAttribute('open'),true,'a native dialog must be opened for hit testing');
  assert.match(modal.textContent,/УБЕЖИЩЕ/);
  assert.equal(modal.querySelectorAll('[role="tab"]').length,3);
  assert.equal(modal.querySelector('[data-tower-patient-pose]').getAttribute('data-tower-patient-pose'),'horizontal');
  assert.equal(modal.querySelectorAll('[data-upgrade-site]').length,13);
  const surgeryTab=modal.querySelector('[data-upgrade-tab="surgery"]');
  assert.equal(surgeryTab.disabled,true,'surgery is locked before beating second boss');
  assert.match(surgeryTab.title,/вторым боссом/);
  modal.querySelector('[data-upgrade-tab="artifacts"]').click();
  assert.equal(modal.querySelector('[data-upgrade-tab="artifacts"]').getAttribute('aria-selected'),'true');
  assert.equal(modal.querySelector('#tower-upgrade-artifacts-page').hidden,false);
  assert.equal(modal.querySelectorAll('.artifact').length,4);
  assert.equal(document.querySelector('#tower-artifact-view'),null,'no old collection under preparation');
  modal.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(modal.hidden,true);
  assert.equal(modal.hasAttribute('open'),false,'closing exits the native top layer');
  assert.equal(document.activeElement,launch,'closing returns focus to preparation');
  launch.click();assert.equal(modal.hidden,false);
  assert.equal(openMenu(),true);
  assert.equal(modal.hidden,true,'leaving preparation closes the dialog');
  assert.equal(modal.hasAttribute('open'),false,'menu transition cannot leave a hidden top-layer dialog');
 }finally{close(dom);}
});

test('modernization selects surgical body parts from horizontal patient and previews atlas before purchase',()=>{
 const s=betNewSession(['Операция'],300),t=towerFor(s,0);
 unlockSurgeryForTest(s,t);
 const dom=setup(s,t,'ward');
 try{
  const modal=document.querySelector('#tower-upgrade-window');
  assert.equal(modal.hidden,false,'boss milestone reward opens on modifications');
  assert.equal(modal.hasAttribute('open'),true,'automatic milestone prompt enters native top layer');
  const draftButton=modal.querySelector('.tower-mutation-option');
  assert.ok(draftButton);
  draftButton.dispatchEvent(new dom.window.MouseEvent('mouseenter',{bubbles:true}));
  assert.match(modal.querySelector('#tower-upgrade-stats').textContent,/ПРЕДПРОСМОТР/);
  draftButton.click();
  modal.querySelector('.tower-mutation-claim').click();
  assert.equal(t.mutationDraft,undefined);
  assert.equal(modal.querySelector('#tower-upgrade-open'),null);
  modal.querySelector('[data-upgrade-tab="surgery"]').click();
  const procedure=modal.querySelector('[aria-label="Вид операции"]');
  procedure.value='impact';procedure.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  const target=modal.querySelector('[data-upgrade-site="arm--1-lower"]');
  assert.equal(target.getAttribute('aria-disabled'),'false');
  target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));
  assert.equal(modal.querySelector('[aria-label="Сегмент для операции"]').value,'arm--1-lower');
  assert.match(modal.querySelector('#tower-upgrade-stats').textContent,/ПРЕДПРОСМОТР: Боек/);
  assert.match(modal.querySelector('[data-upgrade-site="arm--1-lower"] image').getAttribute('href'),/ar_surg_impact\.png$/);
  const before=patientCombatStats(0,ctx.robots[0]).effective[1];
  modal.querySelector('.tower-surgery-purchase').click();
  assert.deepEqual(t.surgeries,[{site:'arm--1-lower',procedure:'impact'}]);
  assert.ok(patientCombatStats(0,ctx.robots[0]).effective[1]>before);
  assert.equal(modal.querySelector('#tower-upgrade-feedback').textContent,'','successful operation must not duplicate receipt');
  assert.match(modal.querySelector('#tower-prep-surgery .tower-operation-receipt').textContent,/Операция/);
  modal.querySelector('.tower-upgrade-close').click();
  assert.equal(modal.hidden,true);
  assert.equal(modal.hasAttribute('open'),false);
  assert.equal(document.querySelector('#tower-fight').disabled,false);
 }finally{close(dom);}
});

test('modified live body skin uses exact replacement PNG and falls back only for a failed segment',()=>{
 const session=betNewSession(['Протезы'],300),run=towerFor(session,0);
 unlockSurgeryForTest(session,run);
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 assert.equal(buyTowerSurgery(session,0,'impact','arm-1-upper'),60);
 const dom=setup(session,run,'ward');
 try{
  const player=ctx.robots[0];
  const piece=player.actor.querySelector('[data-skin-segment="arm-1-upper"] image');
  assert.ok(piece,'arena renders a texture for the modified upper arm');
  assert.match(piece.getAttribute('href'),/ar_surg_impact\.png$/);
  const unaffected=player.actor.querySelector('[data-skin-segment="head"] image').getAttribute('href');
  const enemyPiece=ctx.robots[1].actor.querySelector('[data-skin-segment="arm-1-upper"] image');
  const opponent=enemyPiece?.getAttribute('href');
  piece.dispatchEvent(new dom.window.Event('error'));
  assert.ok(piece.getAttribute('href').endsWith(
    ['r_01.png','r_02.png','r_03.png','r_04.png'][run.patient]),
   'only the failed surgical texture reverts to the patient\'s own original skin');
  assert.equal(player.actor.querySelector('[data-skin-segment="head"] image').getAttribute('href'),unaffected);
  assert.equal(enemyPiece?.getAttribute('href'),opponent);
 }finally{close(dom);}
});

test('generated tower encounters start with complete rigs clear on every supported arena',()=>{
 const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
 for(const [arenaId,capacity] of Object.entries(TOWER_ARENA_CAPACITY)){
  const session=betNewSession(['Геометрия'],100);
  const tower=towerFor(session,0);
  const profiles=Array.from({length:capacity-1},(_,i)=>i%2?'fast':'basic');
  tower.floorPlan={floor:1,selected:0,options:[
   {arenaId,kind:'standard',profiles},
   {arenaId,kind:'danger',style:'mixed',profiles:[...profiles]}
  ]};
  assert.equal(validTowerFloorPlan(tower.floorPlan,1),true,arenaId+' plan is legal');
  const dom=setup(session,tower,arenaId);
  try{
   assert.equal(ctx.robots.length,capacity,arenaId+' should use its declared maximum');
   for(const robot of ctx.robots)for(const capsule of robot.capsules){
    assert.ok(staticContacts(capsule).every(hit=>hit.depth<=(isLimb(capsule)?5:0)+1e-6),
     arenaId+': '+robot.id+' '+capsule.segment+' intersects a wall or obstacle');
   }
   for(let i=0;i<ctx.robots.length;i++)for(let j=i+1;j<ctx.robots.length;j++){
    for(const a of ctx.robots[i].capsules.filter(solid))
     for(const b of ctx.robots[j].capsules.filter(solid))
      assert.ok(segmentDistance(a.a,a.b,b.a,b.b)>=a.r+b.r+.15-1e-6,
       arenaId+': bodies '+i+' and '+j+' overlap at spawn');
   }
  }finally{close(dom);}
 }
});

test('tower hides all arena names and hostile lights, while player rays and perception remain independent',()=>{
 const s=betNewSession(['Первый']),tower=towerFor(s,0);tower.level=5;
 const dom=setup(s,tower);
 try{
  document.querySelector('#tower-fight').click();
  advanceStartup(10);
  const seed=ctx.seed,perception=ctx.robots.map(r=>r.canSee({x:350,y:350}));
  for(const profile of ['light','full']){
   ctx.renderProfile={name:profile};paint();
   assert.ok(ctx.robots.some(r=>r.isBoss),'boss encounter is covered');
   for(const r of ctx.robots){
    assert.equal(r.label.getAttribute('display'),'none');
    if(r.id!==0){
     assert.equal(Number(r.nearLight.getAttribute('opacity')),0);
     assert.equal(Number(ctx.conesG.querySelector(`[fill="url(#tag7hop-pool-${r.id})"]`).getAttribute('opacity')),0);
    }
   }
   const player=ctx.robots[0];
   assert.match(player.vision.getAttribute('d'),/^M0 0L/);
   assert.equal(player.nearLight.tagName,'path');
   assert.ok(Number(player.nearLight.getAttribute('opacity'))>0);
   player.setVisible(false);assert.equal(player.vision.getAttribute('display'),'none');
   player.setVisible(true);assert.equal(player.vision.getAttribute('display'),'');
  }
  assert.equal(ctx.seed,seed);
  assert.deepEqual(ctx.robots.map(r=>r.canSee({x:350,y:350})),perception);
 }finally{close(dom);}
});
test('flashlight rays stop at obstacle faces and arena perimeter without changing geometry',()=>{
 const s=betNewSession(['Первый']),dom=setup(s,towerFor(s,0));
 try{
  // The central obstacle spans x=300..400 and y=300..400.
  const before=JSON.stringify(ctx.obstacles),seed=ctx.seed;
  const d=lightPolygon({x:250,y:350},0,100*Math.PI/180,300);
  const points=d.slice(1,-1).split('L').map(p=>p.split(' ').map(Number));
  const straight=points.find(([x,y])=>x>0&&Math.abs(y)<.001);
  assert.ok(straight);assert.equal(straight[0],50,'central ray ends at x=300, not behind the obstacle');
  const near=lightPolygon({x:250,y:350},0,Math.PI*2,75);
  assert.ok(!near.startsWith('M0 0L'),'nearby light is a closed surrounding silhouette');
  const boundary=lightPolygon({x:40,y:350},Math.PI,Math.PI/2,300);
  for(const [x,y] of boundary.slice(1,-1).split('L').map(p=>p.split(' ').map(Number))){
   for(const plane of ctx.arenaPlanes)assert.ok(plane.nx*(40+x)+plane.ny*(350+y)<=plane.c+.1,'light stops inside the arena');
  }
  assert.equal(ctx.seed,seed);assert.equal(JSON.stringify(ctx.obstacles),before);
 }finally{close(dom);}
});
test('leaving a spawning or running tower battle confirms cancellation without recording defeat',()=>{
 for(const phase of ['spawning','running']){
  const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0));
  document.querySelector('#launch-overlay').hidden=true;
  document.querySelector('#tower-fight').click();if(phase==='running')advanceStartup(10);
  const before=structuredClone(towerFor(s,0)),time=ctx.game.time;
  globalThis.confirm=()=>false;
  assert.equal(openMenu(),false);assert.equal(ctx.startup.phase,phase);
  assert.equal(document.querySelector('#launch-overlay').hidden,true);
  globalThis.confirm=()=>true;
  assert.equal(openMenu(),true);assert.equal(ctx.startup.phase,'menu');assert.equal(ctx.paused,true);
  assert.deepEqual(towerFor(s,0),before);assert.equal(ctx.towerSettled,false);
  step(1);advanceStartup(10);assert.equal(ctx.game.time,time);assert.equal(ctx.startup.phase,'menu');
  close(dom);
 }
});
test('rewards survive restart and defeat, are once per enemy per floor and isolated per player',()=>{
 const s=betNewSession(['Первый','Второй'],100);
 assert.equal(rewardTower(s,0,1,1),false);assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,1,0),false);
 const copy=JSON.parse(JSON.stringify(s));assert.equal(rewardTower(copy,0,1,0),false);
 completeTower(s,0,true);assert.equal(towerFor(s,0).level,2);assert.deepEqual(towerFor(s,0).stats,[3,4,3]);assert.ok(validTower(towerFor(s,0)));
 assert.equal(rewardTower(s,0,1,0),false,'no payouts during preparation');towerFor(s,0).preparing=false;
 assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,2,0),true);
 completeTower(s,0,false);assert.deepEqual(towerFor(s,0),newTower(towerFor(s,0).patient,1,towerFor(s,0).artifacts));assert.equal(s.players[0].balance,130);
 assert.deepEqual(towerFor(s,1),newTower(towerFor(s,1).patient));assert.equal(s.players[1].balance,100);
 resetTower(s,0);assert.equal(s.players[0].balance,130);
});
test('tower rewards remain valid in shared betting storage after spending, settlement, joining and historical topups',()=>{
 const s=betNewSession(['Первый','Второй'],100);const dom=setup(s,towerFor(s,0));
 rewardTower(s,0,1,0);s.players[0].balance+=20;s.topUps=20;betAddPlayer(s,'Третий');
 betCommit(s,[{player:0,robot:0,amount:50},{player:1,robot:1,amount:20},{player:2,robot:2,amount:0}]);betResolve(s,0);
 bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.towerEarned,10);assert.deepEqual(loaded.towers,s.towers);assert.deepEqual(loaded.players,s.players);
 close(dom);
});
test('all arenas spawn variable counts; tower stats and cosmetics never touch regular patients',()=>{
 const s=betNewSession(['<Игрок>'],100);const t=towerFor(s,0);for(let i=0;i<7;i++)completeTower(s,0,true);t.patient=3;
 const original=structuredClone(s.garage);
 for(const arena of ['ward','ring','annulus']){
   const dom=setup(s,t,arena);assert.equal(ctx.robots.length,6);assert.equal(ctx.cardNodes.length,6);assert.equal(patientSkin(0),3);assert.equal(patientSkin(8),0);
   assert.deepEqual(patientGarage()[1].stats,[3,3,3]);assert.deepEqual(s.garage,original);assert.match(patientName(0),/&lt;Игрок&gt;/);assert.match(patientName(8),/>I</);
   for(const r of ctx.robots)assert.ok(Number.isFinite(r.x)&&Number.isFinite(r.y));close(dom);
 }
});
test('manual patient stays still with no input and responds to keyboard with automatic attacks enabled',()=>{
 const s=betNewSession(['Первый'],100);const dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 const r=ctx.robots[0];ctx.robots[1].setVisible(false);const start={x:r.x,y:r.y};
 assert.equal(controlledIntent(r).speed,0);for(let i=0;i<90;i++)step(1/60);assert.ok(Math.hypot(r.x-start.x,r.y-start.y)<.01);
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{code:'KeyD',bubbles:true}));assert.equal(ctx.towerInput.x,1);assert.ok(controlledIntent(r).speed>0);
 document.dispatchEvent(new dom.window.KeyboardEvent('keyup',{code:'KeyD',bubbles:true}));assert.equal(controlledIntent(r).speed,0);
 note('robot-immobilized',{robot:1,lastAttacker:0});note('robot-immobilized',{robot:1,lastAttacker:0});assert.equal(s.players[0].balance,110);
 openMenu();assert.equal(document.querySelector('#launch-overlay').hidden,false);
 assert.equal(document.querySelector('#menu-bank [data-player-balance]').dataset.balanceTarget,'110');
 close(dom);
});
test('player elimination ends attempt immediately even while several AI remain and banks are preserved',()=>{
 const s=betNewSession(['Первый'],100);const t=towerFor(s,0);for(let i=0;i<3;i++)completeTower(s,0,true);
 const dom=setup(s,t);document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 ctx.robots[0].failFromOilLoss=()=>{};
 // Removal of the head exercises real anatomy and permanent-garage isolation.
 ctx.robots[0].damage('head',1,100);step(1/60);
 const ended=ctx.game.events.findLast(event=>event.type==='combat-end');
 assert.equal(ended.outcome,'defeat');assert.equal(ended.loser,0);assert.equal(quipCategory(ended),'defeat');
 assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,null);assert.equal(towerFor(s,0).level,1);assert.equal(s.garage[0].wins,0);
 showResults();assert.equal(ctx.resultsPanel.hidden,false);assert.match(ctx.resultsTitle.textContent,/ПРОЙДЕНО ЭТАЖЕЙ/);close(dom);
});
test('real final strikes pay once and victory unlocks next floor with one skill point and full recovery',()=>{
 const s=betNewSession(['Первый'],100);let dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 const original=structuredClone(s.garage);ctx.robots[0].damage('arm--1-upper',1,100);ctx.robots[1].damage('head',0,100);
 assert.equal(s.players[0].balance,110);assert.equal(s.towerEarned,10);step(1/60);
 assert.equal(ctx.game.events.findLast(event=>event.type==='combat-end').outcome,'victory');
 assert.equal(ctx.combat.winner,0);assert.equal(towerFor(s,0).level,2);assert.equal(towerFor(s,0).wins,1);assert.deepEqual(s.garage,original);
 const next=structuredClone(towerFor(s,0));bettingSave();assert.deepEqual(bettingLoad().towers,s.towers);close(dom);
 dom=setup(s,next);assert.equal(ctx.robots.length,3);assert.equal(ctx.robots[0].segmentCount,ctx.robots[0].segmentTotal);assert.equal(ctx.towerGarage[0].stats.reduce((a,b)=>a+b,0),10);
 for(const r of ctx.robots)for(const [key,hp] of r.hp)assert.equal(hp,r.maxHp(key));close(dom);
});
test('switching menu player updates floor and balance without changing the active run owner',()=>{
 const s=betNewSession(['Первый','Второй'],100);completeTower(s,1,true);const dom=setup(s,towerFor(s,0));openMenu();
 const select=document.querySelector('#menu-player');select.value='1';select.dispatchEvent(new Event('change'));
 assert.match(document.querySelector('#launch-tower').textContent,/ЭТАЖ 2/);
 const bank=document.querySelector('#menu-bank');
 assert.equal(bank.parentElement,select.parentElement,'player and coins share one row');
 assert.equal(bank.closest('.tower-menu-player')!==null,true);
 assert.equal(bank.querySelector('[data-player-balance]').dataset.balanceTarget,String(s.players[1].balance));
 assert.doesNotMatch(bank.textContent,/БАНК/);
 assert.equal(document.querySelector('#launch-setup').classList.contains('is-new-game'),true);
 assert.match(document.querySelector('#menu-tower-progress').textContent,/ПРОЙДЕНО ЭТАЖЕЙ/);
 assert.equal(ctx.menuPlayer,1);assert.equal(ctx.towerPlayer,0);assert.equal(s.towerPlayerId,1);close(dom);
});
function manualFixture(arenaId='ring'){
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0),arenaId);
 document.querySelector('#tower-fight').click();advanceStartup(10);ctx.paused=false;
 ctx.robots=[];const r=createRobot(0,{x:arenaId==='annulus'?170:350,y:350,angle:0}),foe=createRobot(1,{x:450,y:450,angle:0});ctx.robots=[r,foe];r.setVisible(true);foe.setVisible(false);
 return {s,dom,r};
}
test('tower skill selection is a nonpaying preview until explicit 50-coin confirmation',()=>{
 const session=betNewSession(['Игрок'],200),run=towerFor(session,0);
 const dom=setup(session,run);
 try{
  let speed=document.querySelector('[data-tower-stat="0"]');speed.value='4';speed.dispatchEvent(new Event('change'));
  assert.deepEqual(run.stats,[3,3,3]);assert.deepEqual(ctx.towerGarage[0].stats,[3,3,3]);
  assert.deepEqual([...document.querySelectorAll('[data-tower-stat]')].map(n=>Number(n.value)),[4,2,3]);
  assert.match(document.querySelector('#tower-stats .garage-stat-effects').textContent,/ПРЕДПРОСМОТР/);
  assert.match(document.querySelector('[data-tower-apply]').textContent,/ПРИМЕНИТЬ/);
  assert.match(document.querySelector('[data-tower-apply]').textContent,/50/);
  assert.equal(session.players[0].balance,200);
  document.querySelector('[data-tower-base]').click();
  assert.equal(document.querySelector('[data-tower-apply]').disabled,true);
  assert.equal(session.towerEconomySpent,0);
  speed=document.querySelector('[data-tower-stat="0"]');speed.value='4';speed.dispatchEvent(new Event('change'));
  document.querySelector('[data-tower-apply]').click();
  assert.deepEqual(run.stats,[4,2,3]);assert.deepEqual(ctx.towerGarage[0].stats,[4,2,3]);
  assert.equal(session.players[0].balance,150);assert.equal(session.towerEconomySpent,50);
  assert.equal(document.querySelector('[data-tower-apply]').disabled,true);
  assert.deepEqual(bettingLoad().towers[0].stats,[4,2,3]);
  assert.match(document.querySelector('#tower-stats .tower-stat-message').textContent,/подтверждено/);
  const strength=document.querySelector('[data-tower-stat="1"]');strength.value='4';strength.dispatchEvent(new Event('change'));
  assert.deepEqual(run.stats,[4,2,3],'next change is still only a preview');
  document.querySelector('#tower-fight').click();
  assert.deepEqual(ctx.towerRun.stats,[4,2,3],'unpaid preview is discarded at fight entry');
 }finally{close(dom);}
});

test('arena dice shows the price below the icon and rerolls the same challenge without changing profiles',()=>{
 const session=betNewSession(['Кубик'],200),run=towerFor(session,0);
 run.floorPlan={floor:1,selected:1,options:[
  {arenaId:'ward',kind:'standard',profiles:['basic']},
  {arenaId:'ward',kind:'danger',style:'mixed',profiles:['fast','strong']}
 ]};
 const dom=setup(session,run);
 const previous=ctx.startTower;let triggered=0;
 try{
  ctx.startTower=()=>{triggered++;};
  const dice=document.querySelector('.tower-arena-overview .tower-arena-dice');
  assert.ok(dice);assert.equal(dice.previousElementSibling.className,'tower-arena-map');
  assert.equal(dice.querySelector('.tower-reroll-price').textContent.includes('50'),true);
  const button=dice.querySelector('.tower-reroll-button');assert.equal(button.disabled,false);
  button.click();button.click();
  assert.equal(triggered,1);
  assert.equal(session.players[0].balance,150);
  assert.equal(session.towerEconomySpent,50);
  assert.equal(run.arenaRerolls,1);
  assert.notEqual(run.floorPlan.options[0].arenaId,'ward');
  assert.equal(run.floorPlan.options[0].arenaId,run.floorPlan.options[1].arenaId);
  assert.deepEqual(run.floorPlan.options.map(o=>o.profiles),[['basic'],['fast','strong']]);
  assert.equal(run.floorPlan.selected,1);
  assert.equal(bettingLoad().towerEconomySpent,50);
 }finally{ctx.startTower=previous;close(dom);}
});
test('standing manual patient never rotates toward another patient',()=>{
 const {dom,r}=manualFixture();const foe=ctx.robots[1];foe.setVisible(true);
 const angle=r.angle,x=r.x,y=r.y;
 for(let i=0;i<60;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.equal(r.angle,angle);assert.ok(Math.hypot(r.x-x,r.y-y)<.01);assert.equal(controlledIntent(r).lookPoint,null);close(dom);
});
test('every ordinary manual strike allows movement and turning without cancelling the attack',()=>{
 for(const source of ['leg-1-lower','leg--1-lower','arm-1-lower','arm--1-lower','head']){
  const {dom,r}=manualFixture(),x=r.x,y=r.y,angle=r.angle;
  const strike={source,victim:1,aim:{x:x+20,y:y+20},started:ctx.game.time,impactAt:ctx.game.time+.52,endsAt:ctx.game.time+.78,resolved:false};ctx.combat.pending[0]=strike;
  ctx.towerInput={x:0,y:1};
  for(const [frames,phase] of [[12,'windup'],[12,'thrust'],[16,'recover']]){
   const before={x:r.x,y:r.y};tickManual(r,frames);
   const pose=r.attackPose(strike);assert.equal(pose.progress.phase,phase);assert.ok(Number.isFinite(pose.tip.x)&&Number.isFinite(pose.tip.y));
   assert.ok(Math.hypot(r.x-before.x,r.y-before.y)>.1,`${source} permits movement during ${phase}`);
  }
  assert.equal(ctx.combat.pending[0],strike);assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-x,r.y-y)>1);
  ctx.combat.pending[0]=null;tickManual(r,20);assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-x,r.y-y)>1);close(dom);
 }
});
test('tower arena clicks never pause; the pause button and other modes retain their controls',()=>{
 const {dom,s}=manualFixture(),canvas=document.querySelector('#copied-arena');
 for(const paused of [false,true]){
  ctx.paused=paused;ctx.svg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));canvas.click();assert.equal(ctx.paused,paused);
 }
 ctx.paused=false;ctx.button.click();assert.equal(ctx.paused,true);ctx.button.click();assert.equal(ctx.paused,false);
 initializeGame({session:s,entry:'betting'});installTowerUI();ctx.startup.phase='running';ctx.paused=false;
 const spectatorClick=ctx.svg.onclick;ctx.svg.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));assert.equal(ctx.paused,true);
 ctx.mode='tower';spectatorClick();assert.equal(ctx.paused,true,'a copied stale handler cannot pause or resume a tower fight');
 close(dom);
});
test('held input preserves jump preparation, flight and recovery before movement resumes',()=>{
 let fixture=manualFixture();let {dom,r}=fixture;
 assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);ctx.towerInput={x:0,y:1};r.tick(1/60,controlledIntent(r));assert.ok(r.actualPose.leap);assert.equal(r.actualPose.leap.launched,true);close(dom);
 fixture=manualFixture();({dom,r}=fixture);assert.equal(r.pounce({x:425,y:350},{victimId:1}),true);
 const leap=r.actualPose.leap;Object.assign(leap,{launched:true,started:ctx.game.time-.5,takeoffAt:ctx.game.time-.1,direction:{x:1,y:0},lastHead:{...r.eye}});
 ctx.towerInput={x:0,y:1};const angle=r.angle;r.tick(1/60,controlledIntent(r));assert.equal(r.actualPose.leap,leap);assert.equal(r.angle,angle);
 // End the forward flight and backward landing, then wait for recovery.
 for(let i=0;i<120&&r.actualPose.leap;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.equal(r.actualPose.leap,null);const landing={x:r.x,y:r.y};
 for(let i=0;i<60;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}
 assert.ok(r.angle>angle+.2);assert.ok(Math.hypot(r.x-landing.x,r.y-landing.y)>1);close(dom);
});
test('uncommanded pounce preparation cannot turn a standing player automatically',()=>{
 const {dom,r}=manualFixture();assert.equal(r.pounce({x:350,y:425},{victimId:1}),true);const angle=r.angle;
 r.tick(1/60,controlledIntent(r));assert.equal(r.angle,angle);assert.equal(r.actualPose.leap,null);close(dom);
});
test('automatic strikes can start while the player holds movement',()=>{
 const {dom,r}=manualFixture();ctx.robots=[r];const foe=createRobot(1,{x:350,y:380,angle:0});ctx.robots.push(foe);foe.setVisible(true);ctx.combat.nextStrike[1]=Infinity;
 ctx.towerInput={x:0,y:1};combatAttacks();assert.ok(ctx.combat.pending[0],'attack takes priority even with held input');close(dom);
});
function pressTowerKey(dom,type,code){document.dispatchEvent(new dom.window.KeyboardEvent(type,{code,bubbles:true}));}
function tickManual(r,frames=20){for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,controlledIntent(r));}}
test('WASD and arrow keys command the same screen directions and stop on release',()=>{
 for(const [code,x,y] of [['KeyW',0,-1],['ArrowUp',0,-1],['KeyS',0,1],['ArrowDown',0,1],['KeyA',-1,0],['ArrowLeft',-1,0],['KeyD',1,0],['ArrowRight',1,0]]){
  const {dom,r}=manualFixture();pressTowerKey(dom,'keydown',code);
  assert.deepEqual(ctx.towerInput,{x,y});const intent=controlledIntent(r);
  assert.ok(intent.speed>0);assert.equal(Math.sign(intent.goal.x-r.x),x);assert.equal(Math.sign(intent.goal.y-r.y),y);
  pressTowerKey(dom,'keyup',code);assert.equal(controlledIntent(r).speed,0);close(dom);
 }
});
test('diagonal keyboard speed is capped at the cardinal speed',()=>{
 const {dom,r}=manualFixture();pressTowerKey(dom,'keydown','KeyD');const speed=controlledIntent(r).speed;
 pressTowerKey(dom,'keydown','KeyW');const intent=controlledIntent(r);assert.equal(intent.speed,speed);assert.ok(intent.goal.x>r.x&&intent.goal.y<r.y);close(dom);
});
test('tower detailed statistics show totals and every patient after victory and defeat',()=>{
 for(const won of [true,false]){
  const s=betNewSession(['Статистик'],100),dom=setup(s,towerFor(s,0),'ring');
  document.querySelector('#tower-fight').click();advanceStartup(10);
  ctx.combat.strikes=7;ctx.combat.hits=4;ctx.combat.fighterHits=[3,1];ctx.combat.fighterTaken=[1,3];
  ctx.robots[won?1:0].damage('head',won?0:1,100);
  ctx.combat.finished=true;ctx.combat.winner=won?0:null;showResults();
  const details=document.querySelector('.gladiator-results-details');details.open=true;
  assert.equal(ctx.resultsTotals.children.length,3);assert.deepEqual([...ctx.resultsTotals.querySelectorAll('strong')].map(n=>n.textContent),['7','4','1']);
  assert.equal(ctx.resultsRows.children.length,2);const rows=[...ctx.resultsRows.querySelectorAll('tr')].map(row=>[...row.cells].map(cell=>cell.textContent));
  assert.deepEqual(rows[0].slice(0,4),['Статистик',won?'13/13':'12/13','3','1']);assert.equal(rows[0][4],won?'ПОБЕДИЛ':'ПОГИБ');assert.equal(rows[1][0],'B');
  assert.equal(rows[1][4],won?'ПОГИБ':'ПОДВИЖЕН');close(dom);
 }
});
test('keyboard changes direction in screen coordinates regardless of current heading',()=>{
 const {dom,r}=manualFixture();pressTowerKey(dom,'keydown','KeyS');tickManual(r,40);pressTowerKey(dom,'keyup','KeyS');
 assert.ok(r.angle>.2);pressTowerKey(dom,'keydown','KeyD');const intent=controlledIntent(r);
 assert.equal(intent.goal.y,r.y);assert.ok(intent.goal.x>r.x);assert.equal(intent.manualDrive,undefined);close(dom);
});
test('tower has one toolbar menu button and restores cancel-fight control in totalizator',()=>{
 const {dom,s}=manualFixture();assert.equal(document.querySelector('#tag7hop-reset').hidden,true);assert.equal(document.querySelector('#game-menu'),null);
 initializeGame({session:s,entry:'betting'});installTowerUI();assert.equal(document.querySelector('#tag7hop-reset').hidden,false);assert.equal(document.querySelector('#tag7hop-reset').textContent,'Отменить бой');close(dom);
});
test('new tower patient is random, retained across levels and continued saves, rerolled on reset or defeat',()=>{
 const originalRandom=Math.random;
 try{
  for(const [value,patient] of [[0,0],[.25,1],[.5,2],[.999,3]]){Math.random=()=>value;assert.equal(newTower().patient,patient);}
  const s=betNewSession(['Первый'],100);Math.random=()=>.1;assert.equal(towerFor(s,0).patient,0);
  Math.random=()=>.99;assert.equal(towerFor(s,0).patient,0);completeTower(s,0,true);assert.equal(towerFor(s,0).patient,0);
  assert.equal(resetTower(s,0).patient,3);Math.random=()=>.26;assert.equal(completeTower(s,0,false).patient,1);
  const dom=setup(s,towerFor(s,0));assert.equal(document.querySelector('#tower-patient'),null);bettingSave();assert.equal(bettingLoad().towers[0].patient,1);close(dom);
 }finally{Math.random=originalRandom;}
});
test('touch joystick supplies directional input and stops after finger release',()=>{
 const {dom,r}=manualFixture(),stick=document.querySelector('#tower-stick');stick.getBoundingClientRect=()=>({left:0,top:0,width:112,height:112});stick.setPointerCapture=()=>{};
 const pointer=(type,x,y)=>{const event=new dom.window.Event(type,{bubbles:true});Object.assign(event,{pointerId:7,clientX:x,clientY:y,button:0});stick.dispatchEvent(event);};
 pointer('pointerdown',95,56);assert.ok(ctx.towerInput.x>.9);assert.equal(ctx.towerInput.y,0);assert.ok(controlledIntent(r).goal.x>r.x);
 pointer('pointermove',56,17);assert.ok(ctx.towerInput.y<-.9);assert.equal(ctx.towerInput.x,0);
 pointer('pointerup',56,17);assert.equal(controlledIntent(r).speed,0);close(dom);
});
test('floors use 1,2,2,3,3 enemies and personal records survive defeat and reset',()=>{
 assert.deepEqual([1,2,3,4,5,6,7,8].map(floorEnemyCount),[1,2,2,3,3,4,4,5]);
 const s=betNewSession(['Первый','Второй'],100);for(let i=0;i<7;i++)completeTower(s,0,true);
 assert.equal(towerFor(s,0).record,7);completeTower(s,0,false);assert.equal(towerFor(s,0).record,7);assert.equal(towerFor(s,0).level,1);
 resetTower(s,0);assert.equal(towerFor(s,0).record,7);assert.equal(towerFor(s,1).record,0);
});
test('legacy runs keep the current fight, skill points and paid enemies, then adopt the new floor curve',()=>{
 const old={level:4,patient:2,stats:[4,4,4],wins:3,rewarded:[1,4],preparing:false};
 const s=betNewSession(['Первый'],100);s.towers[0]=old;normalizeTower(old);assert.ok(validTower(old));assert.equal(towerEnemyCount(old),4);assert.equal(old.record,3);assert.equal(old.runCoins,null);
 assert.equal(rewardTower(s,0,4,0),false);assert.equal(rewardTower(s,0,2,0),true);completeTower(s,0,true);
 assert.equal(towerFor(s,0).record,4);assert.equal(towerEnemyCount(towerFor(s,0)),3);assert.equal(towerFor(s,0).legacyEnemyCount,undefined);
 const dom=setup(s,towerFor(s,0));bettingSave();assert.equal(bettingLoad().towers[0].record,4);close(dom);
});
test('floor result distinguishes a cleared floor from a reached floor and marks a new personal record',()=>{
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);
 ctx.robots[1].damage('head',0,100);ctx.combat.finished=true;ctx.combat.winner=0;settleTower(0);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ЭТАЖ 1 ПРОЙДЕН');assert.match(document.querySelector('#bet-result-summary').textContent,/НОВЫЙ ЛИЧНЫЙ РЕКОРД/);assert.equal(ctx.resultsAgain.textContent,'НА ЭТАЖ 2');
 assert.match(document.querySelector('#bet-result-summary').textContent,/10/);assert.equal(towerFor(s,0).record,1);assert.equal(towerFor(s,0).runCoins,10);
 openMenu();assert.match(document.querySelector('#menu-tower-progress').textContent,/ПРОЙДЕНО ЭТАЖЕЙ: 1 · РЕКОРД: 1/);close(dom);
 const lossDom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.robots[0].damage('head',1,100);ctx.combat.finished=true;ctx.combat.winner=null;settleTower(null);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ПРОЙДЕНО ЭТАЖЕЙ: 1');assert.match(ctx.resultsSummary.textContent,/на этаже 2/);
 const floorCoins=document.querySelector('.tower-result-numbers').children[2];
 assert.equal(floorCoins.querySelector('strong').textContent.trim(),'0');assert.equal(floorCoins.querySelector('span').textContent,'МОНЕТ ЗА ЭТАЖ');assert.equal(towerFor(s,0).level,1);assert.equal(towerFor(s,0).record,1);assert.equal(s.players[0].balance,110);close(lossDom);
});
test('a five-floor milestone is celebrated without awarding extra money',()=>{
 const s=betNewSession(['Первый'],100);for(let i=0;i<4;i++)completeTower(s,0,true);
 const dom=setup(s,towerFor(s,0));document.querySelector('#tower-fight').click();advanceStartup(10);ctx.combat.finished=true;ctx.combat.winner=0;settleTower(0);showResults();
 assert.equal(ctx.resultsTitle.textContent,'ЭТАЖ 5 ПРОЙДЕН');assert.match(document.querySelector('.tower-milestone').textContent,/5 ЭТАЖЕЙ/);assert.equal(s.players[0].balance,100);assert.equal(towerFor(s,0).wins,5);close(dom);
});
test('moving attack selection prefers a reachable hand; stable selection retains target and strike priorities',()=>{
 const hand={source:{kind:'arm'},segment:'head',score:50},kick={source:{kind:'leg'},segment:'leg-1-upper',score:0};
 assert.ok(compareStrikeCandidates(hand,kick,{moving:true})<0);assert.ok(compareStrikeCandidates(hand,kick)>0);
});
test('manual and autonomous patients can leave a perimeter contact and slide without losing a limb',()=>{
 for(const manual of [true,false]){
  const {dom,r}=manualFixture();const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,{manual,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:620,y:350},240);const contact={x:r.x,y:r.y};tick({x:450,y:440},120);tick({x:350,y:350},100);
  assert.equal(r.segmentCount,r.segmentTotal);assert.ok(Math.hypot(r.x-contact.x,r.y-contact.y)>15,'patient frees itself without dismemberment');
  for(const c of r.capsules)for(const hit of staticContacts(c))assert.ok(hit.depth<=(isLimb(c)?5:0)+.01,`${c.segment}: penetration ${hit.depth}`);
  close(dom);
 }
});
test('manual and autonomous patients can leave the annulus obstacle without losing a limb',()=>{
 for(const manual of [true,false]){
  const {dom,r}=manualFixture('annulus');const tick=(goal,frames)=>{for(let i=0;i<frames;i++){ctx.game.time+=1/60;r.tick(1/60,{manual,goal,speed:45,mode:'chase',lookPoint:null});}};
  tick({x:350,y:350},240);const contact={x:r.x,y:r.y};tick({x:190,y:450},120);tick({x:150,y:350},100);
  assert.equal(r.segmentCount,r.segmentTotal);assert.ok(Math.hypot(r.x-contact.x,r.y-contact.y)>15,'patient leaves the central obstacle');
  for(const c of r.capsules)for(const hit of staticContacts(c))assert.ok(hit.depth<=(isLimb(c)?5:0)+.01,`${c.segment}: penetration ${hit.depth}`);
  close(dom);
 }
});

test('tower carries restored android segments between floors and clears them for a new run',()=>{
 const s=betNewSession(['Player'],100),t=towerFor(s,0);
 const dom=setup(s,structuredClone(t));
 try{
  document.querySelector('#tower-fight').click();advanceStartup(20);
  assert.equal(ctx.robots[0].damage('leg-1-upper',1,3),true);
  settleTower(0);
  assert.deepEqual(s.towers[0].prosthetics,['leg-1-upper','leg-1-lower']);
  initializeGame({session:s,tower:structuredClone(s.towers[0])});
  for(const key of ['leg-1-upper','leg-1-lower']){
   assert.ok(ctx.robots[0].actor.querySelector(`[data-skin-segment="${key}"] image`).getAttribute('href').endsWith('ar_01.png'));
  }
  assert.deepEqual(ctx.betting.garage[0].prosthetics,[],'arena patient is independent of the tower body');
  assert.deepEqual(completeTower(s,0,false).prosthetics,[]);
 }finally{ctx.root.__disposeTag();dom.window.close();}
});


test('tower enemy letters persist generations across floors, saves and resets without renaming corpses',()=>{
 const s=betNewSession(['Первый'],100),dom=setup(s,towerFor(s,0));
 const enemy=ctx.robots[1];enemy.setVisible(true);
 assert.match(patientName(1),/>B</);
 assert.equal(enemy.damage('head',0,100),true);
 assert.equal(s.towerEnemyGenerations[1],1);
 assert.match(patientName(1),/>B</,'the dead body keeps its old identity');
 bettingSave();const loaded=bettingLoad();assert.equal(loaded.towerEnemyGenerations[1],1);
 resetTower(loaded,0);assert.equal(loaded.towerEnemyGenerations[1],1);
 close(dom);
 const next=setup(loaded,towerFor(loaded,0));
 assert.match(patientName(1),/>B-1</);
 assert.match(patientName(0),/Первый/);
 close(next);
});
