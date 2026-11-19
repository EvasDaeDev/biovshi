// Segment-based Tower mutation inventory (new economy, independent of old whole-kit UI).
// Each object is one owned item. Equipped parts are at risk on uninsured death.
import {TOWER_MUTATION_IDS,TOWER_MUTATIONS,towerMutationRarity} from './mutations.js';
import {TOWER_UPGRADE_PARTS,towerUpgradeApplies} from './upgrade-appearance.js';

export const TOWER_SEGMENT_INSTALL_PRICE=75;
export const TOWER_SEGMENT_SELL_BASE=50;
export const towerSegmentSellPrice=rarity=>Math.round(TOWER_SEGMENT_SELL_BASE*(1+.12*rarity));
const standardSites=Object.freeze(['head',...Array.from({length:4},(_,i)=>'spine-'+i),
 ...[-1,1].flatMap(side=>['arm','leg'].flatMap(kind=>['upper','lower'].map(part=>kind+'-'+side+'-'+part)))]);
export const towerSegmentSites=type=>standardSites.filter(site=>towerUpgradeApplies(type,site));
export function normalizeTowerSegmentInventory(run){
 run.segmentInventory??=[];
 run.equippedSegments??=[];
 run.nextSegmentId??=1;
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
export function awardTowerSegments(run,clearedFloor,random=Math.random){
 normalizeTowerSegmentInventory(run);
 const count=random()<.5?1:2;
 const issued=[];
 for(let i=0;i<count;i++){
  const type=TOWER_MUTATION_IDS[Math.min(TOWER_MUTATION_IDS.length-1,Math.floor(random()*TOWER_MUTATION_IDS.length))];
  const sites=towerSegmentSites(type);
  const site=sites[Math.min(sites.length-1,Math.floor(random()*sites.length))];
  const item={id:'seg'+run.nextSegmentId++,type,site,rarity:towerMutationRarity(clearedFloor)};
  run.segmentInventory.push(item);issued.push(item);
 }
 run.lastBossSegments=issued.map(item=>item.id);
 return issued;
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
export function equipTowerSegment(session,player,run,id){
 normalizeTowerSegmentInventory(run);
 const item=run.segmentInventory.find(x=>x.id===id);
 if(!run.preparing||!item||run.equippedSegments.includes(id))throw Error('Сегмент недоступен для установки.');
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
 if(!buyer||buyer.balance+price>16000000)throw Error('Невозможно начислить монеты.');
 run.segmentInventory=run.segmentInventory.filter(x=>x.id!==id);
 buyer.balance+=price;
 return price;
}
export function validTowerSegmentInventory(run){
 if(!Array.isArray(run.segmentInventory)||!Array.isArray(run.equippedSegments)
  ||!Number.isSafeInteger(run.nextSegmentId)||run.nextSegmentId<1)return false;
 const ids=new Set(),sites=new Set();
 for(const item of run.segmentInventory){
  if(!item||!/^seg[1-9]\d*$/.test(item.id)||ids.has(item.id)
   ||!TOWER_MUTATION_IDS.includes(item.type)||!towerUpgradeApplies(item.type,item.site)
   ||!Number.isInteger(item.rarity)||item.rarity<0||item.rarity>5
   ||Number(item.id.slice(3))>=run.nextSegmentId)return false;
  ids.add(item.id);
 }
 for(const id of run.equippedSegments){
  if(!ids.has(id))return false;
  const site=run.segmentInventory.find(x=>x.id===id).site;
  if(sites.has(site))return false;
  sites.add(site);
 }
 return new Set(run.equippedSegments).size===run.equippedSegments.length;
}
