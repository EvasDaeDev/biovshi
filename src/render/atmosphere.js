import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { el } from './svg.js';
import { loadTextureImage } from '../assets/preload.js';

const rasters=new Map();
// Convert the stationary blurred ambient layer once during arena preparation.
// Camera motion then displays a bitmap instead of rerunning the SVG blur.
export async function bakeStaticLighting() {
  const svg=ctx.svg,group=ctx.ambientGlowG;
  if(!group||group.dataset.rasterized==='true')return;
  const source=group.cloneNode(true);
  source.removeAttribute('style');
  const size=Math.round(700*CONFIG.light.staticResolution);
  const markup=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 700 700"><defs>${ctx.ambientBlur.outerHTML}${ctx.fieldClip.outerHTML}</defs>${source.outerHTML}</svg>`;
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);
  if(!rasters.has(url)){
    const pending=(async()=>{
      const image=await loadTextureImage(url);
      const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
      const drawing=canvas.getContext('2d');
      if(!drawing)throw new Error('Static lighting canvas is unavailable');
      drawing.drawImage(image,0,0,size,size);
      return canvas.toDataURL('image/png');
    })();
    if(rasters.size>=2)rasters.delete(rasters.keys().next().value);
    rasters.set(url,pending);pending.catch(()=>rasters.delete(url));
  }
  const href=await rasters.get(url);
  if(svg!==ctx.svg||!group.isConnected||ctx.disposed)return;
  group.replaceChildren();group.removeAttribute('filter');
  el('image',{href,x:0,y:0,width:700,height:700,preserveAspectRatio:'none'},group);
  group.dataset.rasterized='true';
  ctx.ambientBlur.remove();ctx.ambientLights=[];
}
