import {arenaRaster} from '../game/arena-dimensions.js';
import {accessFloorStore,floorBlob} from './floor-storage.js';
import {ctx} from '../game/state.js';
import {staticArenaImage} from './pixi-static.js';
import {loadTextureImage,releaseTextureImage} from '../assets/preload.js';
import {paint} from './frame.js';
import {bettingSave} from '../betting/storage.js';
const SIZE=1024;
function canvas(){const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
function floorScope(){
  const sessionId=ctx.betting?.floorId,arenaId=ctx.arenaId??'ward';
  const {width,height}=ctx.arenaDefinition??{};
  const arena=width!==height?arenaId+'@'+width+'x'+height:arenaId;
  if(ctx.mode==='tower'&&ctx.towerRun&&sessionId){
    const playerKey=ctx.betting.players[ctx.towerPlayer]?.floorKey??ctx.towerPlayer;
    return {key:`tower:${sessionId}:${playerKey}:${arena}`,generation:ctx.towerRun.floorHistoryGeneration??0};
  }
  return {key:`${sessionId??'demo'}:${arena}`,sessionId,arena};
}
function remember({key,generation},source){
  ctx.arenaFloors??=new Map();
  ctx.arenaFloors.set(key,generation===undefined?source:{generation,source});
}
function persist(scope,source){
  const {key,sessionId,generation}=scope;
  if(!sessionId&&generation===undefined)return;
  const previous=ctx.floorSavePromise??Promise.resolve();
  ctx.floorSavePromise=previous.catch(()=>{}).then(async()=>{
    try{
      if(!globalThis.indexedDB)throw Error('IndexedDB unavailable');
      const blob=await floorBlob(source);
      await accessFloorStore(key,generation===undefined?blob:{generation,blob});
      ctx.floorStorageAvailable=true;
    }catch{ctx.floorStorageAvailable=false;}
  });
}
function install(next){
  ctx.floorCanvas=next;
  if(!ctx.floorImage){
    ctx.floorImage=document.createElementNS(ctx.NS,'image');
    const {left,top,size}=arenaRaster(ctx.arenaDefinition);
    for(const [key,value] of Object.entries({x:left,y:top,width:size,height:size,preserveAspectRatio:'none'}))
      ctx.floorImage.setAttribute(key,value);
    ctx.grid.after(ctx.floorImage);
  }
  if(ctx.arenaRenderer)ctx.arenaRenderer.replaceFloor(next);
  else ctx.floorImage.setAttribute('href',next.toDataURL('image/png'));
}
export async function initializeFloor(){
  const {canvas:base}=await staticArenaImage([ctx.arenaContent.querySelector(':scope > rect'),ctx.svg.querySelector('#tag7hop-floor-decals'),ctx.grid],{pixels:SIZE});
  ctx.cleanFloorCanvas=base;ctx.floorImage=null;ctx.floorCanvas=base;ctx.floorRevision=0;
  if(ctx.betting&&!ctx.betting.floorId){ctx.betting.floorId=globalThis.crypto?.randomUUID?.()??String(Date.now())+Math.random();bettingSave();}
  const scope=floorScope();
  const {key,generation,sessionId,arena}=scope;
  const memory=ctx.arenaFloors?.get(key);
  const cached=generation===undefined?memory:memory?.generation===generation?memory.source:null;
  if(cached){install(cached);return;}
  let saved;
  try{
    if(sessionId||generation!==undefined){
      await ctx.floorSavePromise;
      saved=await accessFloorStore(key);
      if(generation!==undefined)saved=saved?.generation===generation?saved.blob:null;
      else if(!saved&&arena==='ward')saved=await accessFloorStore(sessionId);
    }
  }catch{ctx.floorStorageAvailable=false;}
  if(saved){
    let url;
    try{
      url=typeof saved==='string'?saved:URL.createObjectURL(saved);
      const image=await loadTextureImage(url,{timeoutMs:3000}),next=canvas();
      next.getContext('2d').drawImage(image,0,0,SIZE,SIZE);remember(scope,next);install(next);return;
    }catch{ctx.floorStorageAvailable=false;}
    finally{if(url){releaseTextureImage(url);if(typeof saved!=='string')URL.revokeObjectURL(url);}}
  }
  remember(scope,base);install(base);
}
export async function cleanFloor(){
  if(!ctx.cleanFloorCanvas||ctx.floorBaking)return;
  const scope=floorScope();
  ctx.lastFloorBakeError='';install(ctx.cleanFloorCanvas);ctx.floorRevision=(ctx.floorRevision??0)+1;
  remember(scope,ctx.floorCanvas);persist(scope,ctx.floorCanvas);
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
  const source=ctx.floorCanvas,scope=floorScope();
  if(!source)return;
  // The final physics tick may still be depositing oil from the last strike.
  if(scope.generation!==undefined)await Promise.resolve();
  paint();
  // A living unconscious patient is carried away, not baked into the floor.
  // Blood and detached parts remain, along with bodies of genuinely dead patients.
  const corpses=ctx.robots.filter(r=>r.id!==ctx.combat.winner&&!r.mobile&&!r.unconscious).map(r=>r.actor);
  const nodes=[ctx.oilG,ctx.detachedG,...corpses];
  const layer=ctx.arenaRenderer?.rasterizeRemains?ctx.arenaRenderer.rasterizeRemains(nodes,SIZE):(await staticArenaImage(nodes,{pixels:SIZE,exclude:'.robot-label'})).canvas;
  if(signal?.aborted)return;
  const next=canvas(),draw=next.getContext('2d',{willReadFrequently:true});
  draw.drawImage(source,0,0,SIZE,SIZE);
  const base=draw.getImageData(0,0,SIZE,SIZE),fresh=layer.getContext('2d').getImageData(0,0,SIZE,SIZE);
  mergeFloorPixels(base.data,fresh.data);draw.putImageData(base,0,0);
  remember(scope,next);
  // Tower results still draw the live remains. Show the composite on the next visit.
  if(scope.generation===undefined&&ctx.floorCanvas===source)install(next);
  persist(scope,next);
}
