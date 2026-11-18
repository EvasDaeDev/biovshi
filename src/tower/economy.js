// Stage G: two explicit, paid Tower decisions. All writes go through the
// canonical persisted session; UI drafts never modify run or money.
import {validStats} from '../garage/model.js';
import {towerCycleWins} from './cycles.js';
import {ARENAS} from '../game/arenas.js';
import {hasBoss} from '../boss/config.js';
import {TOWER_ARENA_CAPACITY,validTowerFloorPlan} from './floors.js';

export const TOWER_STAT_CHANGE_PRICE=50;
export const TOWER_REROLL_MAX=60;
export const towerRerollPrice=count=>Number.isSafeInteger(count)&&count>=0&&count<TOWER_REROLL_MAX
 ?Math.ceil(50*1.2**count):Infinity;
export const validTowerRerolls=run=>Number.isSafeInteger(run?.arenaRerolls)&&run.arenaRerolls>=0&&run.arenaRerolls<=TOWER_REROLL_MAX
 &&(run.arenaRerolls===0||run.floorPlan?.floor===run.level);

function charge(session,player,price){
 const buyer=session.players?.[player],spent=session.towerEconomySpent??0;
 if(!buyer||!Number.isSafeInteger(price)||price<1||buyer.balance<price)
  throw Error('Недостаточно монет для покупки.');
 if(!Number.isSafeInteger(spent)||spent<0||spent+price>16000000)
  throw Error('Недопустимый расход монет.');
 buyer.balance-=price;session.towerEconomySpent=spent+price;
}
export function purchaseTowerStatChange(session,player,run,stats){
 if(!run||run.arenaRerollLocked||run.rewarded?.length||!validStats(run.stats,towerCycleWins(run.level))||!validStats(stats,towerCycleWins(run.level))
  ||run.stats.every((v,i)=>v===stats[i])
  ||stats.reduce((sum,v,i)=>sum+Math.max(0,v-run.stats[i]),0)!==1)
  throw Error('Выбери допустимый перенос одного очка для подтверждения.');
 charge(session,player,TOWER_STAT_CHANGE_PRICE);
 run.stats=[...stats];
 return TOWER_STAT_CHANGE_PRICE;
}

// Both challenge cards have to fit the *same* new arena, so that changing
// difficulty never silently changes terrain. Keep the boss placement policy.
export function towerRerollCandidates(run){
 const plan=run?.floorPlan;
 if(!plan||plan.floor!==run.level||!validTowerFloorPlan(plan,run.level)||run.arenaRerollLocked||run.rewarded?.length)return [];
 const boss=hasBoss(run),minimum=boss?6:run.level>=20?7:run.level>=10?6:run.level>=5?4:2;
 return Object.keys(ARENAS).filter(id=>{
  if(id===plan.options[0].arenaId)return false;
  if(boss&&(id!=='ward'&&id!=='columns'||run.level>=25&&id!=='columns'))return false;
  const capacity=TOWER_ARENA_CAPACITY[id];
  return capacity>=minimum&&plan.options.every(o=>o.profiles.length+1<=capacity);
 });
}
export function purchaseTowerArenaReroll(session,player,run,random=Math.random){
 const count=run?.arenaRerolls,price=towerRerollPrice(count);
 const candidates=towerRerollCandidates(run);
 if(!validTowerRerolls(run)||!candidates.length||!Number.isSafeInteger(price))
  throw Error('Нет другой доступной арены для этого состава.');
 const sample=Number(random());
 if(!Number.isFinite(sample)||sample<0||sample>=1)throw Error('Ошибка выбора случайной арены.');
 const chosen=candidates[Math.floor(sample*candidates.length)];
 charge(session,player,price);
 for(const option of run.floorPlan.options)option.arenaId=chosen;
 run.arenaRerolls++;
 return {arenaId:chosen,price};
}
