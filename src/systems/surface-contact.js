import {obstacleVertices} from '../game/arena.js';
import {ctx} from '../game/state.js';
import {clamp,segmentDistance} from '../utils/math.js';
const cache=new WeakMap();
function projection(points,n){let min=Infinity,max=-Infinity;for(const p of points){const q=p.x*n.x+p.y*n.y;min=Math.min(min,q);max=Math.max(max,q);}return {min,max};}
function polygonData(box){
 let data=cache.get(box);if(data)return data;
 const points=box.points??obstacleVertices(box),axes=points.map((a,i)=>{const b=points[(i+1)%points.length],len=Math.hypot(b.x-a.x,b.y-a.y);const n={x:(b.y-a.y)/len,y:(a.x-b.x)/len};return {n,...projection(points,n)};});
 data={axes,points,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))};cache.set(box,data);return data;
}
// Minimum translation for a thick segment against a convex obstacle.
export function capsulePolygonContact(c,box){
 const data=polygonData(box),{a,b,r}=c;
 if(Math.max(a.x,b.x)+r<data.left||Math.min(a.x,b.x)-r>data.right||Math.max(a.y,b.y)+r<data.top||Math.min(a.y,b.y)-r>data.bottom)return null;
 const dx=b.x-a.x,dy=b.y-a.y,len2=dx*dx+dy*dy;
 let best=null;
 const overlap=({n,min,max})=>{
  const A=a.x*n.x+a.y*n.y,B=b.x*n.x+b.y*n.y,low=Math.min(A,B)-r,high=Math.max(A,B)+r;
  if(high<=min||low>=max)return false;
  const negative=high-min,positive=max-low,depth=Math.min(negative,positive),sign=negative<positive?-1:1;
  if(!best||depth<best.depth)best={depth,nx:n.x*sign,ny:n.y*sign};
  return true;
 };
 // Most candidates are clear on an existing polygon axis. Reject them before
 // calculating the capsule-specific axes (especially on the 64-sided arena).
 for(const axis of data.axes)if(!overlap(axis))return null;
 if(len2>1e-12){const n={x:-dy/Math.sqrt(len2),y:dx/Math.sqrt(len2)};if(!overlap({n,...projection(data.points,n)}))return null;}
 let nearest=null,distance=Infinity;
 for(const vertex of data.points){const t=len2?clamp(((vertex.x-a.x)*dx+(vertex.y-a.y)*dy)/len2,0,1):0;const x=a.x+dx*t-vertex.x,y=a.y+dy*t-vertex.y,d=x*x+y*y;if(d<distance){distance=d;nearest={x,y};}}
 if(distance>1e-12){const n={x:nearest.x/Math.sqrt(distance),y:nearest.y/Math.sqrt(distance)};if(!overlap({n,...projection(data.points,n)}))return null;}
 return best;
}
export function staticContacts(c){
 const hits=[];
 for(const p of ctx.arenaPlanes){const length=p.length??Math.hypot(p.nx,p.ny),depth=(Math.max(p.nx*c.a.x+p.ny*c.a.y,p.nx*c.b.x+p.ny*c.b.y)-p.c)/length+c.r;
  if(depth>1e-7)hits.push({depth,nx:-p.nx/length,ny:-p.ny/length});}
 for(const box of ctx.obstacles){const hit=capsulePolygonContact(c,box);if(hit)hits.push(hit);}
 return hits;
}
export const isLimb=c=>/^(arm|leg)-/.test(c.segment??'');
export function limbCapsuleClear(a,b,r,tolerance){return staticContacts({a,b,r}).every(hit=>hit.depth<=tolerance+1e-6);}
// Move all world-space supports too. Navigation goals and attack aims stay in the world.
export function translateWholePose(state,dx,dy){
 const points=new Set([state.chest,state.pelvis,state.headFrame,...(state.spine??[]),...(state.tail??[])]);
 for(const l of state.allLimbs())for(const p of [l.foot,l.from,l.to,l.renderEnd])if(p)points.add(p);
 if(state.recoverySwing)for(const p of [state.recoverySwing.from,state.recoverySwing.to])if(p)points.add(p);
 for(const p of points)if(p){p.x+=dx;p.y+=dy;}state.x+=dx;state.y+=dy;
}
const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
function measure(state,tolerance,skipClearPeers=false){
 const caps=state.makeCapsules(),contacts=[];let cost=0,peerCost=0;
 for(const c of caps)for(const hit of staticContacts(c)){
  const allow=isLimb(c)?tolerance:0,excess=hit.depth-allow;
  if(excess>1e-6){contacts.push({...hit,excess});cost+=excess*excess*(isLimb(c)?1:10);}
 }
 if(!skipClearPeers||contacts.length)for(const other of state.peerRobots())for(const a of caps.filter(solid))for(const b of other.capsules.filter(solid)){
  const depth=a.r+b.r+.15-segmentDistance(a.a,a.b,b.a,b.b);if(depth>0)peerCost+=depth*depth*10;
 }
 return {cost:cost+peerCost,staticCost:cost,peerCost,contacts};
}
export function resolveSurfaceContacts(state,{tolerance=5,release=1,maxStep=8,maxTotal=16,iterations=6}={}){
 let totalX=0,totalY=0,travel=0,current=measure(state,tolerance,true);const normals=[],initialPeerCost=current.peerCost;
 if(!current.contacts.length)return false;
 for(let i=0;i<iterations&&current.contacts.length;i++){
  let best=null;
  for(const hit of current.contacts.sort((a,b)=>b.excess-a.excess).slice(0,8)){
   const amount=Math.min(hit.excess+release,maxStep,maxTotal-travel);if(amount<=0)continue;
   const dx=hit.nx*amount,dy=hit.ny*amount;translateWholePose(state,dx,dy);const next=measure(state,tolerance);translateWholePose(state,-dx,-dy);
   if(next.cost<current.cost-1e-7&&(!best||next.cost<best.next.cost))best={dx,dy,amount,next,hit};
  }
  if(!best)break;
  translateWholePose(state,best.dx,best.dy);totalX+=best.dx;totalY+=best.dy;travel+=best.amount;current=best.next;normals.push(best.hit);
 }
 if(current.staticCost>1e-6||current.peerCost>initialPeerCost+1e-6){translateWholePose(state,-totalX,-totalY);return false;}
 for(const {nx,ny} of normals){const inward=(state.vx??0)*nx+(state.vy??0)*ny;if(inward<0){state.vx-=inward*nx;state.vy-=inward*ny;}}
 return travel>0;
}
