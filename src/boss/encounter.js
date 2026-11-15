import {BOSS_VARIANTS,isBossFloor,BOSS_CONFIG,hasBoss} from './config.js';
import {BOSS_TEXTURES} from './assets.js';
export function ensureBossEncounter(t,random=Math.random){
 if(!hasBoss(t))return null;
 if(!t.bossEncounter||t.bossEncounter.floor!==t.level){
  t.bossEncounter={floor:t.level,variant:BOSS_VARIANTS[Math.floor(random()*BOSS_VARIANTS.length)].id,texture:BOSS_TEXTURES[Math.floor(random()*BOSS_TEXTURES.length)]};
 }
 return t.bossEncounter;
}
export function validBossEncounter(e,level){
 return e===undefined||e&&e.floor===level&&isBossFloor(level)&&BOSS_VARIANTS.some(v=>v.id===e.variant)&&typeof e.texture==='string'&&/^assets\/textures\/robots\/boss\/b_\d+\.png$/.test(e.texture);
}
export const bossFloorReward=t=>hasBoss(t)?BOSS_CONFIG.reward:10;
