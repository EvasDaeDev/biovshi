import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { CONFIG } from '../config.js';
import { attr, el } from './svg.js';

// Cosmetic, deterministic variation: never consumes combat RNG or wall time.
export function flashlightBrightness(time) {
  return 1+.025*Math.sin(time*7.3)+.015*Math.sin(time*11.1+.8)+.01*Math.sin(time*2.7+2);
}

// The artwork is square at the original 100-degree overview. Keep its natural
// proportions there; only stretch across the beam when the overview changes.
export function flashlightFootprint(angle,range=CONFIG.vision.rangeCm) {
  const height=range*Math.tan(Math.min(Math.max(angle,.001),Math.PI-.01)/2)/Math.tan(50*Math.PI/180);
  return {width:range,height,radius:Math.hypot(range,height/2)+.01};
}

export function createFlashlightTexture(node,key) {
  if(!ctx.textureAssets?.flashlight?.loaded)return;
  const url=assetUrl(ASSETS.textures.flashlight),id=`tag7hop-flashlight-${key}`;
  const pattern=el('pattern',{id,patternUnits:'userSpaceOnUse',x:0,y:-1,width:1,height:2},ctx.lightGradients);
  const image=el('image',{href:url,x:0,y:0,width:1,height:2,preserveAspectRatio:'none',
    // SVG darkness uses black luminance; Pixi erases using the same PNG alpha.
    ...(key==='vision'?{style:'filter:brightness(0)'}:{})},pattern);
  // A pattern repeats by definition. Limit SVG to ONE rotated image tile so a
  // shadow-only, surrounding mask cannot repeat the beam behind the patient's head.
  const clip=el('clipPath',{id:id+'-bounds',clipPathUnits:'userSpaceOnUse'},ctx.lightGradients);
  const bounds=el('rect',{x:0,y:-1,width:1,height:2},clip);
  node.flashlightTexture={pattern,image,bounds};
  attr(node,'data-light-fallback',node.getAttribute('fill'));
  attr(node,'data-light-texture',url);
  attr(node,'fill',`url(#${id})`);
  attr(node,'clip-path',`url(#${id}-bounds)`);
  if(key==='lightBeam'){
    attr(node,'style','mix-blend-mode:screen');
    attr(node,'data-light-blend','screen');
  }
}

export function paintFlashlightTexture(node,heading,angle) {
  if(!node.flashlightTexture)return;
  const {width,height}=flashlightFootprint(angle);
  const rotation=heading*180/Math.PI;
  attr(node,'data-light-heading',rotation);
  attr(node,'data-light-width',width);attr(node,'data-light-height',height);
  const {pattern,image,bounds}=node.flashlightTexture;
  attr(pattern,'patternTransform',`rotate(${rotation})`);
  attr(bounds,'transform',`rotate(${rotation})`);
  // Pattern content starts at the tile's own origin. Offsetting the image too
  // would shift it twice and wrap half of the artwork to the opposite side.
  for(const target of [pattern,bounds]){
    attr(target,'y',-height/2);attr(target,'width',width);attr(target,'height',height);
  }
  attr(image,'width',width);attr(image,'height',height);
}
