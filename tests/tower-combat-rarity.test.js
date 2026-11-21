import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {newTower,completeTower} from '../src/tower/model.js';
import {awardTowerSegments} from '../src/tower/segments.js';
import {towerMutationSnapshot,towerAttackInterval,rollTowerBossRarity,towerBossRarityOdds,grantTowerMutationDraft} from '../src/tower/mutations.js';
import {renderTowerFloorChoices} from '../src/tower/floor-selector.js';

const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
function equipped(stats,types,ranks){
 const segments=types.map((type,index)=>({id:'seg'+index,type,rarity:ranks[index]}));
 return towerMutationSnapshot({stats,segmentInventory:segments,equippedSegments:segments.map(item=>item.id)});
}

test('Tower baseline grows past 9 and equipment has separate overflow and final caps',()=>{
 assert.deepEqual(towerMutationSnapshot({stats:[3,3,3]}).effects,[1,.15,1]);
 const late=towerMutationSnapshot({stats:[13,13,12]});
 late.effects.forEach((value,index)=>approx(value,[1.88,.62,1.86][index]));
 const stats=[14,14,14];
 const gear=equipped(stats,Array(12).fill('piston'),Array(12).fill(5));
 approx(gear.effects[1],.685); // 60% + 2.5 pp base + 2 pp from equipped points + 4 pp rarity
 approx(equipped(stats,Array(7).fill('focus'),Array(7).fill(5)).effects[1],.75);
 approx(equipped(stats,Array(10).fill('turbo'),Array(10).fill(5)).effects[0],2);
 const withProsthetic=towerMutationSnapshot({stats,prosthetics:['arm-1-upper']});
 approx(withProsthetic.effects[2],1.8944); // Maneuver penalty is kept when points exceed 9.
});

test('rarity uses the three highest rolls per effect and speeds recovery beyond the ordinary limit',()=>{
 const stats=[9,9,9],types=['metronome','metronome','metronome','metronome'];
 const normal=equipped(stats,types,[0,0,0,0]);
 const ranked=equipped(stats,types,[1,5,4,3]);
 approx(towerAttackInterval(normal.combat),.78);
 approx(ranked.combat.recoveryReduction,.0045*(5+.4*4+.2*3));
 approx(towerAttackInterval(ranked.combat),.7476);
 approx(towerAttackInterval(equipped(stats,types,[5,5,5,5]).combat),.744);
});

test('boss odds and awarded rarity agree at boundaries and on repeat kills',()=>{
 assert.deepEqual(towerBossRarityOdds(5).map(item=>[item.rarity,item.percent]),[[0,92],[1,7],[2,1]]);
 assert.deepEqual([0,.91999,.92,.98999,.99,.999].map(roll=>rollTowerBossRarity(5,0,()=>roll)),[0,0,1,1,2,2]);
 assert.deepEqual(towerBossRarityOdds(125).map(item=>item.percent),[93,7]);
 assert.equal(rollTowerBossRarity(125,0,()=>.92999),4);
 assert.equal(rollTowerBossRarity(125,0,()=>.93),5);
 assert.equal(rollTowerBossRarity(155,0,()=>.999),5);
 const rolls=[.65,0,0,.94,0,0,.995],run=newTower();
 assert.deepEqual(awardTowerSegments(run,5,()=>rolls.shift()).map(x=>x.rarity),[1,2]);
 assert.equal(awardTowerSegments(run,5,()=>0,.7)[0].rarity,0);
 const draft={...newTower(),level:6};
 assert.ok(grantTowerMutationDraft(draft,()=>.995));
 assert.equal(draft.mutationDraft.rarity,2);
 const repeat={...newTower(),level:5,segmentRewardsEnabled:true};
 repeat.artifacts.bossWins[5]=1;
 // Consume artifact and batch rolls, then pick the second item count.
 const replay=[.99,0,.65,.995,.995,.995,.995];
 completeTower({players:[{balance:1000}],towers:{0:repeat}},0,true,()=>replay.shift());
 assert.deepEqual(repeat.segmentInventory.map(item=>item.rarity),[0,0]);
});

test('boss preparation shows actual drop chances in one row and details in its hint',()=>{
 const dom=new JSDOM(readFileSync(new URL('../index.html',import.meta.url),'utf8'));
 const previous=globalThis.document;
 globalThis.document=dom.window.document;
 try{
  const run=newTower();run.level=5;run.segmentRewardsEnabled=true;
  run.floorPlan={floor:5,selected:0,options:[{arenaId:'ward',kind:'boss',profiles:['boss','basic','basic']}]};
  for(const link of document.querySelectorAll('link[rel="stylesheet"]')){
   const style=document.createElement('style');
   style.textContent=readFileSync(new URL('../'+link.getAttribute('href'),import.meta.url),'utf8');
   link.replaceWith(style);
  }
  const container=document.getElementById('tower-floor-preview');
  const view=renderTowerFloorChoices({container,session:{players:[{balance:1000}]},player:0,run});
  const summary=()=>container.querySelector('.tower-arena-map > .tower-boss-drop');
  const odds=()=>Array.from(summary().querySelectorAll('[data-rarity]'));
  assert.equal(summary().textContent,'ДРОП С БОССА: артефакт 100%, модификатор 92%, 7%, 1%');
  assert.equal(container.querySelectorAll('.tower-boss-drop').length,1);
  assert.ok(summary().hasAttribute('data-hint-tap'));
  assert.doesNotMatch(container.textContent,/35%/);
  assert.match(summary().dataset.hint,/Вторая выпадает с шансом 35%/);
  assert.deepEqual(odds().map(node=>node.textContent),['92%','7%','1%']);
  const colours=()=>odds().map(node=>dom.window.getComputedStyle(node).color);
  assert.deepEqual(colours(),['rgb(231, 218, 186)','rgb(96, 169, 91)','rgb(75, 148, 210)']);
  run.artifacts.bossWins[5]=2;view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: артефакт 49%, модификатор 49%');
  assert.deepEqual(odds().map(node=>node.dataset.rarity),['0']);
  run.artifacts.pieces=Array.from({length:16},(_,index)=>index);view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: модификатор 49%');
  run.artifacts.bossWins[5]=60;view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: модификатор 45%');
  assert.match(summary().dataset.hint,/Шанс получить набор деталей при повторной победе: 45%/);
  run.artifacts.pieces=[];view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: артефакт <0,01%, модификатор 45%');
  run.artifacts.bossWins[5]=3000;view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: модификатор 45%');
  delete run.segmentRewardsEnabled;view.render();
  assert.equal(summary().textContent,'ДРОП С БОССА: модификатор 100%','old saves still receive the guaranteed draft');
  assert.doesNotMatch(summary().dataset.hint,/35%/);
  for(const [floor,expected] of [[95,['rgb(155, 106, 205)','rgb(229, 164, 75)','rgb(216, 74, 62)']],
   [155,['rgb(216, 74, 62)']]]){
   run.level=floor;view.render();
   assert.deepEqual(colours(),expected);
  }
 }finally{globalThis.document=previous;dom.window.close();}
});
