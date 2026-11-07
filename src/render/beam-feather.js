import { path, wrap } from '../utils/math.js';

// Reuse already traced rays for nested cones: no extra obstacle intersection work.
export function featheredBeamPaths(origin,heading,outline,fov,count,feather) {
  return Array.from({length:count},(_,i)=>{
    const limit=fov/2*(1-feather*i/Math.max(1,count-1));
    const points=i===0?outline:outline.filter(p=>
      Math.abs(wrap(Math.atan2(p.y-origin.y,p.x-origin.x)-heading))<=limit+1e-8);
    return points.length>1?path([origin,...points])+' Z':'';
  });
}
