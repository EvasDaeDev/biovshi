import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { el } from './svg.js';

export function applyTextures() {
  for (const [key, targets] of [
    ['arenaFloor', [ctx.arenaContent.querySelector(':scope > rect')]],
    ['obstacle', [...ctx.blockG.children]],
  ]) {
    const url = assetUrl(ASSETS.textures[key]);
    if (!url) continue;
    const id = 'texture-' + key;
    ctx.svg.querySelector('#' + id)?.remove();
    const pattern = el('pattern', { id, patternUnits:'userSpaceOnUse', width:100, height:100 }, ctx.defs);
    el('image', { href:url, width:100, height:100, preserveAspectRatio:'xMidYMid slice' }, pattern);
    for (const node of targets) if (node) node.style.fill = 'url(#' + id + ')';
  }
}
