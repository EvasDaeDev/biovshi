// Tower-only enemy profiles. The basic profile preserves the legacy appearance.
export const TOWER_ENEMY_PROFILES=Object.freeze({
 basic:Object.freeze({name:'Обычный',stats:[3,3,3],skinKey:null,voice:null}),
 fast:Object.freeze({name:'Быстрый',stats:[5,2,3],skinKey:'robotEnemy1',voice:'male'}),
 strong:Object.freeze({name:'Силовой',stats:[2,5,3],skinKey:'robotEnemy2',voice:'male'}),
 agile:Object.freeze({name:'Маневренный',stats:[3,2,5],skinKey:'robotEnemy3',voice:'female'}),
 elite:Object.freeze({name:'Элитный',stats:[4,4,4],skinKey:'robotEnemy4',voice:'female'})
});
export const towerEnemyProfile=id=>TOWER_ENEMY_PROFILES[id]??TOWER_ENEMY_PROFILES.basic;
export const validTowerProfile=id=>typeof id==='string'&&Object.hasOwn(TOWER_ENEMY_PROFILES,id);
