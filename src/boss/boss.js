import {bossSpawn} from './spawn.js';
import {createRobot} from '../robot/robot.js';
import {bossAnatomy,destroyFromBloodLoss} from './anatomy.js';
import {bossSkinParts} from './skin.js';
import {BOSS_CONFIG} from './config.js';
import {BOSS_TEXTURES,bossTextureKey} from './assets.js';
export function createBoss(id,start,encounter){
 const anatomy=bossAnatomy(encounter.variant),textureIndex=Math.max(0,BOSS_TEXTURES.indexOf(encounter.texture));
 return createRobot(id,bossSpawn(start,anatomy),{...anatomy,isBoss:true,scaleMultiplier:BOSS_CONFIG.scale,speedFactor:BOSS_CONFIG.speedFactor,turnFactor:BOSS_CONFIG.turnFactor,
  traumaEnabled:false,failFromOilLoss:destroyFromBloodLoss,combat:BOSS_CONFIG.combat,allowPounce:false,
  skinParts:bossSkinParts(anatomy),skinKey:bossTextureKey(textureIndex),name:anatomy.variant.name,arenaLabel:'БОСС'});
}
