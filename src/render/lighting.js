import { ctx } from '../game/state.js';
import { clamp } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { attr } from './svg.js';
import { rectHit } from '../systems/collision.js';
import { wrap } from '../utils/math.js';
import { flashlightBrightness, flashlightFootprint, paintFlashlightTexture } from './flashlight.js';

// Render-only rays. AI visibility remains in robot/perception.js.
// Uniform samples keep arcs smooth; rays beside each vertex preserve sharp
// obstacle silhouettes even when a narrow edge falls between regular samples.
export function lightPolygon(origin,heading,angle,radius) {
  const full=angle>=Math.PI*2-1e-8,half=angle/2;
  const angles=[];
  const count=Math.ceil(angle/(Math.PI/90));
  for(let i=0;i<=count;i++)angles.push(-half+angle*i/count);
  for(const polygon of [...ctx.obstacles,ctx.arenaBoundary]) {
    for(const point of polygon.points) {
      const a=wrap(Math.atan2(point.y-origin.y,point.x-origin.x)-heading);
      for(const offset of [-.0001,0,.0001])if(a+offset>=-half&&a+offset<=half)angles.push(a+offset);
    }
  }
  angles.sort((a,b)=>a-b);
  const points=angles.map(a=>{
    const end={x:origin.x+Math.cos(heading+a)*radius,y:origin.y+Math.sin(heading+a)*radius};
    let t=rectHit(origin,end)??1;
    // The arena is convex: stop at its exit plane, rather than its entry.
    for(const n of ctx.arenaPlanes){
      const slope=n.nx*(end.x-origin.x)+n.ny*(end.y-origin.y);
      if(slope>0)t=Math.min(t,Math.max(0,(n.c-n.nx*origin.x-n.ny*origin.y)/slope));
    }
    return `${((end.x-origin.x)*t).toFixed(3)} ${((end.y-origin.y)*t).toFixed(3)}`;
  });
  return (full?'M':'M0 0L')+points.join('L')+'Z';
}

export function paintLighting(robot) {
  const age=ctx.game.time-(robot.lightHitAt??-Infinity);
  const flash=age>=0?1-clamp(age/CONFIG.light.hitFadeSec,0,1):0;
  const hidden=ctx.mode==='tower'&&robot.id!==0;
  const opacity=hidden?0:(robot.spawnVisual?.opacity??1)*CONFIG.light.nearbyIntensity*(1+CONFIG.light.hitBoost*flash);
  attr(robot.pool,'opacity',opacity.toFixed(3));
  attr(robot.nearLight,'opacity',opacity.toFixed(3));
  const center=robot.visiblePoint(robot.api.center);
  const transform=`translate(${center.x} ${center.y})`;
  attr(robot.pool,'transform',transform);
  attr(robot.nearLight,'transform',transform);
  if(robot.vision){
    const enabled=ctx.mode==='tower'&&robot.hasHead();
    const nearby=lightPolygon(center,0,Math.PI*2,CONFIG.light.nearbyRadiusCm);
    attr(robot.pool,'d',nearby);attr(robot.nearLight,'d',nearby);
    const eye=robot.visiblePoint(robot.local(robot.headFrame,25,0));
    const heading=robot.headFrame.angle+robot.visualRotation(),angle=robot.visionAngle();
    const beam=enabled?lightPolygon(eye,heading,angle,CONFIG.vision.rangeCm):'';
    // For textured light, cast all around the complete image rectangle. The PNG
    // supplies the soft sides and tip; only obstacles/perimeter cut hard shadows.
    const texturedBeam=enabled&&robot.vision.flashlightTexture
      ?lightPolygon(eye,0,Math.PI*2,flashlightFootprint(angle).radius):'';
    for(const node of [robot.vision,robot.lightBeam]){
      paintFlashlightTexture(node,heading,angle);
      attr(node,'d',node.flashlightTexture?texturedBeam:beam);
      attr(node,'transform',`translate(${eye.x} ${eye.y})`);
      // Most illumination comes from revealing the real floor, rather than
      // painting a pale veil over it. Screen adds only a restrained warm tint.
      const strength=node.flashlightTexture ? (node===robot.lightBeam ? .12 : 1.6) : 1;
      attr(node,'opacity',enabled?clamp(opacity*strength*flashlightBrightness(ctx.game.time),0,1).toFixed(3):'0');
    }
  }
}
