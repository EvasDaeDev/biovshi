import {BASE_STATS,patientVictory,validStats} from '../garage/model.js';
export const TOWER_REWARD=10;
export const floorEnemyCount=floor=>1+Math.floor(floor/2);
export const towerEnemyCount=t=>t.legacyEnemyCount??floorEnemyCount(t.level);
export function newTower(patient=Math.floor(Math.random()*4),record=0){return {version:2,level:1,patient,stats:[...BASE_STATS],wins:0,rewarded:[],preparing:false,record,runKills:0,runCoins:0};}
export function normalizeTower(t){
 if(!t||typeof t!=='object'||Array.isArray(t))return t;
 if(t.version===undefined||t.version===1){
  t.version=2;t.record=Math.max(0,t.wins??0);t.legacyEnemyCount=t.level;
  // Past run earnings were not recorded per player. Never invent those figures.
  t.runKills=t.wins>0?null:t.rewarded?.length??0;t.runCoins=t.runKills===null?null:t.runKills*TOWER_REWARD;
 }
 return t;
}
export function towerFor(session,player){
 if(!session.players[player])throw Error('Игрок не найден.');
 session.towers??={};return normalizeTower(session.towers[player]??=newTower());
}
export function validTower(t){
 if(!t||typeof t!=='object')return false;
 const count=towerEnemyCount(t),optionalCount=n=>n===null||Number.isSafeInteger(n)&&n>=0;
 return t&&t.version===2&&Number.isSafeInteger(t.level)&&t.level>=1&&Number.isSafeInteger(t.wins)&&t.wins===t.level-1
  &&Number.isInteger(t.patient)&&t.patient>=0&&t.patient<4&&validStats(t.stats,t.wins)
  &&Number.isSafeInteger(t.record)&&t.record>=t.wins&&optionalCount(t.runKills)&&optionalCount(t.runCoins)
  &&(t.legacyEnemyCount===undefined||t.legacyEnemyCount===t.level)
  &&typeof t.preparing==='boolean'&&Array.isArray(t.rewarded)&&t.rewarded.length<=count
  &&new Set(t.rewarded).size===t.rewarded.length&&t.rewarded.every(id=>Number.isInteger(id)&&id>=1&&id<=count);
}
export function rewardTower(session,player,victim,by){
 const t=towerFor(session,player);
 if(by!==0||!Number.isInteger(victim)||victim<1||victim>towerEnemyCount(t)||t.preparing||t.rewarded.includes(victim))return false;
 const issued=session.players.length*session.capital+(session.topUps??0)+(session.towerEarned??0);
 if(issued+TOWER_REWARD>16000000)return false;
 t.rewarded.push(victim);session.players[player].balance+=TOWER_REWARD;session.towerEarned=(session.towerEarned??0)+TOWER_REWARD;
 if(t.runKills!==null)t.runKills++;if(t.runCoins!==null)t.runCoins+=TOWER_REWARD;return true;
}
export function completeTower(session,player,won){
 const t=towerFor(session,player);
 if(won){t.record=Math.max(t.record,t.level);patientVictory(t);t.level++;t.rewarded=[];t.preparing=true;delete t.legacyEnemyCount;}
 else session.towers[player]=newTower(undefined,t.record);
 return session.towers[player];
}
export function resetTower(session,player){const t=towerFor(session,player);return session.towers[player]=newTower(undefined,t.record);}
