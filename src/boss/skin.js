import {ROBOT_PARTS} from '../render/robot-skin.js';
import {limbKey} from '../robot/body.js';
export function bossSkinParts(anatomy){
 const parts={};
 for(const l of anatomy.limbs)for(const half of ['upper','lower'])parts[`${limbKey(l)}-${half}`]=ROBOT_PARTS[`${l.kind}-${l.side}-${half}`];
 for(let i=anatomy.spineSegments-1;i>=0;i--)parts[`spine-${i}`]=ROBOT_PARTS[i===0?'spine-0':i===anatomy.spineSegments-1?'spine-3':`spine-${1+(i-1)%2}`];
 parts.head=ROBOT_PARTS.head;return parts;
}
