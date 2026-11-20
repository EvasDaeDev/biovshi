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

export async function preloadTextures({onProgress}={}) {
  const files=Object.entries(ASSETS.textures);
  let completed=0;
  const report=()=>onProgress?.(completed,files.length);
  report();
  const entries=await Promise.all(files.map(async([key,file])=>{
    const url=assetUrl(file);
    let loaded=false;
    try {if(url){await loadTextureImage(url);loaded=true;}}catch{/* Optional images fall back safely. */}
    completed++;report();return [key,{url,loaded}];
  }));
  return Object.fromEntries(entries);
}

// Transient SVG rasterizations must not accumulate across rounds.
export function releaseTextureImage(url){images.delete(url);}
