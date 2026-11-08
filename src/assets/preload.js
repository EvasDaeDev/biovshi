import { ASSETS, assetUrl } from './manifest.js';

const images = new Map();
export function loadTextureImage(url, {timeoutMs=15000}={}) {
  if (!images.has(url)) {
    const pending=new Promise((resolve,reject)=>{
      const image=new Image();
      image.crossOrigin='anonymous';
      const timer=setTimeout(()=>finish(new Error('Texture load timed out')),timeoutMs);
      const finish=error=>{
        clearTimeout(timer);image.onload=image.onerror=null;
        if(error)reject(error);else resolve(image);
      };
      image.onload=async()=>{
        try{if(image.decode)await image.decode();finish(image.naturalWidth>0?null:new Error('Empty texture'));}
        catch(error){finish(error);}
      };
      image.onerror=()=>finish(new Error('Cannot load texture'));
      image.src=url;
    });
    images.set(url,pending);
  }
  return images.get(url);
}

export async function preloadTextures() {
  const entries=await Promise.all(Object.entries(ASSETS.textures).map(async([key,file])=>{
    const url=assetUrl(file);
    if(!url)return [key,{url:null,loaded:false}];
    try {await loadTextureImage(url);return [key,{url,loaded:true}];}
    catch {return [key,{url,loaded:false}];}
  }));
  return Object.fromEntries(entries);
}
