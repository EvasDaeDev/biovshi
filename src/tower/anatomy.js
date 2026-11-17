// F3: derive a combat-ready patient rig from permanent surgical grafts.
// This is deliberately the same body specification consumed by ordinary robots
// and boss spawn preflight, not a separate surgery-only physics model.
import {standardLimbs,bodySegments,bodyParents} from '../robot/body.js';
import {bossSkinParts} from '../boss/skin.js';

export const TOWER_ANATOMY_GRAFTS=Object.freeze(['graft_arm','graft_leg','extend_spine']);
export function towerPatientAnatomy(run){
 const operations=(run?.surgeries??[]).filter(op=>TOWER_ANATOMY_GRAFTS.includes(op?.procedure));
 if(!operations.length)return null;
 const spineSegments=4+operations.filter(op=>op.procedure==='extend_spine').length;
 const limbs=standardLimbs();
 const added=new Set();
 for(const operation of operations){
  if(operation.procedure==='extend_spine')continue;
  const kind=operation.procedure==='graft_arm'?'arm':'leg';
  const match=/^(arm|leg)-(-?1)-upper$/.exec(operation.site??'');
  if(!match||match[1]!==kind)continue;
  const side=Number(match[2]),key=`${kind}-${side}-graft`;
  if(added.has(key))continue;
  added.add(key);
  limbs.push({kind,side,key,anchor:kind==='arm'?1:Math.max(2,spineSegments-2)});
 }
 const anatomy={spineSegments,limbs,pelvisKey:`spine-${spineSegments-1}`};
 return {...anatomy,segments:bodySegments(spineSegments,limbs),
  parent:bodyParents(spineSegments,limbs),skinParts:bossSkinParts(anatomy)};
}
