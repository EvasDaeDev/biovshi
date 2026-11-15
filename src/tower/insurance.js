import {validStats,normalizeProsthetics} from '../garage/model.js';
import {validBossEncounter} from '../boss/encounter.js';
export const newInsurance=()=>({price:50,checkpoint:null});
export function validInsurance(policy,record){
 if(!policy||!Number.isSafeInteger(policy.price)||policy.price<50)return false;
 const c=policy.checkpoint;if(c===null)return true;
 return c&&Number.isSafeInteger(c.level)&&c.level>=1&&c.level<=record+1&&c.wins===c.level-1
  &&Number.isInteger(c.patient)&&c.patient>=0&&c.patient<4&&validStats(c.stats,c.wins)
  &&Array.isArray(c.prosthetics)&&JSON.stringify(c.prosthetics)===JSON.stringify(normalizeProsthetics(c.prosthetics))
  &&validBossEncounter(c.bossEncounter,c.level);
}
export function purchaseInsurance(session,player,tower){
 const policy=tower.insurance,buyer=session.players[player];
 if(policy.checkpoint)throw Error('ДМС уже действует.');
 if(!buyer||buyer.balance<policy.price)throw Error('Недостаточно монет для ДМС.');
 const price=policy.price;
 policy.checkpoint={level:tower.level,wins:tower.wins,patient:tower.patient,stats:[...tower.stats],prosthetics:[...tower.prosthetics],
  ...(tower.bossEncounter?{bossEncounter:structuredClone(tower.bossEncounter)}:{})};
 buyer.balance-=price;session.insuranceSpent=(session.insuranceSpent??0)+price;
 policy.price=price+Math.ceil(price/10);
 return price;
}
