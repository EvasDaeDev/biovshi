import {ctx} from '../game/state.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {loadTextureImage} from '../assets/preload.js';
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {transformPoint} from '../render/pixi-math.js';
import {ik} from '../utils/math.js';
import {TELEMETRY_COLOURS} from './telemetry-colours.js';

export const PORTRAIT_WIDTH=260,PORTRAIT_HEIGHT=112;
// Same neutral kinematics, atlas anchors and spine width as the arena. No second
// robot simulation or animation loop is created for the cards.
export function portraitBones() {
  const bones=[];
  for(const side of [-1,1])for(const kind of ['arm','leg']){
    const a={x:kind==='arm'?3:-45,y:side*(kind==='arm'?15:12)};
    const end={x:kind==='arm'?30:-63,y:side*(kind==='arm'?27:31)};
    const solved=ik(a,end,...(kind==='arm'?[27,29]:[32,25]),kind==='arm'?side:-side);
    bones.push({key:`${kind}-${side}-upper`,a,b:solved.joint},{key:`${kind}-${side}-lower`,a:solved.joint,b:solved.end});
  }
  for(const i of [3,2,1,0])bones.push({key:'spine-'+i,a:{x:-i*10,y:0},b:{x:-(i+1)*10,y:0}});
  bones.push({key:'head',a:{x:15,y:0},b:{x:35,y:0}});
  return bones.map(bone=>({...bone,part:ROBOT_PARTS[bone.key],matrix:skinMatrix(bone.a,bone.b,ROBOT_PARTS[bone.key])}));
}
export const PORTRAIT_BONES=portraitBones();
const corners=PORTRAIT_BONES.flatMap(bone=>[[0,0],[64,0],[64,64],[0,64]].map(([x,y])=>transformPoint(bone.matrix,{x,y})));
const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
const scale=Math.min((PORTRAIT_WIDTH-12)/(maxX-minX),(PORTRAIT_HEIGHT-8)/(maxY-minY));
const offset={x:PORTRAIT_WIDTH/2-(minX+maxX)*scale/2,y:PORTRAIT_HEIGHT/2-(minY+maxY)*scale/2};
const palettes=new Map();

// Palette atlases are prepared once. Transparency and luminance detail survive;
// healthy parts use the original image with absolutely no green tint.
export function tintPortraitPixels(pixels,hex,brightness=1) {
  const colour=hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16));
  const gain=255/Math.max(...colour);
  for(let i=0;i<pixels.length;i+=4){
    if(!pixels[i+3])continue;
    const shade=Math.sqrt((.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2])/255)*gain;
    for(let c=0;c<3;c++)pixels[i+c]=Math.min(255,Math.round(colour[c]*shade*brightness));
  }
  return pixels;
}
async function atlasPalette(url) {
  if(!palettes.has(url))palettes.set(url,(async()=>{
    const image=await loadTextureImage(url),base=document.createElement('canvas');
    base.width=image.naturalWidth;base.height=image.naturalHeight;
    const draw=base.getContext('2d',{willReadFrequently:true});
    if(!draw)throw new Error('Portrait canvas is unavailable');
    draw.drawImage(image,0,0);const original=draw.getImageData(0,0,base.width,base.height);
    const variants={good:image};
    for(const state of ['warn','bad','off']){
      const canvas=document.createElement('canvas');canvas.width=base.width;canvas.height=base.height;
      const painter=canvas.getContext('2d'),pixels=painter.getImageData(0,0,base.width,base.height);
      pixels.data.set(original.data);tintPortraitPixels(pixels.data,TELEMETRY_COLOURS[state],state==='off'?.5:1);painter.putImageData(pixels,0,0);
      variants[state]=canvas;
    }
    return variants;
  })());
  return palettes.get(url);
}
export async function preparePatientPortraits() {
  const cards=ctx.cardNodes;
  await Promise.all(cards.map(async(card,id)=>{
    const key=['robotA','robotB','robotC','robotD'][id];
    try{card.portraitAtlas=ctx.textureAssets?.[key]?.loaded===false?null:await atlasPalette(assetUrl(ASSETS.textures[key]));}
    catch(error){card.portraitAtlas=null;console.warn('Patient portrait:',error);}
  }));
  if(cards!==ctx.cardNodes||ctx.disposed)return;
  ctx.telemetryPortraitsReady=true;ctx.telemetryDirty=true;
}
export function paintPatientPortrait(card,id,states) {
  const key=states.map(s=>s.state+':'+s.opacity).join('|');
  if(card.portraitStateKey!==key){
    card.portraitStateKey=key;card.portraitStates=Object.fromEntries(states.map(s=>[s.key,s.state]));
    const counts=states.reduce((counts,s)=>(counts[s.state]=(counts[s.state]??0)+1,counts),{});
    card.portrait.setAttribute('aria-label',`Пациент ${String.fromCharCode(65+id)}: целых ${counts.good??0}, повреждено ${(counts.warn??0)+(counts.bad??0)}, потеряно ${counts.off??0}`);
  }
  if(!ctx.telemetryPortraitsReady||card.portraitPaintKey===key)return;
  const draw=card.portrait.getContext('2d');if(!draw)return;
  draw.setTransform(1,0,0,1,0,0);draw.clearRect(0,0,card.portrait.width,card.portrait.height);
  draw.setTransform(scale*2,0,0,scale*2,offset.x*2,offset.y*2);draw.imageSmoothingEnabled=false;
  for(let i=0;i<PORTRAIT_BONES.length;i++){
    const bone=PORTRAIT_BONES[i],state=states[i];draw.save();draw.globalAlpha=Number(state.opacity);
    if(card.portraitAtlas){
      draw.transform(...bone.matrix);
      draw.drawImage(card.portraitAtlas[state.state],bone.part.col*64,bone.part.row*64,64,64,0,0,64,64);
    }else{
      draw.strokeStyle=state.state==='off'?'#353e48':TELEMETRY_COLOURS[state.state]??'#b7ada1';draw.fillStyle=draw.strokeStyle;
      draw.lineWidth=bone.key.startsWith('spine')?10:3;draw.lineCap='round';draw.beginPath();
      if(bone.key==='head'){draw.arc(25,0,10,0,Math.PI*2);draw.fill();}
      else{draw.moveTo(bone.a.x,bone.a.y);draw.lineTo(bone.b.x,bone.b.y);draw.stroke();}
    }
    draw.restore();
  }
  card.portraitPaintKey=key;
}
