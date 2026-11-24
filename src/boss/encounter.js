import {COIN_SCALE} from '../betting/coins.js';
import {BOSS_VARIANTS,bossVariantForFloor,isBossFloor,BOSS_CONFIG,hasBoss} from './config.js';
import {BOSS_TEXTURES} from './assets.js';
export function ensureBossEncounter(t,random=Math.random){
 if(!hasBoss(t))return null;
 if(!t.bossEncounter||t.bossEncounter.floor!==t.level){
  t.bossEncounter={floor:t.level,variant:bossVariantForFloor(t.level),texture:BOSS_TEXTURES[Math.floor(random()*BOSS_TEXTURES.length)]};
 }
 return t.bossEncounter;
}
export function validBossEncounter(e,level){
 return e===undefined||e&&e.floor===level&&isBossFloor(level)&&BOSS_VARIANTS.some(v=>v.id===e.variant)&&typeof e.texture==='string'&&/^assets\/textures\/robots\/boss\/b_\d+\.png$/.test(e.texture);
}
export const TOWER_REWARD=10*COIN_SCALE;
export const towerOpponentReward=(isBoss,danger)=>isBoss?BOSS_CONFIG.reward:danger?15*COIN_SCALE:TOWER_REWARD;
export const bossFloorReward=(tower,victim=1,danger=false)=>towerOpponentReward(hasBoss(tower)&&victim===1,danger);
