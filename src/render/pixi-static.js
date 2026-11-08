import { ctx } from '../game/state.js';
import { loadTextureImage,releaseTextureImage } from '../assets/preload.js';

// SVG is used ONLY to prepare the stationary artwork. Never called in paint().
// Inline styles and images: SVG-as-image cannot load external resources in Safari.
const PROPERTIES=['fill','fill-opacity','fill-rule','stroke','stroke-width','stroke-opacity',
  'stroke-linecap','stroke-linejoin','opacity','display','filter','clip-path','font-size',
  'font-weight','font-family','text-anchor','mix-blend-mode','image-rendering'];
export async function staticArenaImage(nodes,{outset=0,night=false,forceVisible=false,pixels=null,exclude=null}={}) {
  const doc=ctx.svg.ownerDocument,win=doc.defaultView;
  const root=doc.createElementNS(ctx.NS,'svg'),defs=doc.createElementNS(ctx.NS,'defs');
  const size=700+outset*2,resolution=pixels?pixels/size:2;
  root.setAttribute('xmlns',ctx.NS);root.setAttribute('width',size*resolution);root.setAttribute('height',size*resolution);
  root.setAttribute('viewBox',`${-outset} ${-outset} ${size} ${size}`);
  root.appendChild(defs);
  // Paint servers and the floor clip live in two different branches of the old scene.
  for(const child of ctx.defs.children)defs.appendChild(child.cloneNode(true));
  defs.appendChild(ctx.fieldClip.cloneNode(true));
  for(const node of nodes.filter(Boolean)) {
    const clone=node.cloneNode(true),originals=[node,...node.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
    originals.forEach((source,i)=>{
      const style=win.getComputedStyle(source),target=copies[i];
      for(const key of PROPERTIES){const value=style.getPropertyValue(key);if(value)target.style.setProperty(key,value.replace(/url\(["']?[^)"']*#([^)'" ]+)["']?\)/g,'url(#$1)'));}
    });
    if(forceVisible)clone.style.display='inline';
    // The final ambient blend happens against the real scene, once.
    if(forceVisible)clone.style.mixBlendMode='normal';
    if(exclude)clone.querySelectorAll(exclude).forEach(node=>node.remove());
    root.appendChild(clone);
  }
  if(night)root.querySelector('#tag7hop-light-holes')?.replaceChildren();
  const data=new Map();
  await Promise.all([...root.querySelectorAll('image')].map(async image=>{
    const url=image.getAttribute('href');if(!url||url.startsWith('data:'))return;
    if(!data.has(url))data.set(url,(async()=>{
      const resource=await loadTextureImage(url),canvas=doc.createElement('canvas');
      canvas.width=resource.naturalWidth;canvas.height=resource.naturalHeight;
      canvas.getContext('2d').drawImage(resource,0,0);return canvas.toDataURL('image/png');
    })());
    image.setAttribute('href',await data.get(url));
  }));
  const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(root.outerHTML);
  const image=await loadTextureImage(url);
  // Upload pixels, never a live SVG image, to WebGL.
  const canvas=doc.createElement('canvas');canvas.width=canvas.height=size*resolution;
  canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
  releaseTextureImage(url);
  return {canvas,x:-outset,y:-outset,size};
}
