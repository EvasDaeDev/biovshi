import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { CONFIG } from '../config.js';
import { attr, el } from './svg.js';

// Cosmetic, deterministic variation: never consumes combat RNG or wall time.
export function flashlightBrightness(time) {
  return 1+.015*Math.sin(time*7.3)+.008*Math.sin(time*11.1+.8)+.004*Math.sin(time*2.7+2);
}

export function createFlashlightTexture(node,key) {
  if(!ctx.textureAssets?.flashlight?.loaded)return;
  const url=assetUrl(ASSETS.textures.flashlight),id=`tag7hop-flashlight-${key}`;
  const pattern=el('pattern',{id,patternUnits:'userSpaceOnUse',x:0,y:-1,width:1,height:2},ctx.lightGradients);
  const image=el('image',{href:url,x:0,y:-1,width:1,height:2,preserveAspectRatio:'none',
    // SVG darkness uses black luminance; Pixi erases using the same PNG alpha.
    ...(key==='vision'?{style:'filter:brightness(0)'}:{})},pattern);
  node.flashlightTexture={pattern,image};
  attr(node,'data-light-fallback',node.getAttribute('fill'));
  attr(node,'data-light-texture',url);
  attr(node,'fill',`url(#${id})`);
}

export function paintFlashlightTexture(node,heading,angle) {
  if(!node.flashlightTexture)return;
  const width=CONFIG.vision.rangeCm,height=2*width*Math.tan(Math.min(angle,Math.PI-.01)/2);
  const rotation=heading*180/Math.PI;
  attr(node,'data-light-heading',rotation);
  attr(node,'data-light-width',width);attr(node,'data-light-height',height);
  const {pattern,image}=node.flashlightTexture;
  attr(pattern,'patternTransform',`rotate(${rotation})`);
  for(const target of [pattern,image]){
    attr(target,'y',-height/2);attr(target,'width',width);attr(target,'height',height);
  }
}
