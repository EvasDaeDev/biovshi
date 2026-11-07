import { CONFIG } from '../config.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';
import { oilColor } from '../utils/colors.js';

const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
export function liquidVariant(seed,index,owner) {
  const n=(seed??0)+index*137+owner*91;
  return {
    index:Math.floor(hash(n)*CONFIG.oil.spriteColumns*CONFIG.oil.spriteRows),
    angle:hash(n+43)*360,
  };
}

export function createLiquidSprite(owner,x,y,radius) {
  const url=assetUrl(ASSETS.textures.liquids);
  if(!url)return null;
  const variant=liquidVariant(ctx.seed,ctx.combat.oilDrops.length,owner);
  const col=variant.index%CONFIG.oil.spriteColumns,row=Math.floor(variant.index/CONFIG.oil.spriteColumns);
  const node=el('g',{
    'data-liquid-sprite':variant.index,
    transform:`translate(${x} ${y}) rotate(${variant.angle})`,opacity:.92,
  },ctx.oilG);
  const viewport=el('svg',{
    x:-radius,y:-radius,width:radius*2,height:radius*2,
    viewBox:`${col*64} ${row*64} 64 64`,overflow:'hidden',preserveAspectRatio:'none',
  },node);
  const image=el('image',{
    href:ctx.liquidAtlasSources?.[0]??url,x:0,y:0,
    width:CONFIG.oil.spriteColumns*64,height:CONFIG.oil.spriteRows*64,
    style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':'',
  },viewport);
  const fallback=el('circle',{cx:0,cy:0,r:radius,fill:oilColor(owner),display:'none'},node);
  image.addEventListener('error',()=>{attr(viewport,'display','none');attr(fallback,'display','');});
  image.addEventListener('load',()=>{attr(viewport,'display','');attr(fallback,'display','none');});
  return {node,viewport,image,fallback,url};
}

export function paintLiquidSprite(drop,radius,dry) {
  const sprite=drop.sprite;
  if(!sprite)return;
  for(const [key,value] of Object.entries({x:-radius,y:-radius,width:radius*2,height:radius*2}))
    attr(sprite.viewport,key,value.toFixed(3));
  const sources=ctx.liquidAtlasSources??[sprite.url];
  const bucket=Math.min(sources.length-1,Math.round(dry*(sources.length-1)));
  attr(sprite.image,'href',sources[bucket]);
  attr(sprite.fallback,'r',radius.toFixed(2));
  attr(sprite.fallback,'fill',oilColor(drop.robot,.9,dry));
}
