import {canIssueCoins} from '../betting/coins.js';
import {awardArchiveNote,initializePlayerArchive} from './archive-notes.js';
import {newInsurance,validInsurance,purchaseInsurance} from './insurance.js';
import {towerSegmentDropChance,awardTowerSegments,normalizeTowerSegmentInventory,validTowerSegmentInventory} from './segments.js';
import {validTowerMutationState,grantTowerMutationDraft,normalizeTowerMutationInventory} from './mutations.js';
import {validTowerSurgeries,validTowerSurgicalStock,normalizeTowerSurgicalStock,purchaseTowerSurgery} from './surgery.js';
import {normalizeTowerGraftProsthetics} from './anatomy.js';
import {validTowerDonorState,awardTowerDonors} from './donors.js';
import {repairTowerArena,selectedTowerFloor,towerFloorCount,validTowerFloorPlan} from './floors.js';
import {TEST_BUILD} from '../build-channel.js';
import {validTowerRerolls} from './economy.js';
import {isBossFloor,hasBoss} from '../boss/config.js';
import {ensureBossEncounter,validBossEncounter,bossFloorReward,TOWER_REWARD} from '../boss/encounter.js';
import {newArtifactCollection,migrateArtifactInterval,validArtifactCollection,awardBossArtifact,artifactComplete,ARTIFACT_COUNT,ARTIFACT_COMPLETION_REWARD} from './artifacts.js';
import {BASE_STATS,earnedStats,validStats,normalizeProsthetics} from '../garage/model.js';
import {towerCycleInfo,towerCycleWins} from './cycles.js';
export {TOWER_REWARD};
export const towerEnemyReward=(t,victim=1)=>bossFloorReward(t,victim,selectedTowerFloor(t)?.kind==='danger');
export const floorEnemyCount=floor=>1+Math.floor(floor/2);
export const towerEnemyCount=t=>t.legacyEnemyCount??towerFloorCount(t)??(hasBoss(t)?3:floorEnemyCount(t.level));
export function newTower(patient=Math.floor(Math.random()*4),record=0,artifacts=newArtifactCollection(),insurance=newInsurance()){return {version:2,level:1,patient,stats:[...BASE_STATS],wins:0,prosthetics:[],graftProsthetics:[],donorTissues:[],mutations:[],mutationInventory:[],equippedMutations:[],nextMutationId:1,modInstallations:0,segmentInventory:[],equippedSegments:[],nextSegmentId:1,unseenSegmentIds:[],statChanges:0,surgeries:[],surgicalStock:[],nextSurgicalStockId:1,consumedDonorIds:[],arenaRerolls:0,arenaRerollLocked:false,rewarded:[],preparing:false,record,runKills:0,runCoins:0,artifacts,insurance};}
export function normalizeTower(t){
 if(!t||typeof t!=='object'||Array.isArray(t))return t;
 const previousBossInterval=t.artifacts?.bossEvery??(TEST_BUILD?2:5);
 t.prosthetics=normalizeProsthetics(t.prosthetics);
 t.mutations??=[];
 normalizeTowerMutationInventory(t);
 normalizeTowerSegmentInventory(t);
 t.statChanges??=0;
 t.surgeries??=[];
 normalizeTowerSurgicalStock(t);
 if(t.insurance?.checkpoint){
  const checkpoint=t.insurance.checkpoint;
  repairTowerArena(checkpoint.floorPlan,checkpoint.level);
  checkpoint.surgeries??=[];
  normalizeTowerSurgicalStock(checkpoint);
 }
 t.graftProsthetics=normalizeTowerGraftProsthetics(t.graftProsthetics,t);
 t.donorTissues??=[];
 repairTowerArena(t.floorPlan,t.level);
 t.arenaRerolls??=0;
 t.arenaRerollLocked??=false;
 t.insurance??=newInsurance();
 if(isBossFloor(t.level)&&!t.bossEncounter&&t.rewarded?.length&&t.legacyEnemyCount===undefined)t.legacyBossFloor=true;
 if(t.version===undefined||t.version===1){
  t.version=2;t.record=Math.max(0,t.wins??0);t.legacyEnemyCount=t.level;
  // Past run earnings were not recorded per player. Never invent those figures.
  t.runKills=t.wins>0?null:t.rewarded?.length??0;t.runCoins=t.runKills===null?null:t.runKills*TOWER_REWARD;
 }
 if(t.artifacts?.version===2&&(t.artifacts.bossEvery===undefined||t.artifacts.bossEvery===2)){
  migrateArtifactInterval(t.artifacts);
 }
 if(t.artifacts===undefined||t.artifacts?.version===1)t.artifacts=newArtifactCollection();
 if(previousBossInterval===2&&!isBossFloor(t.level)){
  if(t.bossEncounter){t.legacyEnemyCount=1;delete t.bossEncounter;}
  delete t.legacyBossFloor;
 }
 return t;
}
export function towerFor(session,player){
 const owner=session.players[player];
 if(!owner)throw Error('Игрок не найден.');
 initializePlayerArchive(owner);
 session.towers??={};const t=normalizeTower(session.towers[player]??=newTower());ensureBossEncounter(t);return t;
}
export function validTower(t){
 if(!t||typeof t!=='object')return false;
 const count=towerEnemyCount(t),optionalCount=n=>n===null||Number.isSafeInteger(n)&&n>=0;
 return validBossEncounter(t.bossEncounter,t.level)&&validTowerFloorPlan(t.floorPlan,t.level)&&t&&t.version===2&&Number.isSafeInteger(t.level)&&t.level>=1&&Number.isSafeInteger(t.wins)&&t.wins===t.level-1
  &&Number.isInteger(t.patient)&&t.patient>=0&&t.patient<4&&validStats(t.stats,towerCycleWins(t.level))
  &&(t.floorHistoryGeneration===undefined||Number.isSafeInteger(t.floorHistoryGeneration)&&t.floorHistoryGeneration>=0)
  &&(t.cycleNotice===undefined||t.cycleNotice===t.level&&t.level>30&&(t.level-1)%30===0)
  &&Number.isSafeInteger(t.statChanges)&&t.statChanges>=0
  &&(t.segmentRewardsEnabled===undefined||typeof t.segmentRewardsEnabled==='boolean')
  &&Number.isSafeInteger(t.record)&&t.record>=t.wins&&validArtifactCollection(t.artifacts,t.record)&&optionalCount(t.runKills)&&optionalCount(t.runCoins)&&validInsurance(t.insurance,t.record)&&validTowerMutationState(t)&&validTowerSegmentInventory(t)&&validTowerSurgeries(t.surgeries,t.level)&&validTowerSurgicalStock(t)&&validTowerDonorState(t)&&validTowerRerolls(t)&&typeof t.arenaRerollLocked==='boolean'
  &&Array.isArray(t.graftProsthetics)&&JSON.stringify(t.graftProsthetics)===JSON.stringify(normalizeTowerGraftProsthetics(t.graftProsthetics,t))
  &&(t.legacyEnemyCount===undefined||(t.legacyEnemyCount===t.level||t.legacyEnemyCount===1))
  &&(t.legacyBossFloor===undefined||t.legacyBossFloor===true&&isBossFloor(t.level)&&t.bossEncounter===undefined)
  &&typeof t.preparing==='boolean'&&Array.isArray(t.rewarded)&&t.rewarded.length<=count
  &&new Set(t.rewarded).size===t.rewarded.length&&t.rewarded.every(id=>Number.isInteger(id)&&id>=1&&id<=count);
}
export function rewardTower(session,player,victim,by){
 const t=towerFor(session,player);
 if(by!==0||!Number.isInteger(victim)||victim<1||victim>towerEnemyCount(t)||t.preparing||t.rewarded.includes(victim))return false;
 const reward=towerEnemyReward(t,victim);
 if(!canIssueCoins(session,reward))return false;
 t.rewarded.push(victim);
 awardTowerDonors(t,victim,selectedTowerFloor(t)?.profiles?.[victim-1]??(hasBoss(t)&&victim===1?'boss':'basic'));
 session.players[player].balance+=reward;session.towerEarned=(session.towerEarned??0)+reward;
 const owner=session.players[player];
 owner.towerKnockouts=(owner.towerKnockouts??0)+1;
 if(t.runKills!==null)t.runKills++;if(t.runCoins!==null)t.runCoins+=reward;return true;
}
function creditArtifactRewards(session,player,t){
 for(let artifact=0;artifact<ARTIFACT_COUNT;artifact++){
  if(!artifactComplete(t.artifacts,artifact)||t.artifacts.rewardedArtifacts.includes(artifact))continue;
  if(!canIssueCoins(session,ARTIFACT_COMPLETION_REWARD))continue;
  session.players[player].balance+=ARTIFACT_COMPLETION_REWARD;
  session.towerEarned=(session.towerEarned??0)+ARTIFACT_COMPLETION_REWARD;
  if(t.runCoins!==null)t.runCoins+=ARTIFACT_COMPLETION_REWARD;
  t.artifacts.rewardedArtifacts.push(artifact);
 }
}
export function completeTower(session,player,won,random=Math.random){
 const t=towerFor(session,player);
 const owner=session.players[player];
 owner.towerBattles=(owner.towerBattles??0)+1;
 if(won){const bossWon=hasBoss(t);
  // Snapshot prior wins BEFORE the artifact roll increments bossWins.
  // Both loot systems use the same per-boss cumulative replay penalty.
  const previousBossWins=bossWon?(t.artifacts.bossWins[t.level]??0):0;
  if(bossWon)awardBossArtifact(t.artifacts,t.level,random);
  creditArtifactRewards(session,player,t);t.record=Math.max(t.record,t.level);
  // Earned skill points restart every 30 floors without resetting history.
  // Remember the player's manual skill allocation, independently of the
  // points automatically earned in the current 30-floor cycle.
  const earned=earnedStats(towerCycleWins(t.level));
  const allocation=t.stats.map((value,i)=>value-earned[i]);
  t.wins++;t.level++;
  // New earned point follows the standard progression, while the patient's
  // manually selected +1/-1 redistribution remains attached to its skills.
  // In particular, a boosted mobility skill stays boosted after every victory.
  const nextBase=earnedStats(towerCycleWins(t.level));
  t.stats=nextBase.map((value,i)=>value+allocation[i]);
  if(towerCycleWins(t.level)===0){
   // Starting a new cycle resets earned points only, not the chosen allocation.
   // Death without DMS and manual reset still restore the standard baseline.
   t.insurance=newInsurance();t.cycleNotice=t.level;
   t.floorHistoryGeneration=(t.floorHistoryGeneration??0)+1;
  }
  t.arenaRerolls=0;t.arenaRerollLocked=false;t.rewarded=[];t.preparing=true;delete t.legacyEnemyCount;delete t.bossEncounter;delete t.legacyBossFloor;delete t.floorPlan;
  if(bossWon){
   // Transitional implementation: new segment warehouse is populated while
   // the legacy reward UI remains enabled until its full replacement lands.
   if(t.segmentRewardsEnabled)awardTowerSegments(t,t.level-1,random,towerSegmentDropChance(previousBossWins),previousBossWins);
   else grantTowerMutationDraft(t,random,previousBossWins);
  }
  const note=awardArchiveNote(owner.archiveNotes,random);
  if(note!==undefined)owner.unreadArchiveNoteIds.push(note);
 }
 else {
  const c=t.insurance.checkpoint,next=newTower(undefined,t.record,t.artifacts,t.insurance);
  if(c){
   Object.assign(next,structuredClone(c),{runKills:t.runKills,runCoins:t.runCoins,preparing:Boolean(c.mutationDraft)});
   next.insurance.checkpoint=null;
  }
  // The warehouse survives uninsured death; only the installed parts are lost.
  // A DMS checkpoint restores the patient build, but the latest warehouse
  // remains current even if its snapshot was taken earlier.
  const insuredIds=new Set(c?.equippedSegments??[]);
  const uninsuredIds=new Set(t.equippedSegments??[]);
  const surviving=t.segmentInventory.filter(item=>!uninsuredIds.has(item.id));
  const insured=(c?.segmentInventory??[]).filter(item=>insuredIds.has(item.id));
  next.segmentInventory=structuredClone([...surviving,...insured.filter(item=>
   !surviving.some(existing=>existing.id===item.id))]);
  next.equippedSegments=[...insuredIds];
  next.nextSegmentId=Math.max(t.nextSegmentId,c?.nextSegmentId??1);
  next.statChanges=c?.statChanges??0;
  next.unseenSegmentIds=(t.unseenSegmentIds??[]).filter(id=>next.segmentInventory.some(item=>item.id===id));
  // Death without DMS starts a genuinely new patient/run. An older saved
  // segmentRewardsEnabled=false flag must not trap that fresh run in the
  // obsolete whole-modification reward path (which hides segment rewards).
  // A restored DMS checkpoint retains its original reward system.
  if(c){
   if(t.segmentRewardsEnabled!==undefined)next.segmentRewardsEnabled=t.segmentRewardsEnabled;
  }else next.segmentRewardsEnabled=true;
  // A surviving warehouse must be usable immediately on the replacement patient.
  // Likewise, DMS restores the patient to a configurable preparation phase.
  if(next.segmentRewardsEnabled)next.preparing=true;
  if(t.floorHistoryGeneration!==undefined)next.floorHistoryGeneration=t.floorHistoryGeneration;
  delete next.lastBossSegments;
  normalizeTowerMutationInventory(next);
  session.towers[player]=next;
 }
 return session.towers[player];
}
export function resetTower(session,player){
 const t=towerFor(session,player);
 // A voluntary run reset abandons the insured checkpoint as well as the build.
 // Retain the earned artifact collection, personal record and escalated DMS tariff.
 const next=newTower(undefined,t.record,t.artifacts,{price:t.insurance.price,checkpoint:null});
 next.floorHistoryGeneration=(t.floorHistoryGeneration??0)+1;
 return session.towers[player]=next;
}

export function buyTowerSurgery(session,player,procedure,site,donorId=null,replaceSite=null,stockId=null){
 const t=towerFor(session,player);
 return purchaseTowerSurgery(session,player,t,procedure,site,donorId,replaceSite,stockId);
}
export function buyTowerInsurance(session,player){const t=towerFor(session,player);return purchaseInsurance(session,player,t);}
