import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { clamp } from '../utils/math.js';
import { coreClearBone, coreClearCircle } from '../systems/collision.js';

const samples=new WeakMap();
const STILL=Object.freeze({x:0,y:0,settled:true});

// Cosmetic slide only: inactive anatomy never enters the collision solver.
export function createInertia(direction,capsules=[]) {
  const dx=Math.cos(direction)*CONFIG.effects.inertiaDistanceCm;
  const dy=Math.sin(direction)*CONFIG.effects.inertiaDistanceCm;
  const clear=q=>capsules.every(c=>{
    const a={x:c.a.x+dx*q,y:c.a.y+dy*q},b={x:c.b.x+dx*q,y:c.b.y+dy*q};
    return c.a.x===c.b.x&&c.a.y===c.b.y?coreClearCircle(a,c.r):coreClearBone(a,b,c.r);
  });
  const startClear=!capsules.length||clear(0);
  let distance=startClear?1:0;
  if(capsules.length&&startClear){
    let last=0;
    for(const q of [.25,.5,.75,1]){
      if(clear(q)){last=q;continue;}
      let lo=last,hi=q;
      for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid;}
      distance=lo;break;
    }
  }
  return {started:ctx.game.time,duration:CONFIG.effects.inertiaSec,dx:dx*distance,dy:dy*distance};
}
export function inertiaOffset(inertia,time=ctx.game.time) {
  if(!inertia)return STILL;
  const previous=samples.get(inertia);
  if(previous&&(previous.time===time||(previous.offset.settled&&time>=inertia.started+inertia.duration)))return previous.offset;
  const q=clamp((time-inertia.started)/inertia.duration,0,1);
  const ease=1-(1-q)**2;
  const offset={x:inertia.dx*ease,y:inertia.dy*ease,settled:q>=1};
  samples.set(inertia,{time,offset});
  return offset;
}
