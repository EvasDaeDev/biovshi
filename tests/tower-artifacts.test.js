import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingLoad,bettingSave} from '../src/betting/storage.js';
import {towerFor,completeTower,resetTower,newTower,validTower,rewardTower} from '../src/tower/model.js';
import {newArtifactCollection,drawArtifactPiece,validArtifactCollection,artifactDropChance,awardBossArtifact} from '../src/tower/artifacts.js';
import {artifactCollectionMarkup} from '../src/tower/artifact-ui.js';
import {ASSETS} from '../src/assets/manifest.js';
import {ctx} from '../src/game/state.js';
import {earnedStats} from '../src/garage/model.js';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {settleTower,towerResults,towerPreparation} from '../src/tower/ui.js';

function atFloor(session,player,floor){
 const t=towerFor(session,player);
 Object.assign(t,{level:floor,wins:floor-1,record:Math.max(t.record,floor-1),stats:earnedStats(floor-1),preparing:false,rewarded:[]});
 delete t.bossEncounter;return towerFor(session,player);
}
function filled(pieces){return {...newArtifactCollection(),pieces:[...pieces],bossWins:{5:pieces.length||1}};}

test('draw selects equally among missing fragments, never repeats and stops at all sixteen',()=>{
 const initial=filled([0,3,5,8,15]),remaining=Array.from({length:16},(_,n)=>n).filter(n=>!initial.pieces.includes(n));
 for(let slot=0;slot<remaining.length;slot++)assert.equal(drawArtifactPiece(structuredClone(initial),()=> (slot+.5)/remaining.length),remaining[slot]);
 const all=newArtifactCollection();for(let i=0;i<16;i++)drawArtifactPiece(all,()=>0);
 assert.deepEqual(all.pieces,Array.from({length:16},(_,n)=>n));assert.equal(drawArtifactPiece(all),null);
});

test('drop chance decreases by 30 percent of the current chance per boss win, without floor',()=>{
 const c=newArtifactCollection();
 for(let wins=0;wins<20;wins++){
  const expected=.7**wins;
  assert.equal(artifactDropChance(c,5),expected);
  assert.equal(artifactDropChance(c,10),1,'each boss floor has its own history');
  const before=c.pieces.length;
  assert.equal(awardBossArtifact(c,5,()=>.99999)!==null,wins===0);
  assert.equal(c.bossWins[5],wins+1);
  assert.equal(c.pieces.length,before+(wins===0?1:0));
 }
 assert.ok(artifactDropChance(c,5)<.01,'no artificial 20 percent floor');
 const boundary=newArtifactCollection();
 awardBossArtifact(boundary,5,()=>0);
 assert.equal(awardBossArtifact(boundary,5,()=>.7),null,'roll equal to 70 percent fails');
 assert.ok(Number.isInteger(awardBossArtifact(boundary,5,()=>.48999)),'49 percent chance on third victory');
});

test('only bosses drop fragments; losses and resets preserve counts, collections and chances per player',()=>{
 const s=betNewSession(['Первый','Второй'],100);
 completeTower(s,0,true,()=>0);assert.deepEqual(towerFor(s,0).artifacts,newArtifactCollection());
 const t=atFloor(s,0,5);completeTower(s,0,false,()=>0);assert.equal(towerFor(s,0).artifacts.bossWins[5],undefined);
 atFloor(s,0,5);completeTower(s,0,true,()=>0);assert.equal(t.artifacts.pieces.length,1);assert.equal(artifactDropChance(t.artifacts,5),.7);
 resetTower(s,0);assert.deepEqual(towerFor(s,0).artifacts,t.artifacts);
 atFloor(s,0,5);completeTower(s,0,true,()=>.99);assert.equal(t.artifacts.pieces.length,1);assert.equal(t.artifacts.bossWins[5],2);
 assert.equal(artifactDropChance(t.artifacts,10),1);assert.ok(validTower(towerFor(s,0)));
 assert.deepEqual(towerFor(s,1).artifacts,newArtifactCollection());
 const legacy=atFloor(s,1,5);delete legacy.bossEncounter;legacy.legacyBossFloor=true;completeTower(s,1,true,()=>0);
 assert.deepEqual(legacy.artifacts,newArtifactCollection(),'a legacy ordinary floor cannot masquerade as a boss');
});

