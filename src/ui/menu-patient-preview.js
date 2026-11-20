// Main-menu patient preview. Reuses the Tower surgery pose, anatomy and
// per-segment atlas selection from combat and the Shelter. It is a decorative
// SVG view only: no robot physics, atlas copies or extra animation loop.
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {towerUpgradeAtlas,towerUpgradeRarity,towerRaritySvgFilter} from '../tower/upgrade-appearance.js';
import {towerPatientAnatomy} from '../tower/anatomy.js';
import {towerUpgradePose} from '../tower/upgrade-pose.js';

const NS='http://www.w3.org/2000/svg';
const WIDTH=160,HEIGHT=90,ANGLE=-Math.PI/3.2;
const make=(tag,attrs={},parent)=>{
 const node=document.createElementNS(NS,tag);
 for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
 parent?.append(node);
 return node;
};

// Rotate the existing horizontal neutral pose into the tilted display pose;
// keep graft attachment points and lengths as defined by the real anatomy.
export function menuPatientTransform(pose){
 const points=Object.values(pose).flat();
 if(!points.length)return 'translate(0 0) scale(1)';
 const cos=Math.cos(ANGLE),sin=Math.sin(ANGLE);
 const rotated=points.map(([x,y])=>[x*cos-y*sin,x*sin+y*cos]);
 const xs=rotated.map(p=>p[0]),ys=rotated.map(p=>p[1]);
 const minX=Math.min(...xs)-12,maxX=Math.max(...xs)+12;
 const minY=Math.min(...ys)-12,maxY=Math.max(...ys)+12;
 const scale=Math.min((WIDTH-12)/(maxX-minX),(HEIGHT-10)/(maxY-minY));
 const x=WIDTH/2-scale*(minX+maxX)/2;
 const y=HEIGHT/2-scale*(minY+maxY)/2;
 return `translate(${x} ${y}) scale(${scale}) rotate(${ANGLE*180/Math.PI})`;
}

export function renderMenuPatient(target,run){
 target.replaceChildren();
 if(!run){target.hidden=true;return null;}
 target.hidden=false;
 const svg=make('svg',{
  viewBox:`0 0 ${WIDTH} ${HEIGHT}`,preserveAspectRatio:'xMidYMid meet',
  role:'img','aria-label':'Текущий пациент с установленными модификациями и хирургией',
  'data-menu-patient':'true'
 },target);
 const pose=towerUpgradePose(run);
 const body=towerPatientAnatomy(run);
 const prosthetics=new Set([...(run.prosthetics??[]),...(run.graftProsthetics??[])]);
 const original=ASSETS.textures[['robotA','robotB','robotC','robotD'][(run.patient??0)%4]];
 const fitter=make('g',{transform:menuPatientTransform(pose)},svg);
 const idle=make('g',{class:'menu-patient-idle'},fitter);
 // Grafts follow their original corresponding limb pose, not separate
 // synthetic limbs. Draw limbs below the spine/head, preserving a legible body.
 const entries=Object.entries(pose).sort(([a],[b])=>{
  const layer=key=>key.startsWith('arm-')||key.startsWith('leg-')?0:key.startsWith('spine-')?1:2;
  return layer(a)-layer(b);
 });
 for(const [site,points] of entries){
  const part=body?.skinParts?.[site]??ROBOT_PARTS[site];
  if(!part)continue;
  const [[ax,ay],[bx,by]]=points;
  const group=make('g',{
   'data-menu-site':site,
   transform:'matrix('+skinMatrix({x:ax,y:ay},{x:bx,y:by},part).join(' ')+')'
  },idle);
  const atlas=towerUpgradeAtlas(run,site);
  const rarity=atlas?towerUpgradeRarity(run,site):0;
  if(rarity)group.setAttribute('filter',towerRaritySvgFilter(svg,rarity));
  const cell=make('svg',{
   x:0,y:0,width:64,height:64,viewBox:`${part.col*64} ${part.row*64} 64 64`,
   overflow:'hidden',preserveAspectRatio:'none'
  },group);
  make('image',{
   href:assetUrl(atlas??(prosthetics.has(site)?ASSETS.textures.robotAndroid:original)),
   x:0,y:0,width:256,height:256,preserveAspectRatio:'none',
   style:'image-rendering:pixelated'
  },cell);
 }
 return svg;
}
