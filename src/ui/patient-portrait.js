import {limbKey,limbRig,PATIENT_HEAD_OFFSET,standardLimbs} from '../robot/body.js';
import {CONFIG} from '../config.js';
import {patientSkin,patientGarage} from '../game/patients.js';
import {ctx} from '../game/state.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {loadTextureImage} from '../assets/preload.js';
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {transformPoint} from '../render/pixi-math.js';
import {ik} from '../utils/math.js';
import {TELEMETRY_COLOURS} from './telemetry-colours.js';
import {towerUpgradeAtlas,towerUpgradeRarity} from '../tower/upgrade-appearance.js';
import {TOWER_RARITIES} from '../tower/mutations.js';

export const PORTRAIT_WIDTH=260,PORTRAIT_HEIGHT=112;
// Same neutral kinematics, atlas anchors and spine width as the arena. No second
// robot simulation or animation loop is created for the cards.
export function portraitBones(body) {
 const {limbs=standardLimbs(),spineSegments:count=4,skinParts=ROBOT_PARTS}=body??{};
 const stride=CONFIG.robot.vertebraBaseCm,bones=[];
 for(const limb of limbs){
  const {kind,side}=limb,key=limbKey(limb);
  const index=limb.anchor??(kind==='arm'?0:count);
  const rig=limbRig(body,limb);
  const [rootX,rootY]=rig.root,[tipX,tipY]=limb.anchor===undefined?rig.rest:rig.graftRest;
  const a={x:rootX-index*stride,y:side*rootY},end={x:tipX-index*stride,y:side*tipY};
  const factor=limb.lengthScale??1,[upper,lower]=rig.lengths;
  const solved=ik(a,end,upper*factor,lower*factor,kind==='arm'?side:-side);
  bones.push({key:`${key}-upper`,a,b:solved.joint},{key:`${key}-lower`,a:solved.joint,b:solved.end});
 }
 for(let i=count-1;i>=0;i--)bones.push({key:'spine-'+i,a:{x:-i*stride,y:0},b:{x:-(i+1)*stride,y:0}});
 const head=body?.headOffset??PATIENT_HEAD_OFFSET,half=10*(body?.headSizeFactor??1);
 bones.push({key:'head',a:{x:head-half,y:0},b:{x:head+half,y:0}});
 return bones.map(bone=>{
  const part=skinParts[bone.key]??ROBOT_PARTS[bone.key];
  return {...bone,part,matrix:skinMatrix(bone.a,bone.b,part)};
 });
}
export const PORTRAIT_BONES=portraitBones();

const anatomyPortraitCache=new WeakMap();
export function portraitBonesForBody(body){
 if(!body?.limbs||!body.skinParts)return PORTRAIT_BONES;
 if(!anatomyPortraitCache.has(body))anatomyPortraitCache.set(body,portraitBones(body));
 return anatomyPortraitCache.get(body);
}

