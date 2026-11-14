import {BASE_STATS} from '../garage/model.js';
import {BOSS_FLOOR_INTERVAL} from '../build-channel.js';
// Derive from floor, so reopening a saved encounter never adds points again.
export function bossStats(floor){
 const ordinal=Number.isSafeInteger(floor)&&floor>0?Math.floor(floor/BOSS_FLOOR_INTERVAL):1;
 const bonus=2*Math.max(0,ordinal-1);
 return BASE_STATS.map(value=>value+bonus);
}
