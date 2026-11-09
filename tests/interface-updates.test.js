import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';
import {betCommit,betResolve,betTopUp} from '../src/betting/ledger.js';
import {bettingResults} from '../src/betting/ui.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://interface.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame();document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));document.querySelector('#garage-next').click();
 return dom;
}
function close(dom){ctx.root.__disposeTag();dom.window.close();}
test('patient card shows the three permanent skills and a bone count without mobility telemetry',()=>{
 const dom=setup();ctx.betting.garage[0].stats=[2,4,3];ctx.telemetryDirty=true;paintTelemetry();
 const card=ctx.cardNodes[0];assert.equal(card.strength.textContent,'4 · 30% crt');assert.equal(card.speed.textContent,'2 · 80%');assert.equal(card.maneuver.textContent,'3 · 100%');
 assert.equal(card.card.querySelector('.js-mobility'),null);assert.match(card.card.querySelector('.robot-card-score').textContent,/🦴.*13\/13/);assert.equal(card.card.querySelectorAll('.patient-skills>div').length,3);close(dom);
});
test('top-up preserves draft bets, persists the new chip supply and safely rejects invalid input',()=>{
 const dom=setup(),rows=[...document.querySelectorAll('[data-bet-player]')];
 rows[0].querySelector('input').value='20';rows[1].querySelector('input').value='30';rows[0].querySelector('select').value='2';
 dom.window.prompt=()=> '50';rows[0].querySelector('[data-top-up]').click();
 assert.equal(ctx.betting.players[0].balance,150);assert.equal(ctx.betting.topUps,50);assert.equal(rows[0].querySelector('input').value,'20');assert.equal(rows[1].querySelector('input').value,'30');assert.equal(rows[0].querySelector('select').value,'2');assert.equal(rows[0].querySelector('input').max,'150');assert.match(rows[0].querySelector('[data-balance]').textContent,/150/);
 assert.equal(bettingLoad().players[0].balance,150);
 for(const value of ['-10','2.5','',null]){dom.window.prompt=()=>value;rows[0].querySelector('[data-top-up]').click();assert.equal(ctx.betting.players[0].balance,150);}
 betCommit(ctx.betting,[{player:0,robot:0,amount:20},{player:1,robot:1,amount:30}]);assert.throws(()=>betTopUp(ctx.betting,0,10));bettingSave();const reloaded=bettingLoad();assert.equal(reloaded.players[0].balance,150);assert.equal(reloaded.players[1].balance,100);close(dom);
});
test('results colour income and losses, show profit and reconcile the actual balance',()=>{
 const dom=setup();betCommit(ctx.betting,[{player:0,robot:0,amount:10},{player:1,robot:1,amount:20}]);betResolve(ctx.betting,0);bettingResults();
 const root=document.querySelector('#bet-result-summary'),rows=root.querySelectorAll('tbody tr');assert.match(root.querySelector('thead').textContent,/Прибыль/);
 assert.equal(rows[0].children[2].textContent,'30 ');assert.ok(rows[0].children[2].querySelector('.chip-icon'));assert.equal(root.querySelectorAll('img').length,0);assert.ok(rows[0].children[2].classList.contains('bet-net-win'));assert.equal(rows[0].children[3].textContent,'+20 ');assert.equal(rows[0].children[4].textContent,'100  −10  +30  = 120 ');
 assert.equal(rows[1].children[3].textContent,'-20 ');assert.ok(rows[1].children[3].firstElementChild.classList.contains('bet-net-loss'));assert.equal(rows[1].children[4].textContent,'100  −20  = 80 ');close(dom);
});
test('shared hints replace native titles, support keyboard focus and clean up on dispose',()=>{
 const dom=setup(),button=document.querySelector('[data-top-up]'),hint=document.querySelector('.biovshi-hint');
 button.dispatchEvent(new Event('pointerover',{bubbles:true}));assert.equal(hint.hidden,false);assert.equal(hint.textContent,'Пополнить баланс');assert.equal(button.hasAttribute('title'),false);assert.equal(button.getAttribute('aria-describedby'),'biovshi-hint');
 document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(hint.hidden,true);assert.equal(button.hasAttribute('aria-describedby'),false);
 button.dispatchEvent(new Event('focusin',{bubbles:true}));assert.equal(hint.hidden,false);ctx.root.__disposeTag();assert.equal(document.querySelector('.biovshi-hint'),null);assert.equal(button.title,'Пополнить баланс');dom.window.close();
});
