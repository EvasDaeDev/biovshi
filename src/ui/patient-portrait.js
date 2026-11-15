import {patientSkin,patientGarage} from '../game/patients.js';
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
    const end={x:kind==='arm'?30:-68,y:side*(kind==='arm'?27:31)};
    const solved=ik(a,end,...(kind==='arm'?[27,29]:[32,33]),kind==='arm'?side:-side);
    bones.push({key:`${kind}-${side}-upper`,a,b:solved.joint},{key:`${kind}-${side}-lower`,a:solved.joint,b:solved.end});
  }
  for(const i of [3,2,1,0])bones.push({key:'spine-'+i,a:{x:-i*10,y:0},b:{x:-(i+1)*10,y:0}});
  bones.push({key:'head',a:{x:15,y:0},b:{x:35,y:0}});
  return bones.map(bone=>({...bone,part:ROBOT_PARTS[bone.key],matrix:skinMatrix(bone.a,bone.b,ROBOT_PARTS[bone.key])}));
}
export const PORTRAIT_BONES=portraitBones();
const palettes=new Map();
const hatImages=new Map();
let androidAtlas=null;

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
  try{androidAtlas=ctx.textureAssets?.robotAndroid?.loaded===false?null:await atlasPalette(assetUrl(ASSETS.textures.robotAndroid));}catch{androidAtlas=null;}
  await Promise.all([1,2,3,4].map(async id=>{try{hatImages.set(id,await loadTextureImage(assetUrl(ASSETS.textures['hat'+id])));}catch{}}));
  await Promise.all(cards.map(async(card,id)=>{
    const key=ctx.robots[id]?.body?.skinKey??['robotA','robotB','robotC','robotD'][patientSkin(id)];
    try{card.portraitAtlas=ctx.textureAssets?.[key]?.loaded===false?null:await atlasPalette(assetUrl(ASSETS.textures[key]));}
    catch(error){card.portraitAtlas=null;console.warn('Patient portrait:',error);}
  }));
  if(cards!==ctx.cardNodes||ctx.disposed)return;
  ctx.telemetryPortraitsReady=true;ctx.telemetryDirty=true;
}
export function paintPatientPortrait(card,id,states,bones=PORTRAIT_BONES) {
  const prosthetics=ctx.robots[id]?.prosthetics??patientGarage()?.[id]?.prosthetics??[];
  const hat=patientGarage()?.[id]?.head?.hat;
  const key=states.map(s=>s.key+':'+s.state+':'+s.opacity).join('|')+'|'+prosthetics.join(',')+'|'+hat+'|'+card.portrait.width+'x'+card.portrait.height;
  if(card.portraitStateKey!==key){
    card.portraitStateKey=key;card.portraitStates=Object.fromEntries(states.map(s=>[s.key,s.state]));
    const counts=states.reduce((counts,s)=>(counts[s.state]=(counts[s.state]??0)+1,counts),{});
    card.portrait.setAttribute('aria-label',`${ctx.robots[id]?.isBoss?'Босс':'Пациент '+String.fromCharCode(65+id)}: целых ${counts.good??0}, повреждено ${(counts.warn??0)+(counts.bad??0)}, потеряно ${counts.off??0}`);
  }
  if(!ctx.telemetryPortraitsReady||card.portraitPaintKey===key)return;
  const draw=card.portrait.getContext('2d');if(!draw)return;
  draw.setTransform(1,0,0,1,0,0);draw.clearRect(0,0,card.portrait.width,card.portrait.height);
  const corners=bones.flatMap(bone=>[[0,0],[64,0],[64,64],[0,64]].map(([x,y])=>transformPoint(bone.matrix,{x,y})));
  const minX=Math.min(...corners.map(p=>p.x)),maxX=Math.max(...corners.map(p=>p.x));
  const minY=Math.min(...corners.map(p=>p.y)),maxY=Math.max(...corners.map(p=>p.y));
  const portraitScale=Math.min((card.portrait.width-12)/(maxX-minX),(card.portrait.height-8)/(maxY-minY));
  draw.setTransform(portraitScale,0,0,portraitScale,card.portrait.width/2-(minX+maxX)*portraitScale/2,card.portrait.height/2-(minY+maxY)*portraitScale/2);draw.imageSmoothingEnabled=false;
  for(let i=0;i<bones.length;i++){
    const bone=bones[i],state=states[i];draw.save();draw.globalAlpha=Number(state.opacity);
    const atlas=prosthetics.includes(bone.key)&&androidAtlas?androidAtlas:card.portraitAtlas;
    if(atlas){
      draw.transform(...bone.matrix);
      draw.drawImage(atlas[state.state],bone.part.col*64,bone.part.row*64,64,64,0,0,64,64);
    }else{
      draw.strokeStyle=state.state==='off'?'#353e48':TELEMETRY_COLOURS[state.state]??'#b7ada1';draw.fillStyle=draw.strokeStyle;
      draw.lineWidth=bone.key.startsWith('spine')?10:3;draw.lineCap='round';draw.beginPath();
      if(bone.key==='head'){draw.arc(25,0,10,0,Math.PI*2);draw.fill();}
      else{draw.moveTo(bone.a.x,bone.a.y);draw.lineTo(bone.b.x,bone.b.y);draw.stroke();}
    }
    draw.restore();
  }
  if(hatImages.has(hat)&&states.find(s=>s.key==='head')?.state!=='off'){draw.save();draw.transform(...bones.find(b=>b.key==='head').matrix);draw.drawImage(hatImages.get(hat),0,0,64,64);draw.restore();}
  card.portraitPaintKey=key;
}
