import {BOSS_FLOOR_INTERVAL} from '../build-channel.js';
export const BOSS_NAMES=Object.freeze(['Потрошитель','Костолом','Гниломорд','Мясоруб','Хряп','Кадавр','Шрамыч','Костогрыз','Недодел','Живодёр','Трупоед','Перешив']);
export function bossName(floor){
 const ordinal=Number.isSafeInteger(floor)&&floor>0?Math.max(1,Math.floor(floor/BOSS_FLOOR_INTERVAL)):1;
 const index=ordinal-1,repeat=Math.floor(index/BOSS_NAMES.length)+1;
 return BOSS_NAMES[index%BOSS_NAMES.length]+(repeat>1?' '+repeat:'');
}
