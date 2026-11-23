import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingLoad} from '../src/betting/storage.js';
import {ctx} from '../src/game/state.js';
import {archiveNote,awardArchiveNote,newArchiveNotes,validArchiveNotes} from '../src/tower/archive-notes.js';
import {buyTowerInsurance,completeTower,resetTower} from '../src/tower/model.js';
import {settleTower,towerPreparation,towerResults} from '../src/tower/ui.js';
import {startBossScenario} from '../scripts/boss-harness.mjs';

test('archive rolls draw from all unseen notes and stop at 52',()=>{
 const ids=newArchiveNotes(()=>.5);
 assert.deepEqual(ids,[27]);
 awardArchiveNote(ids,()=>.35);
 assert.deepEqual(ids,[27]);
 const rolls=[.34999,.99999];
 awardArchiveNote(ids,()=>rolls.shift());
 assert.deepEqual(ids,[27,52]);
 for(let i=0;i<50;i++)awardArchiveNote(ids,()=>0);
 assert.equal(validArchiveNotes(ids),true);
 assert.deepEqual([...ids].sort((a,b)=>a-b),Array.from({length:52},(_,i)=>i+1));
 awardArchiveNote(ids,()=>assert.fail('a complete collection needs no roll'));
 assert.equal(validArchiveNotes([1,1]),false);
 assert.equal(validArchiveNotes([53]),false);
});

test('the final 13 missing notes have a 20 percent drop chance per player',()=>{
 const ids=Array.from({length:38},(_,index)=>index+15);
 const ordinaryRoll=[.34999,0];
 assert.equal(awardArchiveNote(ids,()=>ordinaryRoll.shift()),1);
 assert.equal(ids.length,39);
 assert.equal(awardArchiveNote(ids,()=>.20),undefined);
 assert.equal(ids.length,39);
 const finalRoll=[.19999,0];
 assert.equal(awardArchiveNote(ids,()=>finalRoll.shift()),2);
});

test('ordinary victories can award notes and each player keeps their own collection through DMS and reset',()=>{
 const session=betNewSession(['А','Б']);
 const [first,second]=session.players;
 assert.ok(validArchiveNotes(first.archiveNotes));
 assert.equal(first.archiveNotes.length,1);
 assert.equal(second.archiveNotes.length,1);
 buyTowerInsurance(session,0);
 completeTower(session,0,true,()=>0);
 const notes=[...first.archiveNotes];
 assert.equal(notes.length,2);
 completeTower(session,0,false,()=>assert.fail('a loss does not roll for a note'));
 assert.deepEqual(first.archiveNotes,notes);
 resetTower(session,0);
 assert.deepEqual(first.archiveNotes,notes);
 assert.equal(second.archiveNotes.length,1);
});

test('older saves receive a starter note once and keep any existing collection',()=>{
 const dom=new JSDOM('',{url:'https://archive-notes.test'});
 const originalStorage=globalThis.localStorage,originalKey=ctx.BET_STORAGE;
 try{
  globalThis.localStorage=dom.window.localStorage;
  ctx.BET_STORAGE='archive-note-migration';
  const session=betNewSession(['А','Б']);
  delete session.players[0].archiveNotes;
  delete session.players[0].unreadArchiveNoteIds;
  delete session.players[1].unreadArchiveNoteIds;
  session.players[1].archiveNotes=[4,52];
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(session));
  const loaded=bettingLoad();
  assert.ok(validArchiveNotes(loaded.players[0].archiveNotes));
  assert.equal(loaded.players[0].archiveNotes.length,1);
  assert.deepEqual(loaded.players[1].archiveNotes,[4,52]);
  assert.deepEqual(loaded.players[0].unreadArchiveNoteIds,loaded.players[0].archiveNotes);
  assert.deepEqual(loaded.players[1].unreadArchiveNoteIds,[]);
  assert.deepEqual(bettingLoad().players,loaded.players);
 }finally{
  globalThis.localStorage=originalStorage;
  ctx.BET_STORAGE=originalKey;
  dom.window.close();
 }
});

