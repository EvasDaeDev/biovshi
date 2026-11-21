import {bossName} from './names.js';
import {ctx} from '../game/state.js';
import {bossStats} from './progression.js';
import {createBossBehavior} from './behavior.js';
import {sweepPose} from './attacks.js';
import {paintBossTelegraph} from './telegraph.js';
import {bossSpawn} from './spawn.js';
import {createRobot} from '../robot/robot.js';
import {bossAnatomy,destroyFromBloodLoss} from './anatomy.js';
import {bossSkinParts} from './skin.js';
import {BOSS_CONFIG} from './config.js';
import {BOSS_TEXTURES,bossTextureKey} from './assets.js';
export function createBoss(id,start,encounter){
 if(ctx.towerGarage?.[id])ctx.towerGarage[id].stats=bossStats(encounter.floor);
 const anatomy=bossAnatomy(encounter.variant),textureIndex=Math.max(0,BOSS_TEXTURES.indexOf(encounter.texture));
 const behavior=BOSS_CONFIG.behaviorEnabled?createBossBehavior():null;
 return createRobot(id,bossSpawn(start,anatomy),{...anatomy,behavior,
  ...(behavior?{intent:behavior.intent,resolveCombat:behavior.resolveCombat,planCombat:behavior.planCombat,strikePose:sweepPose,paint:paintBossTelegraph}:{}),scaleMultiplier:BOSS_CONFIG.scale,speedFactor:BOSS_CONFIG.speedFactor,turnFactor:BOSS_CONFIG.turnFactor,
  traumaEnabled:false,failFromOilLoss:destroyFromBloodLoss,combat:BOSS_CONFIG.combat,allowPounce:false,
  skinParts:bossSkinParts(anatomy),skinKey:bossTextureKey(textureIndex),name:bossName(encounter.floor),arenaLabel:bossName(encounter.floor)});
}
