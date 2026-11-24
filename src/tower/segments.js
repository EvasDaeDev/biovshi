import {COIN_SCALE,canIssueCoins} from '../betting/coins.js';
// Segment-based Tower mutation inventory (new economy, independent of old whole-kit UI).
// Each object is one owned item. Equipped parts are at risk on uninsured death.
import {TOWER_MUTATION_IDS,TOWER_MUTATIONS,rollTowerBossRarity} from './mutations.js';
import {towerUpgradeApplies} from './upgrade-appearance.js';
import {towerPatientAnatomy} from './anatomy.js';
import {bossRepeatDropChance} from './artifacts.js';

export const TOWER_SECOND_SEGMENT_CHANCE=.35;
export const towerSegmentDropChance=previousWins=>Math.max(.45,bossRepeatDropChance(previousWins));
export const TOWER_SEGMENT_INSTALL_PRICE=75*COIN_SCALE;
export const TOWER_SEGMENT_SELL_BASE=50*COIN_SCALE;
export const towerSegmentSellPrice=rarity=>Math.round(TOWER_SEGMENT_SELL_BASE*(1+.12*rarity));
const standardSites=Object.freeze(['head',...Array.from({length:4},(_,i)=>'spine-'+i),
 ...[-1,1].flatMap(side=>['arm','leg'].flatMap(kind=>['upper','lower'].map(part=>kind+'-'+side+'-'+part)))]);
export const towerSegmentSites=(type,run=null)=>[
 ...standardSites,...(towerPatientAnatomy(run)?.segments??[])
].filter((site,i,all)=>all.indexOf(site)===i&&towerUpgradeApplies(type,site));
export function normalizeTowerSegmentInventory(run){
 run.segmentInventory??=[];
 run.equippedSegments??=[];
 run.nextSegmentId??=1;
 run.unseenSegmentIds??=[];
 return run;
}
export function towerSegmentStacks(run){
 const counts=new Map();
 for(const item of run?.segmentInventory??[]){
  if((run.equippedSegments??[]).includes(item.id))continue;
  const key=[item.type,item.site,item.rarity].join('|');
  const entry=counts.get(key);
  if(entry)entry.count++;
  else counts.set(key,{type:item.type,site:item.site,rarity:item.rarity,count:1,representativeId:item.id});
 }
 return [...counts.values()];
}
export function awardTowerSegments(run,clearedFloor,random=Math.random,dropChance=1,previousBossWins=dropChance<1?1:0){
 normalizeTowerSegmentInventory(run);
 // On repeats the chance to receive a 1-2 segment batch decreases by
 // 30% of its current value, with a 45% floor. The first victory is guaranteed.
 // A missed roll grants no segments and clears the latest reward marker.
 if(dropChance<1&&random()>=dropChance){
  run.lastBossSegments=[];
  return [];
 }
 // After a successful batch roll, the SECOND segment has a 35% chance
 // (down from 50%). The repeat-boss batch chance is independent.
 const count=random()<1-TOWER_SECOND_SEGMENT_CHANCE?1:2;
 const issued=[];
 for(let i=0;i<count;i++){
  const type=TOWER_MUTATION_IDS[Math.min(TOWER_MUTATION_IDS.length-1,Math.floor(random()*TOWER_MUTATION_IDS.length))];
  const sites=towerSegmentSites(type,run);
  const site=sites[Math.min(sites.length-1,Math.floor(random()*sites.length))];
  const item={id:'seg'+run.nextSegmentId++,type,site,rarity:rollTowerBossRarity(clearedFloor,previousBossWins,random)};
  run.segmentInventory.push(item);issued.push(item);
 }
 run.lastBossSegments=issued.map(item=>item.id);
 run.unseenSegmentIds.push(...run.lastBossSegments);
 return issued;
}
// A stack is new while at least one of its identical pieces has not been viewed.
export const towerUnreadSegments=run=>new Set(run?.unseenSegmentIds??[]);
export function markTowerSegmentSeen(run,selected){
 normalizeTowerSegmentInventory(run);
 const seen=new Set(run.segmentInventory.filter(item=>item.type===selected.type&&
   item.site===selected.site&&item.rarity===selected.rarity).map(item=>item.id));
 const before=run.unseenSegmentIds.length;
 run.unseenSegmentIds=run.unseenSegmentIds.filter(id=>!seen.has(id));
 return run.unseenSegmentIds.length!==before;
}
export function towerInstalledSegments(run){
 const equipped=new Set(run?.equippedSegments??[]);
 return (run?.segmentInventory??[]).filter(item=>equipped.has(item.id));
}
export function towerSegmentBonuses(run){
 const result=[0,0,0];let crit=0,cooldown=0;
 for(const item of towerInstalledSegments(run)){
  const modifier=TOWER_MUTATIONS[item.type];
  if(!modifier)continue;
  modifier.bonus.forEach((value,i)=>result[i]+=value);
  crit+=modifier.combat?.crit??0;
  cooldown+=modifier.combat?.cooldown??0;
 }
 return {stats:result.map(n=>Math.round(n*100)/100),crit:Math.min(.1,crit),
  cooldownMultiplier:Math.max(.75,1-cooldown)};
}
export const canInstallTowerSegment=(run,item)=>Boolean(run.preparing&&item&&
 !run.equippedSegments.includes(item.id)&&towerSegmentSites(item.type,run).includes(item.site));
