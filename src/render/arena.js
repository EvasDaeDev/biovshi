import { CONFIG } from '../config.js';
import { ctx } from "../game/state.js";
import { el } from "./svg.js";
import { ASSETS, assetUrl } from '../assets/manifest.js';

export function drawFloorDecals() {
  ctx.arenaContent.querySelector('#tag7hop-floor-decals')?.remove();
  const url = assetUrl(ASSETS.textures.floorDecals);
  if (!url || ctx.textureAssets?.floorDecals?.loaded===false) return;
  // One original image over the entire floor: no tiling, tint or collision data.
  // The arena-content clip also trims the chamfered corners of this layer.
  const image = el('image', {
    id:'tag7hop-floor-decals', href:url, x:ctx.arenaDefinition.left, y:ctx.arenaDefinition.top,
    width:ctx.arenaDefinition.width, height:ctx.arenaDefinition.height,
    preserveAspectRatio:'none', 'pointer-events':'none',
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(image,ctx.grid);
}

export function drawGrid() {
  if (!CONFIG.rendering.coordinateGrid) return;
  const minor = [], major = [];
  const {left,top,width,height}=ctx.arenaDefinition;
  for(let n=0;n<=width/10;n++){
    const x=left+n*10;
    (n%10?minor:major).push(`M${x},${top}V${top+height}`);
  }
  for(let n=0;n<=height/10;n++){
    const y=top+n*10;
    (n%10?minor:major).push(`M${left},${y}H${left+width}`);
  }
  ctx.gridBaseMinor = minor.join(' ');
  ctx.gridBaseMajor = major.join(' ');
  ctx.gridMinorNode = el('path', {
    class: 'minor',
    d: ctx.gridBaseMinor
  }, ctx.grid);
  ctx.gridMajorNode = el('path', {
    class: 'major',
    d: ctx.gridBaseMajor
  }, ctx.grid);
  for(let m=1;m<=Math.floor(width/100);m++){
    const end=m===Math.floor(width/100);
    el('text',{x:end?left+width-10:left+m*100+4,y:end?top+30:top+16,
      'text-anchor':end?'end':'start'},ctx.grid).textContent=m+' м';
  }
  for(let m=1;m<=Math.floor(height/100);m++){
    const end=m===Math.floor(height/100);
    el('text',{x:end?left+30:left+4,y:end?top+height-10:top+m*100-5},ctx.grid).textContent=m+' м';
  }
}
