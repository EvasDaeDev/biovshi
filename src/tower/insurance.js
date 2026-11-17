import {validStats,normalizeProsthetics} from '../garage/model.js';
import {validBossEncounter} from '../boss/encounter.js';
import {validTowerFloorPlan} from './floors.js';
import {validTowerMutationState} from './mutations.js';
import {validTowerSurgeries} from './surgery.js';
import {normalizeTowerGraftProsthetics} from './anatomy.js';
import {validTowerDonorState} from './donors.js';
export const newInsurance=()=>({price:50,checkpoint:null});
export function validInsurance(policy,record){
 if(!policy||!Number.isSafeInteger(policy.price)||policy.price<50)return false;
 const c=policy.checkpoint;if(c===null)return true;
 return c&&Number.isSafeInteger(c.level)&&c.level>=1&&c.level<=record+1&&c.wins===c.level-1
  &&Number.isInteger(c.patient)&&c.patient>=0&&c.patient<4&&validStats(c.stats,c.wins)
  &&Array.isArray(c.prosthetics)&&JSON.stringify(c.prosthetics)===JSON.stringify(normalizeProsthetics(c.prosthetics))
  &&validBossEncounter(c.bossEncounter,c.level)&&validTowerFloorPlan(c.floorPlan,c.level)
  &&validTowerMutationState({level:c.level,mutations:c.mutations??[],mutationDraft:c.mutationDraft})
  &&validTowerSurgeries(c.surgeries??[],c.level)
  &&validTowerDonorState({...c,donorTissues:c.donorTissues??[],surgeries:c.surgeries??[]})
  &&(c.graftProsthetics===undefined||Array.isArray(c.graftProsthetics)
   &&JSON.stringify(c.graftProsthetics)===JSON.stringify(normalizeTowerGraftProsthetics(c.graftProsthetics,c)));
}
export function purchaseInsurance(session,player,tower){
 const policy=tower.insurance,buyer=session.players[player];
 const renewal=Boolean(policy.checkpoint);
 if(renewal&&tower.level<=policy.checkpoint.level)throw Error('ДМС уже действует на этом или более высоком этаже.');
 if(!buyer||buyer.balance<policy.price)throw Error('Недостаточно монет для ДМС.');
 const price=policy.price;
 policy.checkpoint={level:tower.level,wins:tower.wins,patient:tower.patient,stats:[...tower.stats],prosthetics:[...tower.prosthetics],
  mutations:[...(tower.mutations??[])],
  surgeries:structuredClone(tower.surgeries??[]),
  graftProsthetics:[...(tower.graftProsthetics??[])],
  donorTissues:structuredClone(tower.donorTissues??[]),
  ...(tower.mutationDraft?{mutationDraft:structuredClone(tower.mutationDraft)}:{}),
  ...(tower.bossEncounter?{bossEncounter:structuredClone(tower.bossEncounter)}:{}),
  ...(tower.floorPlan?{floorPlan:structuredClone(tower.floorPlan)}:{})};
 buyer.balance-=price;session.insuranceSpent=(session.insuranceSpent??0)+price;
 policy.price=price+Math.ceil(price*(renewal?3:10)/100);
 return price;
}
