import {COIN_SCALE,MAX_ISSUED_COINS} from '../betting/coins.js';
// Tower-only paid operations on concrete anatomical sites. The effect is
// disabled if the operated segment is severed during combat, and returns
// if patientRecovery repairs the part after a successful floor.
import {PROSTHETIC_SEGMENTS} from '../garage/model.js';
import {towerAvailableDonors,validTowerDonors} from './donors.js';
import {normalizeTowerGraftProsthetics} from './anatomy.js';

export const TOWER_SURGERY_MIN_LEVEL=11;
export const TOWER_SURGERY_MAX=3;
export const TOWER_SURGERY_OPERATIONS=Object.freeze({
 brace:Object.freeze({name:'Скоба',description:'Укрепление позвоночника: сила +0,35 · манёвр +0,1',
  site:'spine',bonus:[0,.35,.1]}),
 alignment:Object.freeze({name:'Ось',description:'Коррекция позвоночника: скорость +0,25 · манёвр +0,2',
  site:'spine',bonus:[.25,0,.2]}),
 drive:Object.freeze({name:'Привод',description:'Перенастройка ноги: скорость +0,4 · манёвр +0,1',
  site:'leg',bonus:[.4,0,.1]}),
 impact:Object.freeze({name:'Боек',description:'Усиление руки: сила +0,45',
  site:'arm',bonus:[0,.45,0]}),
 reflex:Object.freeze({name:'Рефлекс',description:'Нервная петля руки: манёвр +0,35 · сила +0,1',
  site:'arm',bonus:[0,.1,.35]}),
 graft_arm:Object.freeze({name:'Пересадка руки',description:'Дополнительная рука на выбранной стороне тела',site:'arm',bonus:[0,0,0],requiresUpper:true}),
 graft_leg:Object.freeze({name:'Пересадка ноги',description:'Дополнительная опорная нога на выбранной стороне тела',site:'leg',bonus:[0,0,0],requiresUpper:true}),
 extend_spine:Object.freeze({name:'Удлинение корпуса',description:'Дополнительный сегмент позвоночника с реальной геометрией',site:'spine',bonus:[0,0,0]}),
 lengthen_arm:Object.freeze({name:'Удлинение руки',description:'Увеличить плечо и предплечье на 20%: реальная досягаемость',site:'arm',bonus:[0,0,0],requiresUpper:true}),
 lengthen_leg:Object.freeze({name:'Удлинение ноги',description:'Увеличить бедро и голень на 20%: реальная длина опоры',site:'leg',bonus:[0,0,0],requiresUpper:true}),
 transplant_arm:Object.freeze({name:'Донорская рука',description:'Пересадить руку поверженного пациента',site:'arm',bonus:[0,0,0],requiresUpper:true,donor:true}),
 transplant_leg:Object.freeze({name:'Донорская нога',description:'Пересадить ногу поверженного пациента',site:'leg',bonus:[0,0,0],requiresUpper:true,donor:true})
});
export const TOWER_SURGERY_IDS=Object.freeze(Object.keys(TOWER_SURGERY_OPERATIONS));
const stockIdPattern=/^s[1-9]\d*$/;
const stockSerial=id=>stockIdPattern.test(id??'')?Number(id.slice(1)):0;
// Existing experimental saves held only {procedure,fromSite} stock items.
// Assign a stable identity on migration, preserving all existing valid IDs.
export function normalizeTowerSurgicalStock(run){
 if(!run||typeof run!=='object'||Array.isArray(run))return run;
 run.surgicalStock??=[];
 run.consumedDonorIds??=(run.surgeries??[]).map(op=>op.donorId).filter(Boolean);
 if(!Array.isArray(run.surgicalStock))return run;
 const ids=[...run.surgicalStock.map(x=>x?.id),...(run.surgeries??[]).map(x=>x?.stockId)];
 let serial=Math.max(0,...ids.map(stockSerial));
 if(run.nextSurgicalStockId===undefined)run.nextSurgicalStockId=serial+1;
 for(const item of run.surgicalStock){
  if(item&&typeof item==='object'&&item.id===undefined){
   serial=Math.max(serial,run.nextSurgicalStockId-1)+1;
   item.id='s'+serial;
   run.nextSurgicalStockId=serial+1;
  }
 }
 return run;
}
const siteKind=site=>typeof site==='string'&&site.startsWith('spine-')?'spine':
 typeof site==='string'&&site.startsWith('arm-')?'arm':
 typeof site==='string'&&site.startsWith('leg-')?'leg':null;
