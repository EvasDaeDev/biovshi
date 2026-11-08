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
    id:'tag7hop-floor-decals', href:url, x:0, y:0, width:700, height:700,
    preserveAspectRatio:'none', 'pointer-events':'none',
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(image,ctx.grid);
}

export function drawGrid() {
  if (!CONFIG.rendering.coordinateGrid) return;
  const minor = [],
    major = [];
  for (let n = 0; n <= 70; n++) {
    const p = n * 10;
    (n % 10 ? minor : major).push(`M${p},0V700 M0,${p}H700`);
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
  for (let m = 1; m <= 7; m++) {
    el('text', {
      x: m === 7 ? 690 : m * 100 + 4,
      y: m === 7 ? 30 : 16,
      'text-anchor': m === 7 ? 'end' : 'start'
    }, ctx.grid).textContent = m + ' м';
    el('text', {
      x: m === 7 ? 30 : 4,
      y: m === 7 ? 690 : m * 100 - 5
    }, ctx.grid).textContent = m + ' м';
  }
}
