import {CONFIG} from '../config.js';
import {BOSS_FLOOR_INTERVAL} from '../build-channel.js';
const timing=()=>({windupSec:CONFIG.combat.windupSec,thrustSec:CONFIG.combat.thrustSec,recoverSec:CONFIG.combat.recoverSec});
const rest=Math.max(0,CONFIG.combat.attackCooldownSec-Object.values(timing()).reduce((a,b)=>a+b,0));
export const BOSS_CONFIG={scale:1.5,headScale:1,headOffset:18,healthMultiplier:2,segmentHp:5,reward:750,behaviorEnabled:true,criticalChance:.30,speedFactor:.85,turnFactor:.75,
 combat:{...timing(),attackCooldownSec:CONFIG.combat.attackCooldownSec},
 tactics:{phaseHealth:.60,phaseLimbLoss:.25,followupDelay:rest,seriesRest:rest,spacingDistance:68,
  first:timing(),
  second:timing(),
  sweep:timing(),
  sweepHalfAngle:70*Math.PI/180,
  chargeWindup:.80,chargeDuration:.55,chargeRecovery:.65,chargeCooldown:12,
  chargeMinGap:70,chargeMaxGap:170,chargeDistance:72,chargeSpeed:2.4,
  chargeTerminalGap:42,chargeSideOffset:24,chargeSteerLimit:.65,chargeAlignTolerance:.26,
  chargeAbandonGap:120,chargeAbortCooldown:2.5,chargeQuickAttackWindow:.25,
  chargeAttackWindup:.22,chargeOutcomeWindow:1.5,chargeMemorySize:4,
  positionMaxGap:118,positionNearGap:64,positionMaxTravel:155,positionClearance:26,
  positionPredictionSec:.18,positionCommitSec:1.8,positionTargetReplanCm:42,
  positionStopGap:18,positionAlignTolerance:.25,positionPivotGap:94,
  retreatVelocityThreshold:12,retreatPressureTrigger:2.2,
  sideKickBearing:1.28,sideArmBearing:.92,sideApproachStep:38,
  sideStanceRange:72,sideStanceLateral:39,sideBodyMargin:32,
 }};
export const BOSS_VARIANTS=[
 {id:'brute',name:'Громила',spineSegments:4},
 {id:'long',name:'Длинный',spineSegments:6},
 {id:'arms',name:'Многорукий',spineSegments:6,extra:'arm'},
 {id:'legs',name:'Многоногий',spineSegments:6,extra:'leg'},
 {id:'long_legs',name:'Длинный многоногий',spineSegments:8,extra:'leg',extraAnchor:5},
 {id:'long_arms',name:'Длинный многорукий',spineSegments:8,extra:'arm',extraAnchor:3},
];
export const BOSS_ANATOMY_SEQUENCE=Object.freeze(['brute','long','legs','arms','long_legs','long_arms']);
export const bossVariantForFloor=level=>BOSS_ANATOMY_SEQUENCE[(Math.max(1,Math.floor(level/BOSS_FLOOR_INTERVAL))-1)%BOSS_ANATOMY_SEQUENCE.length];
export const isBossFloor=level=>Number.isSafeInteger(level)&&level>0&&level%BOSS_FLOOR_INTERVAL===0;

export const hasBoss=t=>isBossFloor(t.level)&&t.legacyEnemyCount===undefined&&!t.legacyBossFloor;
