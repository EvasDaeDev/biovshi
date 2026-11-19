import test from 'node:test';
import assert from 'node:assert/strict';
import {newTower,completeTower} from '../src/tower/model.js';
import {purchaseInsurance} from '../src/tower/insurance.js';
import {towerSegmentSellPrice,towerSegmentStacks,awardTowerSegments,
 equipTowerSegment,removeTowerSegment,sellTowerSegment,validTowerSegmentInventory,
 towerSegmentBonuses} from '../src/tower/segments.js';

test('segment prices are fixed installation and rarity-scaled sale',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>towerSegmentSellPrice(i)),[50,56,62,68,74,80]);
});
test('boss generates one or two independent segments and preserves duplicates',()=>{
 const run=newTower();
 const one=awardTowerSegments(run,5,()=>0);
 assert.equal(one.length,1);
 const two=awardTowerSegments(run,5,()=>.99);
 assert.equal(two.length,2);
 assert.equal(new Set(run.segmentInventory.map(x=>x.id)).size,3);
 assert.equal(towerSegmentStacks(run).reduce((n,x)=>n+x.count,0),3);
 assert.ok(validTowerSegmentInventory(run));
});
test('install, replace, remove and sell operate on individual inventory items',()=>{
 const run=newTower(),session={players:[{balance:1000}],mutationSpent:0};
 run.preparing=true;
 run.segmentInventory=[
  {id:'seg1',type:'servo',site:'arm-1-upper',rarity:0},
  {id:'seg2',type:'piston',site:'arm-1-upper',rarity:4},
  {id:'seg3',type:'piston',site:'arm-1-upper',rarity:4}
 ];run.nextSegmentId=4;
 assert.equal(equipTowerSegment(session,0,run,'seg1').price,75);
 assert.equal(towerSegmentBonuses(run).stats[2],.55);
 assert.equal(equipTowerSegment(session,0,run,'seg2').replaced.id,'seg1');
 assert.deepEqual(run.equippedSegments,['seg2']);
 assert.equal(towerSegmentStacks(run).find(x=>x.type==='piston').count,1);
 assert.equal(sellTowerSegment(session,0,run,'seg3'),74);
 assert.ok(removeTowerSegment(run,'seg2'));
 assert.equal(session.players[0].balance,924);
 assert.ok(validTowerSegmentInventory(run));
});

test('uninsured defeat keeps only warehouse parts while DMS restores its insured loadout',()=>{
 const make=()=>{
  const t=newTower();
  t.segmentRewardsEnabled=true;t.preparing=false;
  t.segmentInventory=[
   {id:'seg1',type:'servo',site:'arm-1-upper',rarity:1},
   {id:'seg2',type:'piston',site:'arm-1-lower',rarity:2}
  ];
  t.equippedSegments=['seg1'];t.nextSegmentId=3;
  return {players:[{balance:500}],towers:{0:t}};
 };
 const uninsured=make();
 completeTower(uninsured,0,false);
 assert.deepEqual(uninsured.towers[0].segmentInventory.map(item=>item.id),['seg2']);
 assert.deepEqual(uninsured.towers[0].equippedSegments,[]);
 assert.equal(uninsured.towers[0].segmentRewardsEnabled,true);
 const insured=make();
 const own=insured.towers[0];
 purchaseInsurance(insured,0,own);
 completeTower(insured,0,false);
 assert.deepEqual(insured.towers[0].equippedSegments,['seg1']);
 assert.deepEqual(insured.towers[0].segmentInventory.map(item=>item.id),['seg2','seg1']);
 assert.equal(insured.towers[0].insurance.checkpoint,null);
});

test('segment reward run automatically awards inventory items without a selection draft',()=>{
 const session={players:[{balance:500}],towers:{0:newTower()}},run=session.towers[0];
 run.level=5;run.wins=4;run.record=4;run.stats=[...run.stats];
 run.segmentRewardsEnabled=true;
 // This test targets the reward flow only; the full Tower regression suite
 // covers encounter, boss selection, and skill-point validation.
 completeTower(session,0,true,()=>0);
 assert.equal(run.mutationDraft,undefined);
 assert.equal(run.segmentInventory.length,1);
 assert.equal(run.lastBossSegments.length,1);
 assert.equal(run.segmentInventory[0].rarity,0);
});