test('losing the boss first, then winning it gives both guaranteed first-victory loot types',()=>{
 const session=betNewSession(['Игрок'],1000);
 let run=atFloor(session,0,5);
 // An old saved run can still contain a legacy whole-modification flag.
 run.segmentRewardsEnabled=false;
 // Boss can be paid for a kill before its fight ultimately ends in defeat.
 assert.equal(rewardTower(session,0,1,0),true);
 completeTower(session,0,false,()=>.99);
 run=towerFor(session,0);
 assert.equal(run.artifacts.bossWins[5],undefined,'defeat must not count as a boss victory');
 assert.deepEqual(run.artifacts.pieces,[],'defeat never consumes the fragment reward');
 assert.equal(run.segmentRewardsEnabled,true,'a new uninsured run upgrades legacy rewards');
 run=atFloor(session,0,5);
 assert.equal(rewardTower(session,0,1,0),true);
 completeTower(session,0,true,()=>.99);
 assert.equal(run.artifacts.bossWins[5],1,'only the victory increments the penalty counter');
 assert.equal(run.artifacts.pieces.length,1,'first victory guarantees one fragment');
 assert.equal(run.segmentInventory.length,2,'first victory guarantees segments even with high RNG');
 assert.equal(run.lastBossSegments.length,2);
 assert.ok(validTower(towerFor(session,0)));
});

test('segment and artifact replay chances share per-boss saved victory count',()=>{
 const session=betNewSession(['Первый','Второй'],500);
 let run=atFloor(session,0,5);
 run.segmentRewardsEnabled=true;
 completeTower(session,0,true,()=>.99);
 assert.equal(run.artifacts.bossWins[5],1);
 assert.equal(run.segmentInventory.length,2,'first boss drops segments even on a high roll');
 assert.equal(run.artifacts.pieces.length,1,'first artifact fragment guaranteed');
 resetTower(session,0);
 run=atFloor(session,0,5);
 run.segmentRewardsEnabled=true;
 completeTower(session,0,true,()=>.8);
 assert.equal(run.artifacts.bossWins[5],2);
 assert.equal(run.segmentInventory.length,0,'repeated boss can miss segments');
 assert.deepEqual(run.lastBossSegments,[]);
 assert.equal(run.artifacts.pieces.length,1,'repeated boss can miss artifact fragment');
 assert.ok(Math.abs(artifactDropChance(run.artifacts,5)-.49)<1e-12);
 assert.equal(artifactDropChance(run.artifacts,10),1,'another boss remains at first-drop chance');
 // The saved artifact history also applies to segments after resetting again.
 resetTower(session,0);
 run=atFloor(session,0,5);
 run.segmentRewardsEnabled=true;
 completeTower(session,0,true,()=>.48);
 assert.equal(run.artifacts.bossWins[5],3);
 assert.equal(run.segmentInventory.length,1,'below 49 percent earns a segment batch');
 assert.equal(run.artifacts.pieces.length,2,'below 49 percent also grants a fragment');
 resetTower(session,0);
 run=atFloor(session,0,5);
 run.segmentRewardsEnabled=true;
 completeTower(session,0,true,()=>.4);
 assert.equal(run.artifacts.bossWins[5],4);
 assert.equal(run.segmentInventory.length,1,'the fourth fight uses the 45 percent floor');
 assert.equal(run.artifacts.pieces.length,2,'the independent artifact roll still misses above 34.3 percent');
 assert.deepEqual(towerFor(session,1).artifacts,newArtifactCollection(),
  'another player does not inherit boss defeats');
});

test('each complete artifact pays exactly 3330 once, while every replay still pays 750 boss coins',()=>{
 const s=betNewSession(['Первый','Второй'],100);
 for(let victory=1;victory<=16;victory++){
  const t=atFloor(s,0,5);assert.equal(rewardTower(s,0,1,0),true);assert.equal(rewardTower(s,0,1,0),false);
  completeTower(s,0,true,()=>0);
  assert.equal(t.artifacts.pieces.length,victory);assert.equal(s.players[0].balance,100+750*victory+3330*Math.floor(victory/4));
  assert.equal(t.runCoins,750*victory+3330*Math.floor(victory/4));assert.ok(validTower(towerFor(s,0)));
 }
 const c=towerFor(s,0).artifacts;assert.deepEqual(c.rewardedArtifacts,[0,1,2,3]);assert.equal(artifactDropChance(c,5),0);
 resetTower(s,0);atFloor(s,0,5);rewardTower(s,0,1,0);completeTower(s,0,true,()=>0);
 assert.equal(s.players[0].balance,100+17*750+4*3330);assert.equal(c.pieces.length,16);assert.equal(c.bossWins[5],17);
 assert.equal(s.towerEarned,17*750+4*3330);assert.equal(s.players[1].balance,100);
});

