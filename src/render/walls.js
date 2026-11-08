import { CONFIG } from '../config.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { el } from './svg.js';
import { wallRibbon, triangleMatrix } from './wall-geometry.js';

const outline=points=>points.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ')+' Z';

function createWallPattern(key, length, width) {
  const url=assetUrl(ASSETS.textures[key]);
  if (!url || ctx.textureAssets?.[key]?.loaded===false) return false;
  const pattern=el('pattern',{
    id:'texture-'+key,patternUnits:'userSpaceOnUse',width:length,height:width,x:0,y:0,
  },ctx.defs);
  el('image',{
    href:url,x:0,y:0,width:length,height:width,preserveAspectRatio:'none',
    opacity:CONFIG.rendering.wallTintStrength>0?0:1,
    ...(key==='obstacle'?{transform:`rotate(180 ${length/2} ${width/2})`}:{}),
    style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':'',
  },pattern);
  return true;
}

function drawRibbon(ribbon, key, group) {
  for (const face of ribbon.faces) for (const indices of [[0,1,2],[0,2,3]]) {
    const uv=indices.map(i=>face.uv[i]),world=indices.map(i=>face.world[i]);
    el('path',{
      d:outline(uv),transform:'matrix('+triangleMatrix(uv,world).join(' ')+')',
      fill:'url(#texture-'+key+')','shape-rendering':'crispEdges',
    },group);
  }
}

export function createWalls() {
  ctx.svg.querySelector('#tag7hop-walls')?.remove();
  ctx.svg.querySelector('#texture-arenaWall')?.remove();
  ctx.svg.querySelector('#tag7hop-obstacle-walls')?.remove();
  ctx.svg.querySelector('#texture-obstacle')?.remove();
  const {wallThicknessCm:width,wallTileLengthCm:length}=CONFIG.arena;
  if (!(width>0)) return;
  const ribbon=wallRibbon(ctx.arenaBoundary.points,width);
  const group=el('g',{id:'tag7hop-walls','pointer-events':'none','aria-label':'Внешняя стена арены'},ctx.svg);
  // This sibling is outside the floor clip and never participates in collisions.
  ctx.svg.insertBefore(group,ctx.arenaContent);
  el('path',{
    d:outline(ribbon.outer)+' '+outline([...ribbon.inner].reverse()),
    'fill-rule':'evenodd',fill:CONFIG.rendering.wallTintColor,
  },group);
  if (createWallPattern('arenaWall',length,width)) drawRibbon(ribbon,'arenaWall',group);
  el('path',{d:outline(ribbon.outer),fill:'none',stroke:'#352d26','stroke-width':.7},group);
  // The image bottom stays on the collision boundary; the ribbon goes INTO the
  // solid obstacle, preserving the playable floor and following every corner.
  if (createWallPattern('obstacle',length,width)) {
    const obstacles=el('g',{
      id:'tag7hop-obstacle-walls','pointer-events':'none','aria-label':'Стены препятствий',
    },ctx.blockG);
    for (const obstacle of ctx.obstacles) {
      const wall=el('g',{},obstacles);
      drawRibbon(wallRibbon(obstacle.points,width,{inward:true}),'obstacle',wall);
    }
  }
}
