import {validStats,normalizeProsthetics} from '../garage/model.js';
import {validBossEncounter} from '../boss/encounter.js';
import {validTowerFloorPlan} from './floors.js';
import {validTowerMutationState} from './mutations.js';
import {validTowerSegmentInventory} from './segments.js';
import {towerCycleWins} from './cycles.js';
import {validTowerSurgeries,validTowerSurgicalStock} from './surgery.js';
import {normalizeTowerGraftProsthetics} from './anatomy.js';
import {validTowerDonorState} from './donors.js';
import {validTowerRerolls} from './economy.js';
export const INSURANCE_START_PRICE=300;
export const newInsurance=()=>({price:INSURANCE_START_PRICE,checkpoint:null});
export const insuranceCost=policy=>policy.checkpoint?Math.ceil(policy.price/5):policy.price;
export function validInsurance(policy,record){
 if(!policy||!Number.isSafeInteger(policy.price)||policy.price<INSURANCE_START_PRICE)return false;
 const c=policy.checkpoint;if(c===null)return true;
 return c&&Number.isSafeInteger(c.level)&&c.level>=1&&c.level<=record+1&&c.wins===c.level-1
  &&Number.isInteger(c.patient)&&c.patient>=0&&c.patient<4&&validStats(c.stats,towerCycleWins(c.level))
  &&Array.isArray(c.prosthetics)&&JSON.stringify(c.prosthetics)===JSON.stringify(normalizeProsthetics(c.prosthetics))
  &&validBossEncounter(c.bossEncounter,c.level)&&validTowerFloorPlan(c.floorPlan,c.level)
  &&validTowerMutationState({level:c.level,mutations:c.mutations??[],mutationDraft:c.mutationDraft,
   ...(c.mutationInventory?{mutationInventory:c.mutationInventory,equippedMutations:c.equippedMutations,
   nextMutationId:c.nextMutationId,modInstallations:c.modInstallations}:{})})
  &&(c.statChanges===undefined||Number.isSafeInteger(c.statChanges)&&c.statChanges>=0)
  &&validTowerSegmentInventory({...c,segmentInventory:c.segmentInventory??[],equippedSegments:c.equippedSegments??[],nextSegmentId:c.nextSegmentId??1})
  &&validTowerSurgeries(c.surgeries??[],c.level)&&validTowerSurgicalStock({...c,surgeries:c.surgeries??[],surgicalStock:c.surgicalStock??[],consumedDonorIds:c.consumedDonorIds??[]})
  &&validTowerRerolls({...c,arenaRerolls:c.arenaRerolls??0})
  &&(c.arenaRerollLocked===undefined||typeof c.arenaRerollLocked==='boolean')
  &&validTowerDonorState({...c,donorTissues:c.donorTissues??[],surgeries:c.surgeries??[]})
  &&(c.graftProsthetics===undefined||Array.isArray(c.graftProsthetics)
   &&JSON.stringify(c.graftProsthetics)===JSON.stringify(normalizeTowerGraftProsthetics(c.graftProsthetics,c)));
}
export function purchaseInsurance(session,player,tower){
 const policy=tower.insurance,buyer=session.players[player];
 const renewal=Boolean(policy.checkpoint);
 if(renewal&&tower.level<=policy.checkpoint.level)throw Error('ДМС уже действует на этом или более высоком этаже.');
 const price=insuranceCost(policy);
 if(!buyer||buyer.balance<price)throw Error('Недостаточно монет для ДМС.');
 policy.checkpoint={level:tower.level,wins:tower.wins,patient:tower.patient,stats:[...tower.stats],prosthetics:[...tower.prosthetics],
  mutations:[...(tower.mutations??[])],mutationInventory:structuredClone(tower.mutationInventory??[]),
  equippedMutations:[...(tower.equippedMutations??[])],nextMutationId:tower.nextMutationId??1,
  modInstallations:tower.modInstallations??0,
  segmentInventory:structuredClone(tower.segmentInventory??[]),
  equippedSegments:[...(tower.equippedSegments??[])],nextSegmentId:tower.nextSegmentId??1,
  statChanges:tower.statChanges??0,
  surgeries:structuredClone(tower.surgeries??[]),
  surgicalStock:structuredClone(tower.surgicalStock??[]),nextSurgicalStockId:tower.nextSurgicalStockId??1,
  consumedDonorIds:[...(tower.consumedDonorIds??[])],
  graftProsthetics:[...(tower.graftProsthetics??[])],
  donorTissues:structuredClone(tower.donorTissues??[]),arenaRerolls:tower.arenaRerolls??0,arenaRerollLocked:tower.arenaRerollLocked??false,
  ...(tower.mutationDraft?{mutationDraft:structuredClone(tower.mutationDraft)}:{}),
  ...(tower.bossEncounter?{bossEncounter:structuredClone(tower.bossEncounter)}:{}),
  ...(tower.floorPlan?{floorPlan:structuredClone(tower.floorPlan)}:{})};
 buyer.balance-=price;session.insuranceSpent=(session.insuranceSpent??0)+price;
 if(renewal)policy.price+=Math.ceil(policy.price/10);
 return price;
}
