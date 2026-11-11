import {BASE_STATS,patientVictory,validStats} from '../garage/model.js';
export const TOWER_REWARD=10;
export function newTower(patient=0){return {level:1,patient,stats:[...BASE_STATS],wins:0,rewarded:[],preparing:false};}
export function towerFor(session,player){
  if(!session.players[player])throw Error('Игрок не найден.');
  session.towers??={};
  return session.towers[player]??=newTower();
}
export function validTower(t){
  return t&&Number.isSafeInteger(t.level)&&t.level>=1&&Number.isSafeInteger(t.wins)&&t.wins===t.level-1
    &&Number.isInteger(t.patient)&&t.patient>=0&&t.patient<4&&validStats(t.stats,t.wins)
    &&typeof t.preparing==='boolean'&&Array.isArray(t.rewarded)&&t.rewarded.length<=t.level
    &&new Set(t.rewarded).size===t.rewarded.length&&t.rewarded.every(id=>Number.isInteger(id)&&id>=1&&id<=t.level);
}
export function rewardTower(session,player,victim,by){
  const t=towerFor(session,player);
  if(by!==0||!Number.isInteger(victim)||victim<1||victim>t.level||t.preparing||t.rewarded.includes(victim))return false;
  const issued=session.players.length*session.capital+(session.topUps??0)+(session.towerEarned??0);
  if(issued+TOWER_REWARD>16000000)return false;
  t.rewarded.push(victim);session.players[player].balance+=TOWER_REWARD;
  session.towerEarned=(session.towerEarned??0)+TOWER_REWARD;
  return true;
}
export function completeTower(session,player,won){
  const t=towerFor(session,player);
  if(won){patientVictory(t);t.level++;t.rewarded=[];t.preparing=true;}
  else session.towers[player]=newTower(t.patient);
  return session.towers[player];
}
export function resetTower(session,player){const t=towerFor(session,player);return session.towers[player]=newTower(t.patient);}
