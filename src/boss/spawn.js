import {neutralCapsules} from '../robot/neutral-pose.js';
import {ctx} from '../game/state.js';
import {BOSS_CONFIG} from './config.js';
import {segmentDistance} from '../utils/math.js';
import {staticContacts,isLimb} from '../systems/surface-contact.js';
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
   const authored=Number(Boolean(layout[b].authored))-Number(Boolean(layout[a].authored));
   if(authored)return authored;
   if(layout[a].authored&&(a===0||b===0))return a-b;
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
