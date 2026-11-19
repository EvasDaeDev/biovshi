import test from 'node:test';
import assert from 'node:assert/strict';
import {newTower,completeTower} from '../src/tower/model.js';
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
