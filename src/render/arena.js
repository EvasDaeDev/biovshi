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
    width:ctx.arenaDefinition.size, height:ctx.arenaDefinition.size,
    preserveAspectRatio:'none', 'pointer-events':'none',
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(image,ctx.grid);
}

export function drawGrid() {
  if (!CONFIG.rendering.coordinateGrid) return;
  const minor = [], major = [];
  const {left,top,size}=ctx.arenaDefinition;
  for(let n=0;n<=size/10;n++){
    const x=left+n*10,y=top+n*10;
    (n%10?minor:major).push(`M${x},${top}V${top+size} M${left},${y}H${left+size}`);
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
  const metres=Math.floor(size/100);
  for(let m=1;m<=metres;m++){
    const end=m===metres;
    el('text',{x:end?left+size-10:left+m*100+4,y:end?top+30:top+16,
      'text-anchor':end?'end':'start'},ctx.grid).textContent=m+' м';
    el('text',{x:end?left+30:left+4,y:end?top+size-10:top+m*100-5},ctx.grid).textContent=m+' м';
  }
}
