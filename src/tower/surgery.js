// Tower-only paid operations on concrete anatomical sites. The effect is
// disabled if the operated segment is severed during combat, and returns
// if patientRecovery repairs the part after a successful floor.
import {PROSTHETIC_SEGMENTS} from '../garage/model.js';

export const TOWER_SURGERY_MIN_LEVEL=6;
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
  site:'arm',bonus:[0,.1,.35]})
});
export const TOWER_SURGERY_IDS=Object.freeze(Object.keys(TOWER_SURGERY_OPERATIONS));
const siteKind=site=>typeof site==='string'&&site.startsWith('spine-')?'spine':
 typeof site==='string'&&site.startsWith('arm-')?'arm':
 typeof site==='string'&&site.startsWith('leg-')?'leg':null;
export const towerSurgeryPrice=run=>30+15*(run?.surgeries?.length??0);
export const towerSurgeryCapacity=level=>Math.min(TOWER_SURGERY_MAX,
 Math.max(0,Math.floor((level-1)/5)));
export function validTowerSurgeries(surgeries,level){
 if(!Array.isArray(surgeries)||surgeries.length>towerSurgeryCapacity(level))return false;
 const sites=new Set();
 for(const item of surgeries){
  if(!item||typeof item!=='object'||Array.isArray(item)
    ||!Object.hasOwn(TOWER_SURGERY_OPERATIONS,item.procedure)
    ||!PROSTHETIC_SEGMENTS.includes(item.site)
    ||siteKind(item.site)!==TOWER_SURGERY_OPERATIONS[item.procedure].site
    ||sites.has(item.site))return false;
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
export function towerSurgeryAvailableSites(run,procedure){
 const operation=TOWER_SURGERY_OPERATIONS[procedure];
 if(!operation)return [];
 const installed=new Set(run?.surgeries?.map(s=>s.site));
 return PROSTHETIC_SEGMENTS.filter(site=>siteKind(site)===operation.site&&!installed.has(site));
}
export function purchaseTowerSurgery(session,player,run,procedure,site){
 const operation=TOWER_SURGERY_OPERATIONS[procedure];
 if(!operation||!run?.preparing||run.mutationDraft||run.rewarded?.length
   ||!validTowerSurgeries(run.surgeries,run.level)
   ||run.surgeries.length>=towerSurgeryCapacity(run.level)
   ||!towerSurgeryAvailableSites(run,procedure).includes(site))
  throw Error('Операция недоступна на этом этаже или для выбранного сегмента.');
 const buyer=session.players?.[player],price=towerSurgeryPrice(run);
 if(!buyer||buyer.balance<price)throw Error('Недостаточно монет для операции.');
 const spent=session.surgerySpent??0;
 if(!Number.isSafeInteger(spent)||spent+price>16000000)throw Error('Недопустимая стоимость операции.');
 run.surgeries.push({site,procedure});
 buyer.balance-=price;
 session.surgerySpent=spent+price;
 return price;
}
export function towerSurgerySiteLabel(site){
 if(site.startsWith('spine-'))return 'Позвонок '+site.slice(6);
 const [part,side,segment]=site.split('-');
 return (part==='arm'?'Рука':'Нога')+' '+(side==='1'?'справа':'слева')+
  ' · '+(segment==='upper'?'верхний':'нижний')+' сегмент';
}
