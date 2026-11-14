import {ctx} from '../game/state.js';
import {CONFIG} from '../config.js';
import {BOSS_CONFIG} from './config.js';
import {ik,segmentDistance} from '../utils/math.js';
import {staticContacts,isLimb} from '../systems/surface-contact.js';
// Validate the full neutral rig before creating any live DOM or physics state.
function neutralCapsules(start,body){
 const scale=CONFIG.robot.scale*BOSS_CONFIG.scale,c=Math.cos(start.angle),s=Math.sin(start.angle);
 const world=(x,y)=>({x:start.x+(x*c-y*s)*scale,y:start.y+(x*s+y*c)*scale});
 const capsules=[],push=(a,b,r,segment)=>capsules.push({a,b,r:r*scale,segment});
 const stride=CONFIG.robot.vertebraBaseCm,end=body.spineSegments*stride;
 for(let i=0;i<body.spineSegments;i++)push(world(-i*stride,0),world(-(i+1)*stride,0),17,`spine-${i}`);
 push(world(0,0),world(0,0),19,'spine-0');push(world(-end,0),world(-end,0),24,body.pelvisKey);
 push(world(25,0),world(25,0),13,'head');push(world(39,0),world(39,0),2.5,'head');
 for(const l of body.limbs){
  const index=l.anchor??(l.kind==='arm'?0:body.spineSegments),x=-index*stride;
  const a=world(x+(l.kind==='arm'?3:-5),l.side*(l.kind==='arm'?15:12));
  const tip=world(x+(l.kind==='arm'?30:-28),l.side*(l.anchor!==undefined?(l.kind==='arm'?35:40):(l.kind==='arm'?27:31)));
  const lengths=l.kind==='arm'?[27,29]:[32,33],pose=ik(a,tip,lengths[0]*scale,lengths[1]*scale,l.kind==='arm'?l.side:-l.side);
  push(a,pose.joint,l.kind==='arm'?4.8:6.8,l.key+'-upper');push(pose.joint,pose.end,l.kind==='arm'?3.8:4.8,l.key+'-lower');push(pose.end,pose.end,l.kind==='arm'?4.8:5.8,l.key+'-lower');
 }
 return capsules;
}
export function bossSpawn(start,body){
 const boundary=ctx.arenaBoundary,cx=(boundary.left+boundary.right)/2,cy=(boundary.top+boundary.bottom)/2;
 const valid=p=>{
  const capsules=neutralCapsules(p,body);
  if(capsules.some(c=>staticContacts(c).some(hit=>hit.depth>(isLimb(c)?5:0)+1e-6)))return false;
  const solid=c=>c.segment==='head'||c.segment.startsWith('spine-');
  return !capsules.filter(solid).some(c=>ctx.robots.some(r=>r.capsules.filter(solid).some(other=>segmentDistance(c.a,c.b,other.a,other.b)<c.r+other.r+.15)));
 };
 if(valid(start))return start;
 for(let radius=8;radius<=160;radius+=8)for(let i=0;i<24;i++){
  const p={x:start.x+Math.cos(i*Math.PI/12)*radius,y:start.y+Math.sin(i*Math.PI/12)*radius};p.angle=Math.atan2(cy-p.y,cx-p.x);
  if(valid(p))return p;
 }
 throw Error('Не удалось разместить босса без пересечения арены');
}