test('a failed drop keeps the 750-coin boss reward and does not award a completion bonus',()=>{
 const s=betNewSession(['Игрок'],100),t=atFloor(s,0,5);t.artifacts=filled([0,1,2]);
 rewardTower(s,0,1,0);completeTower(s,0,true,()=>.99);
 assert.equal(s.players[0].balance,850);assert.equal(t.artifacts.pieces.length,3);assert.deepEqual(t.artifacts.rewardedArtifacts,[]);
});

test('bonus respects the shared currency ceiling without marking unpaid bonuses paid or corrupting saves',()=>{
 const s=betNewSession(['Игрок'],159996000),t=atFloor(s,0,5);t.artifacts=filled([0,1,2]);
 rewardTower(s,0,1,0);completeTower(s,0,true,()=>0);
 assert.equal(s.players[0].balance,159996750);assert.equal(s.towerEarned,750);assert.deepEqual(t.artifacts.rewardedArtifacts,[]);assert.ok(validTower(t));
});

test('v2 validation rejects duplicate pieces, malformed counters and claimed incomplete artifacts',()=>{
 assert.equal(validArtifactCollection(filled([0,0]),5),false);assert.equal(validArtifactCollection(filled([16]),5),false);
 assert.equal(validArtifactCollection(filled([.5]),5),false);assert.equal(validArtifactCollection(newArtifactCollection(),30),true);
 for(const bad of [{...filled([0]),bossWins:{4:1}},{...filled([0]),bossWins:{5:-1}},{...filled([0]),bossWins:{5:1.5}},{...filled([0]),bossWins:{}},{...filled([0]),rewardedArtifacts:[0]}])assert.equal(validArtifactCollection(bad,30),false);
});

test('old collections are cleared once without changing record or bank; new collection and bonuses survive load',()=>{
 const dom=new JSDOM('',{url:'https://artifact-save.test/'});globalThis.localStorage=dom.window.localStorage;
 ctx.BET_STORAGE='artifact-test';ctx.betStorageAvailable=true;
 try{
  const s=betNewSession(['Первый','Второй'],100);s.towers[0]=newTower(0,5);s.towers[1]=newTower(1,30);
  s.towers[0].artifacts={version:1,pieces:[0,1,2,3,4]};delete s.towers[1].artifacts;
  localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(s));const loaded=bettingLoad();assert.ok(loaded);
  for(const t of Object.values(loaded.towers))assert.deepEqual(t.artifacts,newArtifactCollection());
  assert.equal(loaded.towers[0].record,5);assert.equal(loaded.towers[1].record,30);assert.deepEqual(loaded.players,s.players);
  assert.deepEqual(bettingLoad().towers,loaded.towers,'one-time reset is persisted');
  for(let i=0;i<4;i++){atFloor(loaded,0,5);rewardTower(loaded,0,1,0);completeTower(loaded,0,true,()=>0);resetTower(loaded,0);}
  ctx.betting=loaded;bettingSave();const again=bettingLoad();assert.ok(again);assert.deepEqual(again.towers[0].artifacts,loaded.towers[0].artifacts);assert.equal(again.players[0].balance,6430);
  again.towers[0].artifacts.pieces[1]=again.towers[0].artifacts.pieces[0];localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(again));assert.equal(bettingLoad(),null,'corrupt v2 is rejected, not reset');
 }finally{dom.window.close();}
});

