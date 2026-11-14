export const BOSS_CONFIG={scale:1.5,healthMultiplier:2,reward:100,speedFactor:.85,turnFactor:.75,
 combat:{windupSec:.50,thrustSec:.20,recoverSec:.45,attackCooldownSec:1.20}};
export const BOSS_VARIANTS=[
 {id:'brute',name:'Громила',spineSegments:4},
 {id:'long',name:'Длинный',spineSegments:6},
 {id:'arms',name:'Многорукий',spineSegments:6,extra:'arm'},
 {id:'legs',name:'Многоногий',spineSegments:6,extra:'leg'},
];
export const isBossFloor=level=>Number.isSafeInteger(level)&&level>0&&level%5===0;

export const hasBoss=t=>isBossFloor(t.level)&&t.legacyEnemyCount===undefined&&!t.legacyBossFloor;
