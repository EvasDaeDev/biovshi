// Aged Industrial Metal. These transparent textures shade the existing CSS colours.
export const UI_METAL_PRESET=Object.freeze({
  seed:2177,grain:.84,blotches:.37,edgeWear:.75,scratches:.76,
  lineIrregularity:.28,frameDepth:.27,
});

const TILE=512,EDGE_LENGTH=192,EDGE_WIDTH=8,CELL_SIZE=12;
const installed=new WeakMap();
const smooth=t=>t*t*(3-2*t);
const mix=(a,b,t)=>a+(b-a)*t;

function randomSequence(seed){
  let state=seed;
  return ()=>{
    state=(Math.imul(1664525,state)+1013904223)>>>0;
    return state/4294967296;
  };
}

function valueNoise(random,cells){
  const grid=Float32Array.from({length:cells*cells},()=>2*random()-1);
  const at=(x,y)=>grid[(y%cells)*cells+x%cells];
  return (x,y)=>{
    const u=x*cells/TILE,v=y*cells/TILE;
    const i=Math.floor(u),j=Math.floor(v),tx=smooth(u-i),ty=smooth(v-j);
    return mix(mix(at(i,j),at(i+1,j),tx),mix(at(i,j+1),at(i+1,j+1),tx),ty);
  };
}

function paintSurface(ctx,random,preset){
  const image=ctx.createImageData(TILE,TILE);
  const coarse=valueNoise(random,4),medium=valueNoise(random,8),fine=valueNoise(random,12);
  const grain=valueNoise(random,TILE/2);
  for(let y=0;y<TILE;y++){
    for(let x=0;x<TILE;x++){
      const speckle=(random()*2-1)*.7+grain(x,y)*.3;
      const patches=coarse(x,y)*.53+medium(x,y)*.32+fine(x,y)*.15;
      const shade=21*preset.grain*speckle+27*preset.blotches*patches;
      const offset=4*(y*TILE+x),light=shade>=0;
      image.data[offset]=image.data[offset+1]=image.data[offset+2]=light?255:0;
      // White and black have unequal effects on the dark base materials.
      image.data[offset+3]=Math.round(255*Math.abs(shade)/(light?207:64));
    }
  }
  ctx.putImageData(image,0,0);
  // Wrap strokes across the tile boundary so the repeated surface has no seams.
  for(let group=0;group<18;group++){
    const originX=random()*TILE,originY=random()*TILE;
    for(let i=0;i<Math.round(5*preset.scratches);i++){
      const x=(originX+65*(random()-.5)+TILE)%TILE;
      const y=(originY+65*(random()-.5)+TILE)%TILE;
      const angle=random()*Math.PI*2,length=5+85*random()**2;
      const dx=Math.cos(angle)*length,dy=Math.sin(angle)*length;
      const tint=random()<.35?255:0,alpha=.04+.12*random(),kink=.7*(random()-.5);
      ctx.strokeStyle=`rgba(${tint},${tint},${tint},${alpha})`;
      ctx.lineWidth=.3+.7*random();
      for(const ox of [-TILE,0,TILE]) for(const oy of [-TILE,0,TILE]){
        ctx.beginPath();ctx.moveTo(x+ox,y+oy);
        ctx.lineTo(x+ox+dx*.57,y+oy+dy*.57+kink);
        ctx.lineTo(x+ox+dx,y+oy+dy);ctx.stroke();
      }
    }
  }
}

