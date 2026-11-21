import {arenaRaster} from '../game/arena-dimensions.js';
import { clamp } from '../utils/math.js';
import { ctx } from "../game/state.js";
import { attr } from "./svg.js";

// Isotropic projection: rectangular viewports add space around the square
// camera rather than stretching the arena or changing collision coordinates.
export function fittedCamera(width, height, x, y, size) {
  const scale = Math.min(width, height) / size;
  return {
    scale,
    x: (width - size * scale) / 2 - x * scale,
    y: (height - size * scale) / 2 - y * scale
  };
}

export function cameraBounds(size, outset = 8) {
  return { min: -outset, max: 700 + outset - size };
}

export function cameraReset() {
  // Preserve the true arena centre when the maximum view is narrower than
  // the full floor-plus-walls extent.
  const arena=arenaRaster(ctx.arenaDefinition);
  ctx.camera.size=ctx.CAMERA_FULL;
  ctx.camera.x=arena.left+(arena.size-ctx.CAMERA_FULL)/2;
  ctx.camera.y=arena.top+(arena.size-ctx.CAMERA_FULL)/2;
  cameraApply();
}

export function cameraApply() {
  const size = clamp(
    ctx.camera.size,
    ctx.CAMERA_MIN,
    ctx.CAMERA_FULL
  );

  // Camera position is no longer clamped to arena bounds.
  const x = ctx.camera.x;
  const y = ctx.camera.y;

  attr(
    ctx.svg,
    'viewBox',
    `${x.toFixed(3)} ${y.toFixed(3)} ${size.toFixed(3)} ${size.toFixed(3)}`
  );

  // The clock is a screen-space HUD: it must not leave the visible area on zoom.
  // Counter / markers remain anchored to their real arena coordinates.
  attr(ctx.timerOutput, 'x', (x + size / 2).toFixed(3));
  attr(ctx.timerOutput, 'y', (y + size * 38 / ctx.CAMERA_FULL).toFixed(3));

  attr(
    ctx.timerOutput,
    'transform',
    `translate(${(x + size / 2).toFixed(3)} ${(y + size * 38 / ctx.CAMERA_FULL).toFixed(3)}) scale(${(size / ctx.CAMERA_FULL).toFixed(5)}) translate(${(-(x + size / 2)).toFixed(3)} ${(-(y + size * 38 / ctx.CAMERA_FULL)).toFixed(3)})`
  );
}

export function cameraTargetBounds(robots, silhouetteMargin=42) {
  let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
  for(const r of robots) {
    if(!Number.isFinite(r.x)||!Number.isFinite(r.y))continue;
    left=Math.min(left,r.x-silhouetteMargin);
    right=Math.max(right,r.x+silhouetteMargin);
    top=Math.min(top,r.y-silhouetteMargin);
    bottom=Math.max(bottom,r.y+silhouetteMargin);
  }
  return {left,right,top,bottom};
}

// Tower starts wide, then centres on the player. Nearby opponents share the
// normal framing calculation with padding proportional to the closer view.
const towerFollowFraction = .5;

export function cameraUpdate(dt) {
  if (
    ctx.startup.phase !== 'running' ||
    ctx.paused ||
    document.hidden ||
    ctx.combat.finished
  ) return;

  const tower=ctx.mode==='tower';
  // A stalled render frame must not consume the entire follow transition.
  if(tower)dt=Math.min(dt,1/20);

  const active = ctx.robots.filter(r => r.visible && r.mobile);
  const player=tower?ctx.robots.find(r=>r.id===0&&r.visible&&Number.isFinite(r.x)&&Number.isFinite(r.y)):null;
  if(!active.length&&!player)return;

  const width=ctx.fieldWidth||ctx.fieldSide||700,height=ctx.fieldHeight||ctx.fieldSide||700,short=Math.min(width,height);
  const followSize=Math.max(ctx.CAMERA_MIN,ctx.CAMERA_FULL*towerFollowFraction);
  // Fade opponents in over the edge of the framing window so an entering or
  // departing fighter cannot abruptly change the zoom target.
  const nearby=player?active.flatMap(r=>{
    if(r===player||!Number.isFinite(r.x)||!Number.isFinite(r.y))return [];
    const edge=Math.max(Math.abs(r.x-player.x)*2*short/(followSize*width),
      Math.abs(r.y-player.y)*2*short/(followSize*height));
    const influence=clamp((1-edge)/.2,0,1);
    return influence>0?[{robot:r,influence}]:[];
  }):[];
  const framed=player?[player,...nearby.map(({robot,influence})=>({
    x:player.x+(robot.x-player.x)*influence,
    y:player.y+(robot.y-player.y)*influence
  }))]:active;

  // Body positions keep head turns, attacks and limb motion from changing framing.
  const {left,right,top,bottom}=cameraTargetBounds(framed);
  if(!Number.isFinite(left))return;
  const padding=player?towerFollowFraction:1;
  const fit=Math.max((right-left+400*padding)*short/width,(bottom-top+200*padding)*short/height);
  const targetSize=player
    ?followSize+(clamp(fit,ctx.CAMERA_MIN,followSize)-followSize)*Math.max(0,...nearby.map(({influence})=>influence))
    :clamp(fit,ctx.CAMERA_MIN,ctx.CAMERA_FULL);
  const cx=player?.x??(left+right)/2,cy=player?.y??(top+bottom)/2;

  // Spectator mode zooms out faster to keep escaping fighters visible.
  const zoomTau = tower ? .85 : targetSize > ctx.camera.size ? .28 : .95;
  const previousSize=ctx.camera.size;
  const sizeBlend = 1 - Math.exp(-dt / zoomTau);

  ctx.camera.size +=
    (targetSize - ctx.camera.size) * sizeBlend;

  if (Math.abs(ctx.camera.size - targetSize) < .08) {
    ctx.camera.size = targetSize;
  }

  // Follow the chosen centre without arena boundary restrictions.
  if(tower){
    const centerX=ctx.camera.x+previousSize/2,centerY=ctx.camera.y+previousSize/2;
    const blend=1-Math.exp(-dt/.55);
    const dx=(cx-centerX)*blend,dy=(cy-centerY)*blend;
    const limit=ctx.camera.size*.7*dt;
    const fraction=Math.min(1,limit/(Math.hypot(dx,dy)||1));
    ctx.camera.x=centerX+dx*fraction-ctx.camera.size/2;
    ctx.camera.y=centerY+dy*fraction-ctx.camera.size/2;
    cameraApply();
    return;
  }

  const moveX = cx - ctx.camera.size / 2;
  const moveY = cy - ctx.camera.size / 2;

  const moveBlend = 1 - Math.exp(-dt / .47);

  ctx.camera.x += (moveX - ctx.camera.x) * moveBlend;
  ctx.camera.y += (moveY - ctx.camera.y) * moveBlend;

  cameraApply();
}
