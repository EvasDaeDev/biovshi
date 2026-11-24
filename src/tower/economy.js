// Stage G: two explicit, paid Tower decisions. All writes go through the
// canonical persisted session; UI drafts never modify run or money.
import {COIN_SCALE,MAX_ISSUED_COINS} from '../betting/coins.js';
import {validStats} from '../garage/model.js';
import {towerCycleWins} from './cycles.js';
import {ARENAS,arenaCapacity} from '../game/arenas.js';
import {hasBoss} from '../boss/config.js';
import {bossArenaIds,towerArenaMinimum,validTowerFloorPlan} from './floors.js';

export const TOWER_REROLL_MAX=60;
export const towerRerollPrice=count=>Number.isSafeInteger(count)&&count>=0&&count<TOWER_REROLL_MAX
 ?10*COIN_SCALE:Infinity;
export const validTowerRerolls=run=>Number.isSafeInteger(run?.arenaRerolls)&&run.arenaRerolls>=0&&run.arenaRerolls<=TOWER_REROLL_MAX
 &&(run.arenaRerolls===0||run.floorPlan?.floor===run.level);

function charge(session,player,price){
 const buyer=session.players?.[player],spent=session.towerEconomySpent??0;
 if(!buyer||!Number.isSafeInteger(price)||price<1||buyer.balance<price)
  throw Error('Недостаточно монет для покупки.');
 if(!Number.isSafeInteger(spent)||spent<0||spent+price>MAX_ISSUED_COINS)
  throw Error('Недопустимый расход монет.');
 buyer.balance-=price;session.towerEconomySpent=spent+price;
}
export function applyTowerStatChange(run,stats){
 if(!run||run.arenaRerollLocked||run.rewarded?.length||!validStats(run.stats,towerCycleWins(run.level))||!validStats(stats,towerCycleWins(run.level))
  ||run.stats.every((v,i)=>v===stats[i])
  ||stats.reduce((sum,v,i)=>sum+Math.max(0,v-run.stats[i]),0)!==1)
  throw Error('Выбери допустимый перенос одного очка для подтверждения.');
 run.stats=[...stats];
 run.statChanges=(run.statChanges??0)+1;
}

// Both challenge cards have to fit the *same* new arena, so that changing
// difficulty never silently changes terrain. Keep the boss placement policy.
export function towerRerollCandidates(run){
 const plan=run?.floorPlan;
 if(!plan||plan.floor!==run.level||!validTowerFloorPlan(plan,run.level)||run.arenaRerollLocked||run.rewarded?.length)return [];
 const boss=hasBoss(run);
 const needed=Math.max(...plan.options.map(o=>o.profiles.length+1));
 const ids=boss?bossArenaIds(run.level):Object.keys(ARENAS);
 const minimum=boss?needed:Math.max(needed,towerArenaMinimum(run.level));
 const fitting=ids.filter(id=>arenaCapacity(id)>=minimum);
 return (fitting.length?fitting:ids.filter(id=>arenaCapacity(id)>=needed))
  .filter(id=>id!==plan.options[0].arenaId);
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
