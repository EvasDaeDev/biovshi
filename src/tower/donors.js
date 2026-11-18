// F3 donor tissues from personally credited Tower kills.
const PROFILES=new Set(['basic','fast','strong','agile','elite','boss']);
const KINDS=new Set(['arm','leg']);
export function validTowerDonors(items){
 if(!Array.isArray(items)||items.length>24)return false;
 const used=new Set();
 for(const item of items){
  if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'
   ||!(/^[1-9]\d*:[1-9]\d*:(arm|leg)$/).test(item.id)
   ||!KINDS.has(item.kind)||!PROFILES.has(item.profile)
   ||!item.id.endsWith(':'+item.kind)||used.has(item.id))return false;
  used.add(item.id);
 }
 return true;
}
export function validTowerDonorState(run){
 if(!validTowerDonors(run?.donorTissues))return false;
 if(!Number.isSafeInteger(run?.level)||run.level<1)return false;
 const spent=new Set([...(run.consumedDonorIds??[]),...(run.surgeries??[]).map(s=>s?.donorId).filter(Boolean)]);
 const sourceValid=id=>{
  const match=/^([1-9]\d*):([1-9]\d*):(arm|leg)$/.exec(id);
  return match&&Number(match[1])<=run.level;
 };
 return run.donorTissues.every(item=>sourceValid(item.id)&&!spent.has(item.id))
  &&(run.surgeries??[]).every(item=>!item?.donorId||sourceValid(item.donorId));
}
export function awardTowerDonors(run,victim,profile){
 if(!Number.isSafeInteger(run?.level)||!Number.isSafeInteger(victim)||victim<1)return;
 if(!PROFILES.has(profile))profile='basic';
 const available=Array.isArray(run.donorTissues)?run.donorTissues:[];
 for(const kind of ['arm','leg']){
  const id=`${run.level}:${victim}:${kind}`;
  if(!(run.consumedDonorIds??[]).includes(id)&&!available.some(item=>item.id===id))available.push({id,kind,profile});
 }
 run.donorTissues=available.slice(-24);
}
export function towerAvailableDonors(run,procedure){
 const kind=procedure==='transplant_arm'?'arm':procedure==='transplant_leg'?'leg':null;
 return kind?(run?.donorTissues??[]).filter(item=>item.kind===kind&&!(run.consumedDonorIds??[]).includes(item.id)):[];
}
export function donorLengthScale(profile,kind){
 if(profile==='boss')return 1.25;
 if(profile==='fast'&&kind==='leg')return 1.15;
 if(profile==='strong'&&kind==='arm')return 1.10;
 return 1;
}
export function donorMassScale(profile){
 if(profile==='boss')return 1.35;
 if(profile==='strong')return 1.2;
 return 1;
}
