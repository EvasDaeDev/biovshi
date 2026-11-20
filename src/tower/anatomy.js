// F3: derive a combat-ready patient rig from permanent surgical grafts.
// This is deliberately the same body specification consumed by ordinary robots
// and boss spawn preflight, not a separate surgery-only physics model.
import {standardLimbs,bodySegments,bodyParents} from '../robot/body.js';
import {bossSkinParts} from '../boss/skin.js';
import {donorLengthScale,donorMassScale} from './donors.js';

export const TOWER_ANATOMY_GRAFTS=Object.freeze(['graft_arm','graft_leg','extend_spine','lengthen_arm','lengthen_leg','transplant_arm','transplant_leg']);
export function towerPatientAnatomy(run){
 const operations=(run?.surgeries??[]).filter(op=>TOWER_ANATOMY_GRAFTS.includes(op?.procedure));
 if(!operations.length)return null;
 const spineSegments=4+operations.filter(op=>op.procedure==='extend_spine').length;
 const limbs=standardLimbs();
 const added=new Set();
 for(const operation of operations){
  if(operation.procedure==='lengthen_arm'||operation.procedure==='lengthen_leg'){
   const spec=limbs.find(l=>l.key===operation.site.slice(0,-6));
   if(spec)spec.lengthScale=1.2;
   continue;
  }
  if(operation.procedure==='extend_spine')continue;
  const kind=operation.procedure.endsWith('arm')?'arm':'leg';
  const match=/^(arm|leg)-(-?1)-upper$/.exec(operation.site??'');
  if(!match||match[1]!==kind)continue;
  const side=Number(match[2]),key=`${kind}-${side}-graft`;
  if(added.has(key))continue;
  added.add(key);
  limbs.push({kind,side,key,anchor:kind==='arm'?1:Math.max(2,spineSegments-2),
   lengthScale:operation.donorProfile?donorLengthScale(operation.donorProfile,kind):1,
   massScale:operation.donorProfile?donorMassScale(operation.donorProfile):1});
 }
 const anatomy={spineSegments,limbs,pelvisKey:`spine-${spineSegments-1}`};
 const massExcess=limbs.reduce((sum,limb)=>sum+(limb.massScale??1)-1,0);
 const skinParts=bossSkinParts(anatomy);
 for(const limb of limbs){
  if(!limb.massScale||limb.massScale===1)continue;
  for(const half of ['upper','lower']){
   const key=`${limb.key}-${half}`,part=skinParts[key];
   skinParts[key]={...part,widthScale:(part.widthScale??1)*limb.massScale};
  }
 }
 return {...anatomy,segments:bodySegments(spineSegments,limbs),
  parent:bodyParents(spineSegments,limbs),skinParts,
  speedFactor:1/(1+massExcess*.12),turnFactor:1/(1+massExcess*.18)};
}

export function towerGraftSegments(run){
 const body=towerPatientAnatomy(run);
 return body?.segments.filter(key=>/-graft-(upper|lower)$/.test(key))??[];
}
export function normalizeTowerGraftProsthetics(parts,run){
 return towerGraftSegments(run).filter(key=>Array.isArray(parts)&&parts.includes(key));
}
export function recoverTowerGrafts(run,robot){
 if(!robot?.hasHead)return;
 run.graftProsthetics=normalizeTowerGraftProsthetics(
  [...(run.graftProsthetics??[]),...(robot.missingSegments??[])],run);
}
