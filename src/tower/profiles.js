// Tower-only enemy profiles. Use the existing movement/turning/critical hit
// formulas; no new attack rules or AI paths are introduced by a profile.
// Values are intentionally far enough from the 3/3/3 baseline to be legible.
import {statMultiplier,critChance} from '../garage/model.js';

export const TOWER_ENEMY_PROFILES=Object.freeze({
 basic:Object.freeze({name:'Обычный',stats:[3,3,3],skinKey:null,voice:null,focus:'Стандартные характеристики'}),
 fast:Object.freeze({name:'Быстрый',stats:[7,2,3],skinKey:'robotEnemy1',voice:'male',focus:'Предпочитает прямое преследование и быстрое сближение'}),
 strong:Object.freeze({name:'Силовой',stats:[2,7,3],skinKey:'robotEnemy2',voice:'male',focus:'Навязывает ближний бой и чаще наносит критические удары'}),
 agile:Object.freeze({name:'Маневренный',stats:[3,2,7],skinKey:'robotEnemy3',voice:'female',focus:'Шире заходит с фланга и быстрее разворачивается'}),
 elite:Object.freeze({name:'Элитный',stats:[5,5,5],skinKey:'robotEnemy4',voice:'female',focus:'Сочетает усиленные характеристики и гибкую тактику'})
});
export const towerEnemyProfile=id=>TOWER_ENEMY_PROFILES[id]??TOWER_ENEMY_PROFILES.basic;
export const validTowerProfile=id=>typeof id==='string'&&Object.hasOwn(TOWER_ENEMY_PROFILES,id);

export function towerProfileEffect(id){
 const profile=towerEnemyProfile(id),[speed,strength,maneuver]=profile.stats;
 return {speed:Math.round(statMultiplier(speed)*100),
  critical:Math.round(critChance(strength)*100),
  maneuver:Math.round(statMultiplier(maneuver)*100)};
}
export function towerProfileDifference(id){
 const profile=towerEnemyProfile(id);
 const {speed,critical,maneuver}=towerProfileEffect(id);
 if(id==='fast')return 'Скорость '+speed+'% · '+profile.focus;
 if(id==='strong')return 'Критический удар '+critical+'% · '+profile.focus;
 if(id==='agile')return 'Поворот '+maneuver+'% · '+profile.focus;
 if(id==='elite')return 'Скорость '+speed+'% · крит '+critical+'% · поворот '+maneuver+'% · '+profile.focus;
 return 'Обычный · скорость 100% · крит 15% · поворот 100%';
}
