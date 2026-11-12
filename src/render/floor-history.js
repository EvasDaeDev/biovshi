import {accessFloorStore,floorBlob} from './floor-storage.js';
import {ctx} from '../game/state.js';
import {staticArenaImage} from './pixi-static.js';
import {loadTextureImage,releaseTextureImage} from '../assets/preload.js';
import {paint} from './frame.js';
import {bettingSave} from '../betting/storage.js';
const SIZE=1024;
function canvas(){const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
function persist(){
  const key=ctx.betting?.floorId?ctx.betting.floorId+':'+(ctx.arenaId??'ward'):null,source=ctx.floorCanvas;
  const previous=ctx.floorSavePromise??Promise.resolve();
  const generation=ctx.floorSaveGeneration=(ctx.floorSaveGeneration??0)+1;
  ctx.floorSavePromise=previous.catch(()=>{}).then(async()=>{
    if(generation!==ctx.floorSaveGeneration||!key)return;
    try{
      if(!globalThis.indexedDB)throw Error('IndexedDB unavailable');
      const blob=await floorBlob(source);
      if(generation!==ctx.floorSaveGeneration)return;
      await accessFloorStore(key,blob);ctx.floorStorageAvailable=true;
    }catch{ctx.floorStorageAvailable=false;}
  });
}
function install(next){
  ctx.floorCanvas=next;
  ctx.arenaFloors??=new Map();ctx.arenaFloors.set((ctx.betting?.floorId??'demo')+':'+(ctx.arenaId??'ward'),next);
  if(!ctx.floorImage){ctx.floorImage=document.createElementNS(ctx.NS,'image');for(const [key,value] of Object.entries({x:0,y:0,width:700,height:700,preserveAspectRatio:'none'}))ctx.floorImage.setAttribute(key,value);ctx.grid.after(ctx.floorImage);}
  if(ctx.arenaRenderer)ctx.arenaRenderer.replaceFloor(next);
  else ctx.floorImage.setAttribute('href',next.toDataURL('image/png'));
}
export async function initializeFloor(){
  const {canvas:base}=await staticArenaImage([ctx.arenaContent.querySelector(':scope > rect'),ctx.svg.querySelector('#tag7hop-floor-decals'),ctx.grid],{pixels:SIZE});
  ctx.cleanFloorCanvas=base;ctx.floorImage=null;ctx.floorCanvas=base;ctx.floorRevision=0;
  if(ctx.betting&&!ctx.betting.floorId){ctx.betting.floorId=globalThis.crypto?.randomUUID?.()??String(Date.now())+Math.random();bettingSave();}
  const memory=ctx.arenaFloors?.get((ctx.betting?.floorId??'demo')+':'+(ctx.arenaId??'ward'));
  if(memory){install(memory);return;}
  let saved;
  try{if(ctx.betting?.floorId){saved=await accessFloorStore(ctx.betting.floorId+':'+(ctx.arenaId??'ward'));if(!saved&&ctx.arenaId==='ward')saved=await accessFloorStore(ctx.betting.floorId);}}catch{ctx.floorStorageAvailable=false;}
  if(saved){
    let url;
    try{
      url=typeof saved==='string'?saved:URL.createObjectURL(saved);
      const image=await loadTextureImage(url,{timeoutMs:3000}),next=canvas();
      next.getContext('2d').drawImage(image,0,0,SIZE,SIZE);install(next);return;
    }catch{ctx.floorStorageAvailable=false;}
    finally{if(url){releaseTextureImage(url);if(typeof saved!=='string')URL.revokeObjectURL(url);}}
  }
  install(base);
}
export async function cleanFloor(){
  if(!ctx.cleanFloorCanvas||ctx.floorBaking)return;
  ctx.lastFloorBakeError='';install(ctx.cleanFloorCanvas);ctx.floorRevision=(ctx.floorRevision??0)+1;persist();
}
// Only fresh remains are treated. The existing opaque floor is copied unchanged.
export function mergeFloorPixels(base,layer){
  for(let i=0;i<layer.length;i+=4){
    const alpha=layer[i+3]/255;if(!alpha)continue;
    const gray=.2126*layer[i]+.7152*layer[i+1]+.0722*layer[i+2];
    for(let c=0;c<3;c++){
      const desaturated=(layer[i+c]+gray)*.5;
      const muted=base[i+c]+(desaturated-base[i+c])*.5;
      base[i+c]=Math.round(base[i+c]*(1-alpha)+muted*alpha);
    }
    base[i+3]=255;
  }
  return base;
}
export async function bakeRoundFloor({signal}={}){
  if(!ctx.floorCanvas)return;
  paint();
  // A living unconscious patient is carried away, not baked into the floor.
  // Blood and detached parts remain, along with bodies of genuinely dead patients.
  const corpses=ctx.robots.filter(r=>r.id!==ctx.combat.winner&&!r.mobile&&!r.unconscious).map(r=>r.actor);
  const nodes=[ctx.oilG,ctx.detachedG,...corpses];
  const layer=ctx.arenaRenderer?.rasterizeRemains?ctx.arenaRenderer.rasterizeRemains(nodes,SIZE):(await staticArenaImage(nodes,{pixels:SIZE,exclude:'.robot-label'})).canvas;
  if(signal?.aborted)return;
  const next=canvas(),draw=next.getContext('2d',{willReadFrequently:true});
  draw.drawImage(ctx.floorCanvas,0,0,SIZE,SIZE);
  const base=draw.getImageData(0,0,SIZE,SIZE),fresh=layer.getContext('2d').getImageData(0,0,SIZE,SIZE);
  mergeFloorPixels(base.data,fresh.data);draw.putImageData(base,0,0);install(next);persist();
}