function paintEdge(ctx,random,preset){
  const offsets=Float32Array.from({length:EDGE_LENGTH/CELL_SIZE},()=>2*random()-1);
  const contour=x=>{
    const i=Math.floor(x/CELL_SIZE);
    return 1.4+2*preset.lineIrregularity*mix(offsets[i%offsets.length],
      offsets[(i+1)%offsets.length],smooth(x/CELL_SIZE-i));
  };
  const trace=(offset,width,tint,alpha)=>{
    ctx.strokeStyle=`rgba(${tint},${tint},${tint},${alpha})`;
    ctx.lineWidth=width;
    ctx.beginPath();ctx.moveTo(0,contour(0)+offset);
    for(let x=1;x<=EDGE_LENGTH;x++)ctx.lineTo(x,contour(x)+offset);
    ctx.stroke();
  };
  trace(-.65,1.5,0,preset.frameDepth*.72);
  trace(.3,.85,255,preset.frameDepth*.52);
  trace(1.35,1.4,0,preset.frameDepth*.65);
  trace(2.75,.7,255,preset.frameDepth*.25);
  // A few chips break the highlight before the smaller abrasion marks.
  ctx.globalCompositeOperation='destination-out';
  ctx.strokeStyle='rgba(0,0,0,.36)';ctx.lineWidth=2;
  for(let n=0;n<Math.round(8*preset.edgeWear);n++){
    const x=random()*EDGE_LENGTH,y=contour(x)+.4,length=2+7*random();
    for(const offset of [-EDGE_LENGTH,0]){
      ctx.beginPath();ctx.moveTo(x+offset,y);
      ctx.lineTo(x+offset+length,y+.5);ctx.stroke();
    }
  }
  ctx.globalCompositeOperation='source-over';
  for(let n=0;n<Math.round(35*preset.edgeWear);n++){
    const x=random()*EDGE_LENGTH,y=contour(x)+random()*4.5;
    const length=1+8*random()**2,tint=random()<.40?255:0;
    ctx.strokeStyle=`rgba(${tint},${tint},${tint},${.08+.23*random()})`;
    ctx.lineWidth=.35+1.25*random();
    const dy=(random()-.5)*1.1;
    for(const offset of [-EDGE_LENGTH,0]){
      ctx.beginPath();ctx.moveTo(x+offset,y);
      ctx.lineTo(x+offset+length,y+dy);ctx.stroke();
    }
  }
}

function canvasWithContext(doc,width,height){
  const canvas=doc.createElement('canvas');
  canvas.width=width;canvas.height=height;
  return [canvas,canvas.getContext('2d')];
}

async function prepareMaterials(doc){
  const url=doc.defaultView?.URL;
  if(typeof url?.createObjectURL!=='function')return;
  const [surface,surfaceCtx]=canvasWithContext(doc,TILE,TILE);
  const [top,topCtx]=canvasWithContext(doc,EDGE_LENGTH,EDGE_WIDTH);
  if(!surfaceCtx||!topCtx||typeof surface.toBlob!=='function')return;

  const preset=UI_METAL_PRESET,random=randomSequence(preset.seed);
  paintSurface(surfaceCtx,random,preset);
  paintEdge(topCtx,random,preset);

  const textures=[['surface',surface],['top',top]];
  // Build the other three sides from the same periodic strip at natural scale.
  for(const [name,width,height,x,y,angle] of [
    ['bottom',EDGE_LENGTH,EDGE_WIDTH,EDGE_LENGTH,EDGE_WIDTH,Math.PI],
    ['left',EDGE_WIDTH,EDGE_LENGTH,0,EDGE_LENGTH,-Math.PI/2],
    ['right',EDGE_WIDTH,EDGE_LENGTH,EDGE_WIDTH,0,Math.PI/2],
  ]){
    const [canvas,ctx]=canvasWithContext(doc,width,height);
    if(!ctx)return;
    ctx.translate(x,y);ctx.rotate(angle);ctx.drawImage(top,0,0);
    textures.push([name,canvas]);
  }
  const blobs=await Promise.all(textures.map(([,canvas])=>new Promise(resolve=>canvas.toBlob(resolve))));
  if(blobs.some(blob=>!blob))return;
  const style=doc.documentElement.style;
  for(const [i,[name]] of textures.entries()){
    style.setProperty('--metal-'+name,`url("${url.createObjectURL(blobs[i])}")`);
  }
  // The shared URLs are kept alive for this document, including arena transitions.
}

export function installMetalMaterials(doc){
  let materials=installed.get(doc);
  if(!materials){
    materials=prepareMaterials(doc).catch(()=>{ /* CSS frame remains available. */ });
    installed.set(doc,materials);
  }
  return materials;
}
