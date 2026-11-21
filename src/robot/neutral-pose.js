import {limbRig,PATIENT_HEAD_OFFSET,standardLimbs} from './body.js';
import {CONFIG} from '../config.js';
import {ik} from '../utils/math.js';

export const standardNeutralBody=()=>({spineSegments:4,pelvisKey:'spine-3',limbs:standardLimbs()});
// Validate the full neutral rig before creating any live DOM or physics state.
export function neutralCapsules(start,body=standardNeutralBody(),scaleMultiplier=1){
 const scale=CONFIG.robot.scale*scaleMultiplier,c=Math.cos(start.angle),s=Math.sin(start.angle);
 const world=(x,y)=>({x:start.x+(x*c-y*s)*scale,y:start.y+(x*s+y*c)*scale});
 const capsules=[],push=(a,b,r,segment)=>capsules.push({a,b,r:r*scale,segment});
 const stride=CONFIG.robot.vertebraBaseCm,end=body.spineSegments*stride;
 for(let i=0;i<body.spineSegments;i++)push(world(-i*stride,0),world(-(i+1)*stride,0),17,`spine-${i}`);
 push(world(0,0),world(0,0),19,'spine-0');push(world(-end,0),world(-end,0),24,body.pelvisKey);
 const headSize=body.headSizeFactor??1,head=body.headOffset??PATIENT_HEAD_OFFSET,front=head+14*headSize;
 push(world(head,0),world(head,0),13*headSize,'head');push(world(front,0),world(front,0),2.5*headSize,'head');
 for(const l of body.limbs){
  const index=l.anchor??(l.kind==='arm'?0:body.spineSegments),x=-index*stride;
  const rig=limbRig(body,l);
  const [rootX,rootY]=rig.root,[tipX,tipY]=l.anchor===undefined?rig.rest:rig.graftRest;
  const a=world(x+rootX,l.side*rootY),tip=world(x+tipX,l.side*tipY);
  const factor=scale*(l.lengthScale??1),[upper,lower]=rig.lengths;
  const pose=ik(a,tip,upper*factor,lower*factor,l.kind==='arm'?l.side:-l.side);
  push(a,pose.joint,(l.kind==='arm'?4.8:6.8)*(l.massScale??1),l.key+'-upper');push(pose.joint,pose.end,(l.kind==='arm'?3.8:4.8)*(l.massScale??1),l.key+'-lower');push(pose.end,pose.end,(l.kind==='arm'?4.8:5.8)*(l.massScale??1),l.key+'-lower');
 }
 return capsules;
}
