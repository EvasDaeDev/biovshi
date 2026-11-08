import {ctx} from '../game/state.js';
import {staticArenaImage} from './pixi-static.js';
import {loadTextureImage} from '../assets/preload.js';
import {paint} from './frame.js';
import {bettingSave} from '../betting/storage.js';
const SIZE=1024;
function canvas(){const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
function database(){return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(Error('IndexedDB unavailable'));
  const request=indexedDB.open('biovshi.floor-history',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('floors');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
});}
async function storedFloor(write){
  const key=ctx.betting?.floorId;if(!key)return null;
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('floors',write===undefined?'readonly':'readwrite'),store=tx.objectStore('floors');
    const request=write===undefined?store.get(key):store.put(write,key);
    tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
async function persist(){
  try{await storedFloor(ctx.floorCanvas.toDataURL('image/png'));ctx.floorStorageAvailable=true;}
  catch{ctx.floorStorageAvailable=false;}
}
function install(next){
  ctx.floorCanvas=next;
  if(!ctx.floorImage){ctx.floorImage=document.createElementNS(ctx.NS,'image');for(const [key,value] of Object.entries({x:0,y:0,width:700,height:700,preserveAspectRatio:'none'}))ctx.floorImage.setAttribute(key,value);ctx.grid.after(ctx.floorImage);}
  ctx.floorImage.setAttribute('href',next.toDataURL('image/png'));
  ctx.arenaRenderer?.replaceFloor(next);
}
export async function initializeFloor(){
  const {canvas:base}=await staticArenaImage([ctx.arenaContent.querySelector(':scope > rect'),ctx.svg.querySelector('#tag7hop-floor-decals'),ctx.grid],{pixels:SIZE});
  ctx.cleanFloorCanvas=base;ctx.floorImage=null;ctx.floorCanvas=base;ctx.floorRevision=0;
  if(ctx.betting&&!ctx.betting.floorId){ctx.betting.floorId=globalThis.crypto?.randomUUID?.()??String(Date.now())+Math.random();bettingSave();}
  let saved;
  try{saved=await storedFloor();}catch{ctx.floorStorageAvailable=false;}
  if(saved){try{const image=await loadTextureImage(saved),next=canvas();next.getContext('2d').drawImage(image,0,0,SIZE,SIZE);install(next);return;}catch{}}
  install(base);
}
export async function cleanFloor(){
  if(!ctx.cleanFloorCanvas||ctx.floorBaking)return;
  install(ctx.cleanFloorCanvas);ctx.floorRevision=(ctx.floorRevision??0)+1;await persist();
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
export async function bakeRoundFloor(){
  if(!ctx.floorCanvas)return;
  paint();
  const corpses=ctx.robots.filter(r=>r.id!==ctx.combat.winner).map(r=>r.actor);
  const {canvas:layer}=await staticArenaImage([ctx.oilG,ctx.detachedG,...corpses],{pixels:SIZE,exclude:'.robot-label'});
  const next=canvas(),draw=next.getContext('2d',{willReadFrequently:true});
  draw.drawImage(ctx.floorCanvas,0,0,SIZE,SIZE);
  const base=draw.getImageData(0,0,SIZE,SIZE),fresh=layer.getContext('2d').getImageData(0,0,SIZE,SIZE);
  mergeFloorPixels(base.data,fresh.data);draw.putImageData(base,0,0);install(next);await persist();
}
