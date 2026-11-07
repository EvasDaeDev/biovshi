import { CONFIG } from '../config.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { el } from './svg.js';
import { wallRibbon, triangleMatrix } from './wall-geometry.js';

const outline=points=>points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ')+' Z';

export function createWalls() {
  ctx.svg.querySelector('#tag7hop-walls')?.remove();
  ctx.svg.querySelector('#texture-arenaWall')?.remove();
  const {wallThicknessCm:width,wallTileLengthCm:length}=CONFIG.arena;
  if (!(width>0)) return;
  const ribbon=wallRibbon(ctx.arenaBoundary.points,width);
  const group=el('g',{id:'tag7hop-walls','pointer-events':'none','aria-label':'Внешняя стена арены'},ctx.svg);
  // This sibling is outside the floor clip and never participates in collisions.
  ctx.svg.insertBefore(group,ctx.arenaContent);
  el('path',{
    d:outline(ribbon.outer)+' '+outline([...ribbon.inner].reverse()),
    'fill-rule':'evenodd',fill:'#303b37',
  },group);
  const url=assetUrl(ASSETS.textures.arenaWall);
  if (!url) return;
  const pattern=el('pattern',{
    id:'texture-arenaWall',patternUnits:'userSpaceOnUse',width:length,height:width,x:0,y:0,
  },ctx.defs);
  el('image',{
    href:url,x:0,y:0,width:length,height:width,preserveAspectRatio:'none',
    style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':'',
  },pattern);
  for (const face of ribbon.faces) for (const indices of [[0,1,2],[0,2,3]]) {
    const uv=indices.map(i=>face.uv[i]),world=indices.map(i=>face.world[i]);
    el('path',{
      d:outline(uv),transform:'matrix('+triangleMatrix(uv,world).join(' ')+')',
      fill:'url(#texture-arenaWall)','shape-rendering':'crispEdges',
    },group);
  }
  el('path',{d:outline(ribbon.outer),fill:'none',stroke:'#26352f','stroke-width':.7},group);
}
