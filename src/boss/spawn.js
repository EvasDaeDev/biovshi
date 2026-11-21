import {limbRig,PATIENT_HEAD_OFFSET} from '../robot/body.js';
import {ctx} from '../game/state.js';
import {CONFIG} from '../config.js';
import {BOSS_CONFIG} from './config.js';
import {ik,segmentDistance} from '../utils/math.js';
import {staticContacts,isLimb} from '../systems/surface-contact.js';
// Validate the full neutral rig before creating any live DOM or physics state.
function neutralCapsules(start,body,scaleMultiplier){
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
// Search uses only already known arena geometry and is deterministic: re-entering
// the same encounter cannot change the boss's shape or create a new RNG dependency.
// Pure selector: the caller supplies collision testing for the complete neutral rig.
export function findBossSpawn(start,boundary,valid){
 const right=boundary.right??boundary.left+boundary.size;
 const bottom=boundary.bottom??boundary.top+boundary.size;
 const cx=(boundary.left+right)/2,cy=(boundary.top+bottom)/2;
 const rotations=[0,Math.PI/4,-Math.PI/4,Math.PI/2,-Math.PI/2,Math.PI];
 const tried=new Set();
 function probe(x,y){
  if(x<boundary.left||x>right||y<boundary.top||y>bottom)return null;
  const key=Math.round(x*10)+':'+Math.round(y*10);
  if(tried.has(key))return null;
  tried.add(key);
  const heading=Math.atan2(cy-y,cx-x);
  for(const offset of rotations){
   const p={x,y,angle:heading+offset};
   if(valid(p))return p;
  }
  return null;
 }
 if(valid(start))return start;
 // First look close to the intended spawn, retaining the original placement.
 for(let radius=16;radius<=160;radius+=16){
  for(let i=0;i<24;i++){
   const a=i*Math.PI/12;
   const candidate=probe(start.x+Math.cos(a)*radius,start.y+Math.sin(a)*radius);
   if(candidate)return candidate;
  }
 }
 // Long bodies can need an entirely different region of a large arena.
 // Search the full bounding box; the collision predicate rejects cut corners,
 // columns and other inaccessible floor.
 const step=40,points=[];
 for(let y=boundary.top+20;y<=bottom-20;y+=step){
  for(let x=boundary.left+20;x<=right-20;x+=step){
   points.push({x,y,d:(x-start.x)**2+(y-start.y)**2});
  }
 }
 points.sort((a,b)=>a.d-b.d);
 for(const p of points){
  const candidate=probe(p.x,p.y);
  if(candidate)return candidate;
 }
 return null;
}
const solid=c=>c.segment==='head'||c.segment.startsWith('spine-');
function neutralRigClear(capsules,peerSolids){
 if(capsules.some(c=>staticContacts(c).some(hit=>hit.depth>(isLimb(c)?5:0)+1e-6)))return false;
 return !capsules.filter(solid).some(c=>peerSolids.some(other=>
  segmentDistance(c.a,c.b,other.a,other.b)<c.r+other.r+.15));
}

// Plan the ENTIRE encounter before constructing any robots or DOM elements.
// Largest anatomy gets the first choice of space; return points in original
// robot-ID order to keep identity, skins, rewards, and AI indices unchanged.
export function planNeutralRigSpawns(layout,rigs){
 if(layout.length!==rigs.length)return null;
 const boundary=ctx.arenaBoundary;
 const cx=(boundary.left+(boundary.right??boundary.left+boundary.size))/2;
 const cy=(boundary.top+(boundary.bottom??boundary.top+boundary.size))/2;
 // Greedy placement can fail solely because equally sized patients were
 // reserved in an unfortunate order. Retry a few deterministic orders before
 // declaring the chosen arena impossible. No RNG or persistent state changes.
 for(let attempt=0;attempt<3;attempt++){
  const points=new Array(layout.length),occupied=[];
  const order=layout.map((_,id)=>id).sort((a,b)=>{
   const difference=rigs[b].body.spineSegments*rigs[b].scaleMultiplier-
    rigs[a].body.spineSegments*rigs[a].scaleMultiplier;
   if(difference)return difference;
   if(attempt===1)return b-a;
   if(attempt===2){
    const da=(layout[a].x-cx)**2+(layout[a].y-cy)**2;
    const db=(layout[b].x-cx)**2+(layout[b].y-cy)**2;
    return db-da||a-b;
   }
   return a-b;
  });
  let complete=true;
  for(const id of order){
   const {body,scaleMultiplier}=rigs[id];
   let selected=null;
   const valid=p=>{
    const capsules=neutralCapsules(p,body,scaleMultiplier);
    if(!neutralRigClear(capsules,occupied))return false;
    selected=capsules;
    return true;
   };
   const start=findBossSpawn(layout[id],boundary,valid);
   if(!start){complete=false;break;}
   points[id]=start;
   occupied.push(...selected.filter(solid));
  }
  if(complete)return points;
 }
 return null;
}
export function bossSpawn(start,body,scaleMultiplier=BOSS_CONFIG.scale){
 const boundary=ctx.arenaBoundary;
 const peers=ctx.robots.flatMap(robot=>robot.capsules.filter(solid));
 const valid=p=>neutralRigClear(neutralCapsules(p,body,scaleMultiplier),peers);
 const located=findBossSpawn(start,boundary,valid);
 if(located)return located;
 throw Error('Не удалось разместить босса без пересечения арены');
}
