import {newInsurance,validInsurance,purchaseInsurance} from './insurance.js';
import {selectedTowerFloor,towerFloorCount,validTowerFloorPlan} from './floors.js';
import {TEST_BUILD} from '../build-channel.js';
import {isBossFloor,hasBoss} from '../boss/config.js';
import {ensureBossEncounter,validBossEncounter,bossFloorReward} from '../boss/encounter.js';
import {newArtifactCollection,migrateArtifactInterval,validArtifactCollection,awardBossArtifact,artifactComplete,ARTIFACT_COUNT,ARTIFACT_COMPLETION_REWARD} from './artifacts.js';
import {BASE_STATS,patientVictory,validStats,normalizeProsthetics} from '../garage/model.js';
export const TOWER_REWARD=10;
export const towerEnemyReward=(t,victim=1)=>{
 const standard=bossFloorReward(t,victim);
 return selectedTowerFloor(t)?.kind==='danger'?standard+5:standard;
};
export const floorEnemyCount=floor=>1+Math.floor(floor/2);
export const towerEnemyCount=t=>t.legacyEnemyCount??towerFloorCount(t)??(hasBoss(t)?3:floorEnemyCount(t.level));
export function newTower(patient=Math.floor(Math.random()*4),record=0,artifacts=newArtifactCollection(),insurance=newInsurance()){return {version:2,level:1,patient,stats:[...BASE_STATS],wins:0,prosthetics:[],rewarded:[],preparing:false,record,runKills:0,runCoins:0,artifacts,insurance};}
export function normalizeTower(t){
 if(!t||typeof t!=='object'||Array.isArray(t))return t;
 const previousBossInterval=t.artifacts?.bossEvery??(TEST_BUILD?2:5);
 t.prosthetics=normalizeProsthetics(t.prosthetics);
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
 if(!session.players[player])throw Error('Игрок не найден.');
 session.towers??={};const t=normalizeTower(session.towers[player]??=newTower());ensureBossEncounter(t);return t;
}
export function validTower(t){
 if(!t||typeof t!=='object')return false;
 const count=towerEnemyCount(t),optionalCount=n=>n===null||Number.isSafeInteger(n)&&n>=0;
 return validBossEncounter(t.bossEncounter,t.level)&&validTowerFloorPlan(t.floorPlan,t.level)&&t&&t.version===2&&Number.isSafeInteger(t.level)&&t.level>=1&&Number.isSafeInteger(t.wins)&&t.wins===t.level-1
  &&Number.isInteger(t.patient)&&t.patient>=0&&t.patient<4&&validStats(t.stats,t.wins)
  &&Number.isSafeInteger(t.record)&&t.record>=t.wins&&validArtifactCollection(t.artifacts,t.record)&&optionalCount(t.runKills)&&optionalCount(t.runCoins)&&validInsurance(t.insurance,t.record)
  &&(t.legacyEnemyCount===undefined||(t.legacyEnemyCount===t.level||t.legacyEnemyCount===1))
  &&(t.legacyBossFloor===undefined||t.legacyBossFloor===true&&isBossFloor(t.level)&&t.bossEncounter===undefined)
  &&typeof t.preparing==='boolean'&&Array.isArray(t.rewarded)&&t.rewarded.length<=count
  &&new Set(t.rewarded).size===t.rewarded.length&&t.rewarded.every(id=>Number.isInteger(id)&&id>=1&&id<=count);
}
export function rewardTower(session,player,victim,by){
 const t=towerFor(session,player);
 if(by!==0||!Number.isInteger(victim)||victim<1||victim>towerEnemyCount(t)||t.preparing||t.rewarded.includes(victim))return false;
 const reward=towerEnemyReward(t,victim);
 const issued=session.players.length*session.capital+(session.topUps??0)+(session.towerEarned??0);
 if(issued+reward>16000000)return false;
 t.rewarded.push(victim);session.players[player].balance+=reward;session.towerEarned=(session.towerEarned??0)+reward;
 if(t.runKills!==null)t.runKills++;if(t.runCoins!==null)t.runCoins+=reward;return true;
}
function creditArtifactRewards(session,player,t){
 for(let artifact=0;artifact<ARTIFACT_COUNT;artifact++){
  if(!artifactComplete(t.artifacts,artifact)||t.artifacts.rewardedArtifacts.includes(artifact))continue;
  const issued=session.players.length*session.capital+(session.topUps??0)+(session.towerEarned??0);
  if(issued+ARTIFACT_COMPLETION_REWARD>16000000)continue;
  session.players[player].balance+=ARTIFACT_COMPLETION_REWARD;
  session.towerEarned=(session.towerEarned??0)+ARTIFACT_COMPLETION_REWARD;
  if(t.runCoins!==null)t.runCoins+=ARTIFACT_COMPLETION_REWARD;
  t.artifacts.rewardedArtifacts.push(artifact);
 }
}
export function completeTower(session,player,won,random=Math.random){
 const t=towerFor(session,player);
 if(won){if(hasBoss(t))awardBossArtifact(t.artifacts,t.level,random);creditArtifactRewards(session,player,t);t.record=Math.max(t.record,t.level);patientVictory(t);t.level++;t.rewarded=[];t.preparing=true;delete t.legacyEnemyCount;delete t.bossEncounter;delete t.legacyBossFloor;delete t.floorPlan;}
 else {
  const c=t.insurance.checkpoint,next=newTower(undefined,t.record,t.artifacts,t.insurance);
  if(c){
   Object.assign(next,structuredClone(c),{runKills:t.runKills,runCoins:t.runCoins});
   next.insurance.checkpoint=null;
  }
  session.towers[player]=next;
 }
 return session.towers[player];
}
export function resetTower(session,player){const t=towerFor(session,player);return session.towers[player]=newTower(undefined,t.record,t.artifacts,t.insurance);}

export function buyTowerInsurance(session,player){const t=towerFor(session,player);return purchaseInsurance(session,player,t);}
