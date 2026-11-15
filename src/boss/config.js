import {CONFIG} from '../config.js';
import {BOSS_FLOOR_INTERVAL} from '../build-channel.js';
const timing=()=>({windupSec:CONFIG.combat.windupSec,thrustSec:CONFIG.combat.thrustSec,recoverSec:CONFIG.combat.recoverSec});
const rest=Math.max(0,CONFIG.combat.attackCooldownSec-Object.values(timing()).reduce((a,b)=>a+b,0));
export const BOSS_CONFIG={scale:1.5,headScale:1,headOffset:18,healthMultiplier:2,segmentHp:5,reward:100,behaviorEnabled:true,criticalChance:.30,speedFactor:.85,turnFactor:.75,
 combat:{...timing(),attackCooldownSec:CONFIG.combat.attackCooldownSec},
 tactics:{phaseHealth:.60,phaseLimbLoss:.25,followupDelay:rest,seriesRest:rest,spacingDistance:68,
  first:timing(),
  second:timing(),
  sweep:timing(),
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
