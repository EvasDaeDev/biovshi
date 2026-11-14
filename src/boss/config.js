import {BOSS_FLOOR_INTERVAL} from '../build-channel.js';
export const BOSS_CONFIG={scale:1.5,headScale:.75,healthMultiplier:2,reward:100,behaviorEnabled:true,criticalChance:.30,speedFactor:.85,turnFactor:.75,
 combat:{windupSec:.50,thrustSec:.20,recoverSec:.45,attackCooldownSec:1.20},
 tactics:{phaseHealth:.60,phaseLimbLoss:.25,followupDelay:.10,seriesRest:.45,spacingDistance:68,
  first:{windupSec:.50,thrustSec:.20,recoverSec:.10},
  second:{windupSec:.36,thrustSec:.20,recoverSec:.35},
  sweep:{windupSec:.70,thrustSec:.38,recoverSec:.35},
  sweepHalfAngle:70*Math.PI/180,
  chargeWindup:.80,chargeDuration:.48,chargeRecovery:.65,chargeCooldown:12,
  chargeMinGap:70,chargeMaxGap:170,chargeDistance:48,chargeSpeed:2.4,
 }};
export const BOSS_VARIANTS=[
 {id:'brute',name:'Громила',spineSegments:4},
 {id:'long',name:'Длинный',spineSegments:6},
 {id:'arms',name:'Многорукий',spineSegments:6,extra:'arm'},
 {id:'legs',name:'Многоногий',spineSegments:6,extra:'leg'},
];
export const isBossFloor=level=>Number.isSafeInteger(level)&&level>0&&level%BOSS_FLOOR_INTERVAL===0;

export const hasBoss=t=>isBossFloor(t.level)&&t.legacyEnemyCount===undefined&&!t.legacyBossFloor;