const palettes=new Map();
const hatImages=new Map();
let androidAtlas=null;
// Card portraits use the same per-piece replacement atlas as the arena.
// This cache is independent of the base skin palette and paints while the
// texture is loading, then invalidates the portrait exactly once on arrival.
const replacementAtlases=new Map();
const rarityPortraitAtlases=new WeakMap();
function rarityPortraitAtlas(atlas,rarity){
 if(!rarity||!atlas)return atlas;
 let variants=rarityPortraitAtlases.get(atlas);
 if(!variants){variants=new Map();rarityPortraitAtlases.set(atlas,variants);}
 if(variants.has(rarity))return variants.get(rarity);
 const shade=TOWER_RARITIES[rarity].colour,colour=[1,3,5].map(p=>parseInt(shade.slice(p,p+2),16));
 const canvases={};
 for(const [status,source] of Object.entries(atlas)){
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const draw=canvas.getContext('2d',{willReadFrequently:true});draw.drawImage(source,0,0,256,256);
  const pixels=draw.getImageData(0,0,256,256);
  for(let i=0;i<pixels.data.length;i+=4){
   if(!pixels.data[i+3])continue;
   for(let c=0;c<3;c++)pixels.data[i+c]=Math.round(.8*pixels.data[i+c]+.2*colour[c]);
  }
  draw.putImageData(pixels,0,0);canvases[status]=canvas;
 }
 variants.set(rarity,canvases);return canvases;
}
function portraitReplacement(url,card){
 let entry=replacementAtlases.get(url);
 if(!entry){
  entry={atlas:null,loading:true};
  replacementAtlases.set(url,entry);
  atlasPalette(url).then(atlas=>{
   entry.atlas=atlas;
  }).catch(()=>{}).finally(()=>{
   entry.loading=false;
   for(const current of ctx.cardNodes??[])current.portraitPaintKey=null;
   ctx.telemetryDirty=true;ctx.lastTelemetryAt=-Infinity;
  });
 }
 return entry.atlas;
}

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
  if(!palettes.has(url)){
   const pending=(async()=>{
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
   })();
   palettes.set(url,pending);
   pending.catch(()=>palettes.delete(url));
  }
  return palettes.get(url);
}
export async function preparePatientPortraits() {
  const cards=ctx.cardNodes;
  try{androidAtlas=ctx.textureAssets?.robotAndroid?.loaded===false?null:await atlasPalette(assetUrl(ASSETS.textures.robotAndroid));}catch{androidAtlas=null;}
  await Promise.all([1,2,3,4].map(async id=>{
    const key='hat'+id;
    if(ctx.textureAssets?.[key]?.loaded===false)return;
    try{hatImages.set(id,await loadTextureImage(assetUrl(ASSETS.textures[key])));}catch{}
  }));
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
  const upgrades=ctx.mode==='tower'&&id===0?
   new Map(bones.map(b=>[b.key,towerUpgradeAtlas(patientGarage()?.[0],b.key)])
    .filter(([,url])=>Boolean(url)).map(([part,url])=>[part,assetUrl(url)])):new Map();
  const rarity=ctx.mode==='tower'&&id===0?new Map(bones.map(b=>[b.key,towerUpgradeRarity(patientGarage()?.[0],b.key)])):new Map();
  const key=states.map(s=>s.key+':'+s.state+':'+s.opacity).join('|')+'|'+prosthetics.join(',')+'|'+hat+'|'+card.portrait.width+'x'+card.portrait.height+'|'+bones.map(b=>b.key+':'+b.matrix.join(',')).join(';')+'|'+[...upgrades].map(([part,url])=>part+':'+url+':'+(rarity.get(part)??0)).join(',');
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
    const replacementUrl=upgrades.get(bone.key);
    const replacement=replacementUrl?portraitReplacement(replacementUrl,card):null;
    const atlas=replacement?rarityPortraitAtlas(replacement,rarity.get(bone.key)??0):
      (prosthetics.includes(bone.key)&&androidAtlas?androidAtlas:card.portraitAtlas);
    if(atlas){
      draw.transform(...bone.matrix);
      draw.drawImage(atlas[state.state],bone.part.col*64,bone.part.row*64,64,64,0,0,64,64);
    }else{
      draw.strokeStyle=state.state==='off'?'#353e48':TELEMETRY_COLOURS[state.state]??'#b7ada1';draw.fillStyle=draw.strokeStyle;
      draw.lineWidth=bone.key.startsWith('spine')?10:3;draw.lineCap='round';draw.beginPath();
      if(bone.key==='head'){draw.arc((bone.a.x+bone.b.x)/2,0,Math.abs(bone.b.x-bone.a.x)/2,0,Math.PI*2);draw.fill();}
      else{draw.moveTo(bone.a.x,bone.a.y);draw.lineTo(bone.b.x,bone.b.y);draw.stroke();}
    }
    draw.restore();
  }
  if(hatImages.has(hat)&&states.find(s=>s.key==='head')?.state!=='off'){draw.save();draw.transform(...bones.find(b=>b.key==='head').matrix);draw.drawImage(hatImages.get(hat),0,0,64,64);draw.restore();}
  card.portraitPaintKey=key;
}