test('the Shelter and victory rewards open the same reader without repeating settlement',()=>{
 const f=startBossScenario({floor:5});
 try{
  const player=f.session.players[0];
  player.archiveNotes=[4];player.unreadArchiveNoteIds=[4];
  towerPreparation();
  const launch=document.querySelector('#tower-upgrade-open');
  assert.ok(launch.querySelector('.tower-new-dot'));
  launch.click();
  const shelter=document.querySelector('#tower-upgrade-window');
  const artifactsTab=shelter.querySelector('[data-upgrade-tab=artifacts]');
  assert.ok(artifactsTab.querySelector('.tower-new-dot'));
  artifactsTab.click();
  const starter=shelter.querySelector('.tower-notes [data-archive-note="4"]');
  assert.match(starter.querySelector('img').src,/note_pla\.png$/);
  assert.ok(starter.querySelector('.tower-new-dot'));
  assert.ok(launch.querySelector('.tower-new-dot'),'opening the tab leaves the note unread');
  starter.click();
  assert.equal(starter.querySelector('.tower-new-dot'),null);
  assert.equal(artifactsTab.querySelector('.tower-new-dot'),null);
  assert.equal(launch.querySelector('.tower-new-dot'),null);
  assert.deepEqual(bettingLoad().players[0].unreadArchiveNoteIds,[]);
  const reader=document.querySelector('#archive-note-reader');
  assert.equal(reader.open,true);
  assert.equal(reader.querySelector('#archive-note-number').textContent,'Записка № 04');
  assert.equal(reader.querySelector('#archive-note-sender').textContent,'Отправитель: Пациент');
  assert.equal(reader.querySelector('#archive-note-text').textContent,archiveNote(4).text);
  assert.match(archiveNote(4).text,/\n/);
  reader.getBoundingClientRect=()=>({left:100,right:500,top:100,bottom:500});
  const dispatch=(type,x)=>reader.dispatchEvent(new document.defaultView.MouseEvent(type,{bubbles:true,clientX:x,clientY:200}));
  dispatch('pointerdown',120);
  dispatch('click',120);
  assert.equal(reader.open,true,'a tap inside the panel leaves the note open');
  dispatch('pointerdown',120);
  dispatch('click',20);
  assert.equal(reader.open,true,'dragging from the panel does not close the note');
  dispatch('pointerdown',20);
  dispatch('click',20);
  assert.equal(reader.open,false);
  assert.equal(shelter.open,true);
  assert.equal(document.activeElement,starter);
  shelter.querySelector('.tower-upgrade-close').click();

  document.querySelector('#tower-fight').click();
  f.boss.damage('head',0,100);
  ctx.combat.winner=0;
  Math.random=()=>0;
  settleTower(0);
  settleTower(0);
  towerResults();
  towerResults();
  assert.deepEqual(player.archiveNotes,[4,1]);
  const reward=document.querySelector('#bet-result-summary .tower-note-card');
  assert.equal(reward.textContent.trim(),'№ 01');
  assert.ok(reward.querySelector('.tower-new-dot'));
  assert.deepEqual(bettingLoad().players[0].unreadArchiveNoteIds,[1]);
  reward.click();
  assert.equal(reward.querySelector('.tower-new-dot'),null);
  assert.deepEqual(bettingLoad().players[0].unreadArchiveNoteIds,[]);
  assert.equal(reader.open,true);
  assert.equal(reader.querySelector('#archive-note-title').textContent,archiveNote(1).title);
  assert.equal(document.querySelector('#gladiator-results').hidden,false);
  dispatch('pointerdown',20);
  dispatch('click',20);
  assert.equal(reader.open,false);
  assert.equal(document.querySelector('#gladiator-results').hidden,false);
  assert.equal(document.activeElement,reward);
  reward.click();
  reader.querySelector('[data-paper-dismiss]').click();
  assert.equal(reader.open,false,'the close button still works after reopening');
  assert.deepEqual(bettingLoad().players[0].archiveNotes,[4,1]);
 }finally{f.close();}
});