export const canCreditTowerSegmentSale=(session,player,price)=>{
 const buyer=session.players?.[player];
 return Boolean(buyer&&canIssueCoins(session,price));
};
export function equipTowerSegment(session,player,run,id){
 normalizeTowerSegmentInventory(run);
 const item=run.segmentInventory.find(x=>x.id===id);
 if(!canInstallTowerSegment(run,item))throw Error('Сегмент недоступен для установки.');
 const buyer=session.players?.[player];
 if(!buyer||buyer.balance<TOWER_SEGMENT_INSTALL_PRICE)throw Error('Недостаточно монет.');
 const old=towerInstalledSegments(run).find(x=>x.site===item.site);
 if(old)run.equippedSegments=run.equippedSegments.filter(x=>x!==old.id);
 run.equippedSegments.push(id);buyer.balance-=TOWER_SEGMENT_INSTALL_PRICE;
 session.mutationSpent=(session.mutationSpent??0)+TOWER_SEGMENT_INSTALL_PRICE;
 return {price:TOWER_SEGMENT_INSTALL_PRICE,replaced:old??null};
}
export function removeTowerSegment(run,id){
 normalizeTowerSegmentInventory(run);
 if(!run.preparing||!run.equippedSegments.includes(id))return false;
 run.equippedSegments=run.equippedSegments.filter(x=>x!==id);return true;
}
export function sellTowerSegment(session,player,run,id){
 normalizeTowerSegmentInventory(run);
 const item=run.segmentInventory.find(x=>x.id===id);
 if(!run.preparing||!item||run.equippedSegments.includes(id))throw Error('Этот предмет нельзя продать.');
 const price=towerSegmentSellPrice(item.rarity),buyer=session.players?.[player];
 const totalEarned=session.towerEarned??0;
 if(!canCreditTowerSegmentSale(session,player,price))
  throw Error('Невозможно начислить монеты.');
 run.segmentInventory=run.segmentInventory.filter(x=>x.id!==id);
 run.unseenSegmentIds=run.unseenSegmentIds.filter(unseen=>unseen!==id);
 buyer.balance+=price;
 // Count sold parts as credited Tower income to preserve balance-ledger conservation.
 session.towerEarned=totalEarned+price;
 return price;
}
export function validTowerSegmentInventory(run){
 if(!Array.isArray(run.segmentInventory)||!Array.isArray(run.equippedSegments)
  ||!Array.isArray(run.unseenSegmentIds??[])
  ||!Number.isSafeInteger(run.nextSegmentId)||run.nextSegmentId<1)return false;
 const ids=new Set(),sites=new Set();
 for(const item of run.segmentInventory){
  if(!item||!/^seg[1-9]\d*$/.test(item.id)||ids.has(item.id)
   ||!TOWER_MUTATION_IDS.includes(item.type)||!towerUpgradeApplies(item.type,item.site)
   ||!Number.isInteger(item.rarity)||item.rarity<0||item.rarity>5
   ||Number(item.id.slice(3))>=run.nextSegmentId)return false;
  ids.add(item.id);
 }
 if(new Set(run.unseenSegmentIds??[]).size!==(run.unseenSegmentIds??[]).length||
  !(run.unseenSegmentIds??[]).every(id=>ids.has(id)))return false;
 for(const id of run.equippedSegments){
  if(!ids.has(id))return false;
  const site=run.segmentInventory.find(x=>x.id===id).site;
  if(sites.has(site))return false;
  sites.add(site);
 }
 return new Set(run.equippedSegments).size===run.equippedSegments.length;
}
