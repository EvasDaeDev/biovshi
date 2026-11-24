import { ASSETS, assetUrl } from './manifest.js';

import {trackResource} from './resource-status.js';

const images = new Map();
function requestImage(url,timeoutMs){
  return new Promise((resolve,reject)=>{
    const image=new Image();
    image.crossOrigin='anonymous';
    const finish=error=>{
      clearTimeout(timer);image.onload=image.onerror=null;
      if(error)reject(error);else resolve(image);
    };
    const timer=setTimeout(()=>{
      finish(new Error('Texture load timed out'));
      image.removeAttribute?.('src');
    },timeoutMs);
    image.onload=async()=>{
      try{if(image.decode)await image.decode();finish(image.naturalWidth>0?null:new Error('Empty texture'));}
      catch(error){finish(error);}
    };
    image.onerror=()=>finish(new Error('Cannot load texture'));
    image.src=url;
  });
}

export function loadTextureImage(url,{timeoutMs=15000,retry=false}={}){
  if(!images.has(url)){
    const external=!/^(data:|blob:)/i.test(url);
    const load=()=>{
      const first=requestImage(url,timeoutMs);
      return retry&&external?first.catch(()=>requestImage(url,timeoutMs)):first;
    };
    const pending=external?trackResource(url,load):load();
    images.set(url,pending);
    pending.catch(()=>{if(images.get(url)===pending)images.delete(url);});
  }
  return images.get(url);
}

export async function preloadTextures({keys=Object.keys(ASSETS.textures),onProgress}={}){
  let completed=0;
  const report=()=>onProgress?.(completed,keys.length);
  report();
  const entries=await Promise.all(keys.map(async key=>{
    const url=assetUrl(ASSETS.textures[key]);
    let loaded=false;
    try {if(url){await loadTextureImage(url,{timeoutMs:4000,retry:true});loaded=true;}}
    catch(error){console.warn('Texture unavailable:',url,error.message);}
    completed++;report();return [key,{url,loaded}];
  }));
  return Object.fromEntries(entries);
}

// Transient SVG rasterizations must not accumulate across rounds.
export function releaseTextureImage(url){images.delete(url);}