test('collection markup layers owned fragments, hides unfinished names and shows the actual 333 bonus',()=>{
 const collection=filled([0,1,2,3,6]),dom=new JSDOM(artifactCollectionMarkup(collection,3,333)),doc=dom.window.document;
 try{
  assert.equal(doc.querySelectorAll('.artifact').length,4);assert.equal(doc.querySelectorAll('.artifact-silhouette').length,4);assert.equal(doc.querySelectorAll('.artifact-piece').length,5);
  assert.equal(doc.querySelectorAll('.artifact-piece.is-new').length,1);assert.equal(doc.querySelector('.is-new').dataset.piece,'3');assert.equal(doc.querySelectorAll('.artifact.is-complete').length,1);
  assert.match(doc.querySelectorAll('.artifact')[1].textContent,/\?\?\?/);assert.doesNotMatch(doc.body.innerHTML,/Компьютер|Грааль|Водка и огурец/);
  assert.match(doc.querySelector('.artifact-completed').textContent,/Мишка.*333/);
  const complete=artifactCollectionMarkup(filled(Array.from({length:16},(_,i)=>i)));for(const name of ['Мишка','Компьютер','Грааль','Водка и огурец'])assert.ok(complete.includes(name));
  for(const image of doc.querySelectorAll('img'))assert.ok(fs.existsSync(new URL('../public/'+image.getAttribute('src').replace(/^\.\//,''),import.meta.url)));
  assert.equal(Object.keys(ASSETS.textures).filter(key=>key.startsWith('artifact')).length,20);
 }finally{dom.window.close();}
});

test('boss preparation shows saved chance; settlement and repeated result rendering never duplicate 3330 coins',()=>{
 const f=startBossScenario({floor:5});
 try{
  f.tower.artifacts=filled([0,1,2]);Math.random=()=>0;towerPreparation();
  assert.match(document.querySelector('[data-artifact-chance]').textContent,/34,3%/);
  assert.match(document.querySelector('.artifact-bonus-note').textContent,/3\s330/);
  document.querySelector('#tower-fight').click();f.boss.damage('head',0,100);ctx.combat.winner=0;settleTower(0);
  assert.equal(ctx.towerOutcome.artifact,3);assert.equal(ctx.towerOutcome.artifactBonus,3330);assert.equal(ctx.towerOutcome.runCoins,4080);
  const balance=f.session.players[0].balance;settleTower(0);towerResults();towerResults();assert.equal(f.session.players[0].balance,balance);
  assert.equal(ctx.towerOutcome.bossLoot.previousWins,3);
  assert.ok(Math.abs(ctx.towerOutcome.bossLoot.fragmentChance-.7**3)<1e-12);
  assert.match(document.querySelector('.tower-boss-loot-chances').textContent,/№4.*34,3%/);
  assert.match(document.querySelector('.artifact-completed').textContent,/3\s330/);assert.ok(bettingLoad());
  assert.equal(bettingLoad().players[0].balance,balance);
 }finally{f.close();}
});

test('boss results explain failed independent loot rolls instead of showing only money',()=>{
 const f=startBossScenario({floor:5});
 try{
  f.tower.artifacts={...newArtifactCollection(),bossWins:{5:1}};
  f.tower.segmentRewardsEnabled=true;
  Math.random=()=>.99;
  towerPreparation();
  document.querySelector('#tower-fight').click();
  f.boss.damage('head',0,100);
  ctx.combat.winner=0;
  settleTower(0);towerResults();
  assert.equal(ctx.towerOutcome.bossLoot.previousWins,1);
  assert.equal(ctx.towerOutcome.bossLoot.segmentChance,.7);
  assert.equal(ctx.towerOutcome.bossLoot.fragmentChance,.7);
  assert.equal(ctx.towerOutcome.bossLoot.segments,0);
  assert.equal(ctx.towerOutcome.bossLoot.fragment,false);
  assert.equal(f.tower.artifacts.bossWins[5],2);
  assert.match(document.querySelector('#gladiator-results-summary').textContent,/СЕГМЕНТЫ НЕ ВЫПАЛИ/);
  const explanation=document.querySelector('.tower-boss-loot-chances').textContent;
  assert.match(explanation,/ПОБЕДА НАД ЭТИМ БОССОМ: №2/);
  assert.match(explanation,/СЕГМЕНТЫ: НЕ ВЫПАЛИ · ШАНС: 70%/);
  assert.match(explanation,/ФРАГМЕНТ: НЕ ВЫПАЛ · ШАНС: 70%/);
 }finally{f.close();}
});

test('rare automatic boss rewards tint the segment and its cell on the existing victory screen',()=>{
 const f=startBossScenario({floor:5});
 try{
  f.tower.segmentRewardsEnabled=true;
  towerPreparation();document.querySelector('#tower-fight').click();
  f.boss.damage('head',0,100);
  ctx.combat.winner=0;
  // Artifact, fragment index, quantity, segment type, slot, rarity.
  const rolls=[0,0,0,0,0,.995];
  Math.random=()=>rolls.shift()??0;
  settleTower(0);towerResults();
  const reward=document.querySelector('#bet-result-summary .tower-segment-reward');
  assert.equal(reward.dataset.mutationRarity,'2');
  assert.match(reward.textContent,/СИНЯЯ/);
  assert.equal(reward.style.getPropertyValue('--tower-rarity-color'),'#4b94d2');
  assert.ok(reward.querySelector('image[filter]'),'matrix is applied to the texture');
  assert.equal(f.tower.mutationDraft,undefined,'no new selection for an automatic boss');
  assert.equal(bettingLoad().towers[0].segmentInventory[0].rarity,2);
 }finally{f.close();}
});
