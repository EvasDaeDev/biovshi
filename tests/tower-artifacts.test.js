import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
import {towerFor,completeTower,resetTower,newTower,validTower} from '../src/tower/model.js';
import {newArtifactCollection,drawArtifactPiece,validArtifactCollection} from '../src/tower/artifacts.js';
import {artifactCollectionMarkup} from '../src/tower/artifact-ui.js';
import {ASSETS} from '../src/assets/manifest.js';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {installTowerUI,settleTower,towerResults} from '../src/tower/ui.js';

test('random selection gives each remaining fragment one equally sized slot and never repeats',()=>{
 const initial={version:1,pieces:[0,3,5,8,15]},remaining=Array.from({length:16},(_,n)=>n).filter(n=>!initial.pieces.includes(n));
 for(let slot=0;slot<remaining.length;slot++){
  const collection=structuredClone(initial);
  assert.equal(drawArtifactPiece(collection,()=> (slot+.5)/remaining.length),remaining[slot]);
 }
 const all=newArtifactCollection(100,()=>0);
 assert.deepEqual(all.pieces,Array.from({length:16},(_,n)=>n));
 assert.equal(drawArtifactPiece(all),null);assert.equal(all.pieces.length,16);
});
test('each first-cleared floor grants one piece; defeat, reset and repeated floors preserve the collection',()=>{
 const s=betNewSession(['Первый','Второй'],100),initial=structuredClone(s.players);
 completeTower(s,0,true);const first=[...towerFor(s,0).artifacts.pieces];assert.equal(first.length,1);
 completeTower(s,0,false);assert.deepEqual(towerFor(s,0).artifacts.pieces,first);
 completeTower(s,0,true);assert.deepEqual(towerFor(s,0).artifacts.pieces,first);
 completeTower(s,0,true);assert.equal(towerFor(s,0).artifacts.pieces.length,2);
 resetTower(s,0);const saved=[...towerFor(s,0).artifacts.pieces];
 for(let floor=1;floor<=16;floor++){completeTower(s,0,true);assert.equal(towerFor(s,0).artifacts.pieces.length,Math.min(Math.max(2,floor),16));assert.ok(validTower(towerFor(s,0)));}
 assert.deepEqual(towerFor(s,0).artifacts.pieces.slice(0,2),saved);
 completeTower(s,0,true);assert.equal(new Set(towerFor(s,0).artifacts.pieces).size,16);
 assert.deepEqual(towerFor(s,1).artifacts.pieces,[]);completeTower(s,1,true);assert.equal(towerFor(s,1).artifacts.pieces.length,1);
 assert.deepEqual(s.players,initial,'collection does not issue or spend coins');
});
test('collection validation rejects duplicates, invalid IDs and mismatches with lifetime record',()=>{
 assert.equal(validArtifactCollection({version:1,pieces:[0,0]},2),false);
 assert.equal(validArtifactCollection({version:1,pieces:[16]},1),false);
 assert.equal(validArtifactCollection({version:1,pieces:[.5]},1),false);
 assert.equal(validArtifactCollection({version:1,pieces:[]},1),false);
 assert.equal(validArtifactCollection(newArtifactCollection(100),100),true);
});
test('legacy records receive retrospective rewards once, persist their exact pieces, and reject corrupted saves',()=>{
 const dom=new JSDOM('',{url:'https://artifact-save.test/'});globalThis.localStorage=dom.window.localStorage;
 ctx.BET_STORAGE='artifact-test';ctx.betStorageAvailable=true;
 const s=betNewSession(['Первый','Второй'],100);
 s.towers[0]=newTower(0,5);s.towers[1]=newTower(1,30);delete s.towers[0].artifacts;delete s.towers[1].artifacts;
 localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(s));
 const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.towers[0].artifacts.pieces.length,5);assert.equal(loaded.towers[1].artifacts.pieces.length,16);
 assert.deepEqual(bettingLoad().towers,loaded.towers,'migration is saved before a second load');
 resetTower(loaded,0);completeTower(loaded,0,true);ctx.betting=loaded;bettingSave();assert.deepEqual(bettingLoad().towers[0].artifacts,loaded.towers[0].artifacts);
 loaded.towers[0].artifacts.pieces[1]=loaded.towers[0].artifacts.pieces[0];localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(loaded));assert.equal(bettingLoad(),null);
 dom.window.close();
});
test('collection markup layers each owned fragment over its matching silhouette and highlights only the awarded piece',()=>{
 const collection={version:1,pieces:[0,1,2,3,6]};
 const dom=new JSDOM(artifactCollectionMarkup(collection,3)),doc=dom.window.document;
 assert.equal(doc.querySelectorAll('.artifact').length,4);assert.equal(doc.querySelectorAll('.artifact-silhouette').length,4);assert.equal(doc.querySelectorAll('.artifact-piece').length,5);
 assert.equal(doc.querySelectorAll('.artifact-piece.is-new').length,1);assert.equal(doc.querySelector('.is-new').dataset.piece,'3');assert.equal(doc.querySelectorAll('.artifact.is-complete').length,1);
 assert.match(doc.querySelectorAll('.artifact')[1].textContent,/\?\?\?/);assert.doesNotMatch(doc.body.innerHTML,/Компьютер|Грааль|Водка и огурец/);
 const incomplete=artifactCollectionMarkup({version:1,pieces:[4]},4);assert.doesNotMatch(incomplete,/Мишка|Компьютер|Грааль|Водка и огурец/);assert.match(incomplete,/НОВЫЙ ФРАГМЕНТ · 1\/4/);
 const complete=artifactCollectionMarkup(newArtifactCollection(16));for(const name of ['Мишка','Компьютер','Грааль','Водка и огурец'])assert.ok(complete.includes(name));
 assert.match(doc.querySelector('.artifact-completed').textContent,/Мишка/);
 assert.match(doc.querySelector('[data-piece="6"]').src,/artefacts\/2\/3.png$/);
 for(const image of doc.querySelectorAll('img'))assert.ok(fs.existsSync(new URL('../public/'+image.getAttribute('src').replace(/^\.\//,''),import.meta.url)));
 assert.equal(Object.keys(ASSETS.textures).filter(key=>key.startsWith('artifact')).length,20);
 dom.window.close();
});
test('settlement grants once, repeat result rendering does not reroll, and a replayed floor has no reward animation',()=>{
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://artifact-ui.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const s=betNewSession(['Игрок'],100);ctx.towerPlayer=0;initializeGame({session:s,entry:'tower',tower:structuredClone(towerFor(s,0)),arenaId:'ward'});installTowerUI();
 try{
  const preview=document.querySelector('#tower-artifact-view');assert.equal(preview.open,false);preview.open=true;assert.equal(preview.querySelectorAll('.artifact-silhouette').length,4);assert.equal(preview.querySelectorAll('.artifact-piece').length,0);
  ctx.combat.winner=0;settleTower(0);const awarded=ctx.towerOutcome.artifact;assert.ok(Number.isInteger(awarded));assert.equal(towerFor(s,0).record,1);
  settleTower(0);towerResults();towerResults();assert.equal(towerFor(s,0).artifacts.pieces.length,1);assert.equal(document.querySelector('.artifact-piece.is-new').dataset.piece,String(awarded));
  assert.equal(bettingLoad().towers[0].artifacts.pieces[0],awarded);
  resetTower(s,0);ctx.towerSettled=false;settleTower(0);towerResults();assert.equal(ctx.towerOutcome.artifact,null);assert.equal(document.querySelector('.artifact-piece.is-new'),null);assert.equal(document.querySelectorAll('.artifact-piece').length,1);
 }finally{ctx.root.__disposeTag();dom.window.close();ctx.mode='spectator';}
});
