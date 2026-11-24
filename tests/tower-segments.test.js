import test from 'node:test';
import assert from 'node:assert/strict';
import {newTower,completeTower} from '../src/tower/model.js';
import {purchaseInsurance} from '../src/tower/insurance.js';
import {towerSegmentDropChance,towerSegmentSellPrice,towerSegmentStacks,awardTowerSegments,
 equipTowerSegment,removeTowerSegment,sellTowerSegment,validTowerSegmentInventory,
 towerSegmentBonuses,towerUnreadSegments,markTowerSegmentSeen} from '../src/tower/segments.js';

test('segment prices are fixed installation and rarity-scaled sale',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>towerSegmentSellPrice(i)),[500,560,620,680,740,800]);
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
test('second segment drops at 35 percent after winning the segment batch',()=>{
 const below=newTower(),atBoundary=newTower();
 // A single deterministic random source supplies the quantity roll.
 assert.equal(awardTowerSegments(below,5,()=>.649999).length,1);
 assert.equal(awardTowerSegments(atBoundary,5,()=>.65).length,2);
 // The second-segment probability is independent of the repeat-boss drop roll.
 const repeat=newTower(),rolls=[.69,.65];
 assert.equal(awardTowerSegments(repeat,5,()=>rolls.shift()??.4,.7).length,2);
 assert.ok(validTowerSegmentInventory(repeat));
});

test('repeat boss segment batches drop at 70%, 49%, then at least 45%',()=>{
 const run=newTower();
 const first=awardTowerSegments(run,5,()=>.99,1);
 assert.equal(first.length,2,'first victory still guarantees a 1-2 segment batch');
 const next=run.nextSegmentId;
 const missed=awardTowerSegments(run,5,()=>.7,.7);
 assert.deepEqual(missed,[]);
 assert.deepEqual(run.lastBossSegments,[],'no stale reward indication after a miss');
 assert.equal(run.nextSegmentId,next,'miss does not consume inventory identifiers');
 assert.equal(run.segmentInventory.length,2);
 assert.equal(awardTowerSegments(run,5,()=>.5,.49).length,0,'49 percent does not include a 50 percent roll');
 assert.equal(awardTowerSegments(run,5,()=>0,.49).length,1,'successful roll grants a normal segment batch');
 assert.deepEqual([0,1,2,3,8,100].map(towerSegmentDropChance),[1,.7,.7**2,.45,.45,.45]);
 assert.equal(awardTowerSegments(run,5,()=>.45,towerSegmentDropChance(30),30).length,0);
 assert.equal(awardTowerSegments(run,5,()=>.449,towerSegmentDropChance(30),30).length,1);
 assert.equal(run.segmentInventory.length,4);
 assert.ok(validTowerSegmentInventory(run));
});

test('install, replace, remove and sell operate on individual inventory items',()=>{
 const run=newTower(),session={players:[{balance:10000}],capital:10000,mutationSpent:0};
 run.preparing=true;
 run.segmentInventory=[
  {id:'seg1',type:'servo',site:'arm-1-upper',rarity:0},
  {id:'seg2',type:'piston',site:'arm-1-upper',rarity:4},
  {id:'seg3',type:'piston',site:'arm-1-upper',rarity:4}
 ];run.nextSegmentId=4;
 assert.equal(equipTowerSegment(session,0,run,'seg1').price,750);
 assert.equal(towerSegmentBonuses(run).stats[2],.55);
 assert.equal(equipTowerSegment(session,0,run,'seg2').replaced.id,'seg1');
 assert.deepEqual(run.equippedSegments,['seg2']);
 assert.equal(towerSegmentStacks(run).find(x=>x.type==='piston').count,1);
 assert.equal(sellTowerSegment(session,0,run,'seg3'),740);
 assert.ok(removeTowerSegment(run,'seg2'));
 assert.equal(session.players[0].balance,9240);
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
 assert.equal(uninsured.towers[0].preparing,true,'surviving warehouse can be used before the next fight');
 const insured=make();
 const own=insured.towers[0];
 purchaseInsurance(insured,0,own);
 completeTower(insured,0,false);
 assert.deepEqual(insured.towers[0].equippedSegments,['seg1']);
 assert.deepEqual(insured.towers[0].segmentInventory.map(item=>item.id),['seg2','seg1']);
 assert.equal(insured.towers[0].insurance.checkpoint,null);
 assert.equal(insured.towers[0].preparing,true,'DMS restored equipment can be edited before combat');
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

test('unread segment notifications persist until its exact inventory stack is selected',()=>{
 const run=newTower();
 const drops=awardTowerSegments(run,5,()=>0);
 assert.equal(drops.length,1);
 const id=drops[0].id;
 const second={...drops[0],id:'seg'+run.nextSegmentId++};
 run.segmentInventory.push(second);run.unseenSegmentIds.push(second.id);
 assert.deepEqual([...towerUnreadSegments(run)],[id,second.id]);
 const same=structuredClone(run);
 assert.equal(towerUnreadSegments(same).size,2,'unread state persists through save snapshots');
 assert.equal(markTowerSegmentSeen(run,{type:'servo',site:'arm-1-upper',rarity:0}),false,
  'opening an unrelated inventory item does not clear the notification');
 assert.equal(towerUnreadSegments(run).size,2);
 assert.equal(markTowerSegmentSeen(run,{type:drops[0].type,site:drops[0].site,rarity:drops[0].rarity}),true);
 assert.equal(towerUnreadSegments(run).size,0,'all duplicates in one visible stack are marked read');
 assert.ok(validTowerSegmentInventory(run));
});