// Interim economic pricing; modelled independently of the betting wallet.
export const towerSurgeryPrice=run=>[60,100,150][Math.min(2,run?.surgeries?.length??0)]*COIN_SCALE;
export const towerSurgeryReplacePrice=run=>Math.max(60,Math.ceil(towerSurgeryPrice(run)/COIN_SCALE*.85))*COIN_SCALE;
// Surgical slots first open after defeating the second boss (floor 10).
// Subsequent slots open after floors 15 and 20; never more than three.
export const towerSurgeryCapacity=level=>Math.min(TOWER_SURGERY_MAX,
 Math.max(0,Math.floor((level-6)/5)));
export function validTowerSurgeries(surgeries,level){
 // Pre-existing experimental saves could have surgery after floors 5/10/15.
 // Keep those paid procedures valid while preventing NEW early operations.
 const legacyCapacity=Math.min(TOWER_SURGERY_MAX,Math.max(0,Math.floor((level-1)/5)));
 if(!Array.isArray(surgeries)||surgeries.length>Math.max(towerSurgeryCapacity(level),legacyCapacity))return false;
 const sites=new Set(),donors=new Set();
 for(const item of surgeries){
  if(!item||typeof item!=='object'||Array.isArray(item)
    ||!Object.hasOwn(TOWER_SURGERY_OPERATIONS,item.procedure)
    ||!PROSTHETIC_SEGMENTS.includes(item.site)
    ||siteKind(item.site)!==TOWER_SURGERY_OPERATIONS[item.procedure].site
    ||(TOWER_SURGERY_OPERATIONS[item.procedure].requiresUpper&&!item.site.endsWith('-upper'))
    ||sites.has(item.site)
    ||(item.stockId!==undefined&&(TOWER_SURGERY_OPERATIONS[item.procedure].donor||!stockIdPattern.test(item.stockId)))
    ||(TOWER_SURGERY_OPERATIONS[item.procedure].donor&&
      (typeof item.donorId!=='string'||!/^\d+:[1-9]\d*:(arm|leg)$/.test(item.donorId)
       ||!item.donorId.endsWith(':'+TOWER_SURGERY_OPERATIONS[item.procedure].site)
       ||typeof item.donorProfile!=='string'||!['basic','fast','strong','agile','elite','boss'].includes(item.donorProfile)))
    ||(!TOWER_SURGERY_OPERATIONS[item.procedure].donor&&(item.donorId!==undefined||item.donorProfile!==undefined)))return false;
  if(item.donorId&&donors.has(item.donorId))return false;
  if(item.donorId)donors.add(item.donorId);
  sites.add(item.site);
 }
 return true;
}
export function towerSurgeryBonus(surgeries=[],robot=null){
 const total=[0,0,0];
 const missing=new Set(robot?.missingSegments??[]);
 const active=robot?.hasHead!==false;
 for(const item of surgeries){
  const procedure=TOWER_SURGERY_OPERATIONS[item?.procedure];
  if(!procedure||!active||missing.has(item.site)||!PROSTHETIC_SEGMENTS.includes(item.site)
    ||siteKind(item.site)!==procedure.site)continue;
  procedure.bonus.forEach((bonus,i)=>total[i]+=bonus);
 }
 return total.map(n=>Math.round(n*100)/100);
}
export function towerSurgeryAvailableSites(run,procedure,replaceSite=null){
 const operation=TOWER_SURGERY_OPERATIONS[procedure];
 if(!operation)return [];
 const installed=new Set(run?.surgeries?.map(s=>s.site));
 return PROSTHETIC_SEGMENTS.filter(site=>siteKind(site)===operation.site
  &&(!operation.requiresUpper||site.endsWith('-upper'))&&(!installed.has(site)||site===replaceSite));
}
export function purchaseTowerSurgery(session,player,run,procedure,site,donorId=null,replaceSite=null,stockId=null){
 const operation=TOWER_SURGERY_OPERATIONS[procedure];
 if(!operation||!run?.preparing||run.level<TOWER_SURGERY_MIN_LEVEL||run.mutationDraft||run.rewarded?.length
   ||!validTowerSurgeries(run.surgeries,run.level)||!validTowerDonors(run.donorTissues??[])
   ||!validTowerSurgicalStock(run)
   ||(run.surgeries.length>=towerSurgeryCapacity(run.level)&&replaceSite===null)
   ||(replaceSite!==null&&!run.surgeries.some(item=>item.site===replaceSite))
   ||!towerSurgeryAvailableSites(run,procedure,replaceSite).includes(site))
  throw Error('Операция недоступна на этом этаже или для выбранного сегмента.');
 const stored=stockId===null?null:run.surgicalStock.find(item=>item.id===stockId);
 if(stockId!==null&&(!stored||stored.procedure!==procedure||operation.donor))
  throw Error('Имплант со склада недоступен или не подходит для выбранной операции.');
 const donor=operation.donor?towerAvailableDonors(run,procedure).find(item=>item.id===donorId):null;
 if(operation.donor&&!donor)throw Error('Для пересадки требуется подходящий донор, полученный в бою.');
 const old=replaceSite!==null?run.surgeries.find(item=>item.site===replaceSite):null;
 const buyer=session.players?.[player],price=old?towerSurgeryReplacePrice(run):towerSurgeryPrice(run);
 if(!buyer||buyer.balance<price)throw Error('Недостаточно монет для операции.');
 const spent=session.surgerySpent??0;
 if(!Number.isSafeInteger(spent)||spent+price>MAX_ISSUED_COINS)throw Error('Недопустимая стоимость операции.');
 if(old){
  run.surgeries=run.surgeries.filter(item=>item!==old);
  if(!TOWER_SURGERY_OPERATIONS[old.procedure].donor){
   const id=old.stockId??'s'+run.nextSurgicalStockId++;
   run.surgicalStock.push({id,procedure:old.procedure,fromSite:old.site});
  }
  // Old donor grafts are permanently consumed; never create donor inventory.
 }
 if(stored)run.surgicalStock=run.surgicalStock.filter(item=>item.id!==stockId);
 run.surgeries.push({site,procedure,...(stored?{stockId:stored.id}:{}),
  ...(donor?{donorId:donor.id,donorProfile:donor.profile}:{})});
 run.graftProsthetics=normalizeTowerGraftProsthetics(run.graftProsthetics??[],run);
 if(donor){run.consumedDonorIds??=[];run.consumedDonorIds.push(donor.id);}
 if(donor)run.donorTissues=run.donorTissues.filter(item=>item.id!==donor.id);
 buyer.balance-=price;
 session.surgerySpent=spent+price;
 return price;
}
export function validTowerSurgicalStock(run){
 if(!Array.isArray(run?.surgicalStock)||!Array.isArray(run.surgeries))return false;
 const ids=new Set();let maxId=0;
 for(const item of run.surgicalStock){
  const op=TOWER_SURGERY_OPERATIONS[item?.procedure];
  if(!op||op.donor||!stockIdPattern.test(item.id)||ids.has(item.id)
    ||!PROSTHETIC_SEGMENTS.includes(item.fromSite)||siteKind(item.fromSite)!==op.site
    ||(op.requiresUpper&&!item.fromSite.endsWith('-upper')))return false;
  ids.add(item.id);maxId=Math.max(maxId,stockSerial(item.id));
 }
 for(const op of run.surgeries){
  if(op.stockId===undefined)continue;
  if(!stockIdPattern.test(op.stockId)||ids.has(op.stockId)
    ||TOWER_SURGERY_OPERATIONS[op.procedure]?.donor)return false;
  ids.add(op.stockId);maxId=Math.max(maxId,stockSerial(op.stockId));
 }
 return Number.isSafeInteger(run.nextSurgicalStockId)&&run.nextSurgicalStockId>maxId
  &&run.nextSurgicalStockId<=16000000
  &&Array.isArray(run.consumedDonorIds)
  &&new Set(run.consumedDonorIds).size===run.consumedDonorIds.length
  &&run.consumedDonorIds.every(id=>typeof id==='string'&&/^\d+:[1-9]\d*:(arm|leg)$/.test(id));
}
export function towerSurgerySiteLabel(site){
 if(site.startsWith('spine-'))return 'Позвонок '+site.slice(6);
 const graft=/^(arm|leg)-(-?1)-graft-(upper|lower)$/.exec(site);
 if(graft)return 'Доп. '+(graft[1]==='arm'?'рука':'нога')+' '+(graft[2]==='1'?'справа':'слева')+
  ' · '+(graft[3]==='upper'?'верхний':'нижний')+' сегмент';
 const [,part,side,segment]=/^(arm|leg)-(-?1)-(upper|lower)$/.exec(site)??[];
 if(!part)return site;
 return (part==='arm'?'Рука':'Нога')+' '+(side==='1'?'справа':'слева')+
  ' · '+(segment==='upper'?'верхний':'нижний')+' сегмент';
}
