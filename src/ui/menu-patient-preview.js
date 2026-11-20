// Main-menu patient preview. Reuses the Tower surgery pose, anatomy and
// per-segment atlas selection from combat and the Shelter. It is a decorative
// SVG view only: no robot physics, atlas copies or extra animation loop.
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {towerUpgradeAtlas,towerUpgradeRarity,towerRaritySvgFilter} from '../tower/upgrade-appearance.js';
import {towerPatientAnatomy} from '../tower/anatomy.js';
import {towerUpgradePose} from '../tower/upgrade-pose.js';

const NS='http://www.w3.org/2000/svg';
const WIDTH=190,HEIGHT=104,ANGLE=-Math.PI/6;
const make=(tag,attrs={},parent)=>{
 const node=document.createElementNS(NS,tag);
 for(const [name,value] of Object.entries(attrs))node.setAttribute(name,String(value));
 parent?.append(node);
 return node;
};

// Display-only relaxed pose, calibrated against the menu silhouette sketch.
// The torso, head, graft anchors and bone lengths come from the actual rig.
// Only the direction of limb bones changes; surgery does not lose segments.
const deg=value=>value*Math.PI/180;
const polar=(point,length,angle)=>[
 point[0]+Math.cos(deg(angle)-ANGLE)*length,
 point[1]+Math.sin(deg(angle)-ANGLE)*length
];
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);

export function menuPatientPose(run){
 const pose=towerUpgradePose(run);
 for(const site of Object.keys(pose)){
  const match=/^(arm|leg)-(-?1)(?:-graft(?:-\\d+)?)?-upper$/.exec(site);
  if(!match)continue;
  const lowerKey=site.slice(0,-5)+'lower';
  const upper=pose[site],lower=pose[lowerKey];
  if(!lower)continue;
  const [,kind,sideText]=match,side=Number(sideText);
  const graft=site.includes('-graft');
  const spread=graft?(side<0?-7:7):0;
  // Left arm reaches upward-left, right arm extends outward. Legs open
  // downward to either side, reproducing the asymmetrical sketch pose.
  const angles=kind==='arm'
   ?(side<0?[-151,-190]:[20,-4])
   :(side<0?[144,110]:[48,65]);
  const joint=polar(upper[0],distance(upper[0],upper[1]),angles[0]+spread);
  const tip=polar(joint,distance(lower[0],lower[1]),angles[1]+spread);
  pose[site]=[upper[0],joint];
  pose[lowerKey]=[joint,tip];
 }
 return pose;
}

// Rotate the existing horizontal neutral pose into the tilted display pose;
// keep graft attachment points and lengths as defined by the real anatomy.
export function menuPatientTransform(pose){
 const points=Object.values(pose).flat();
 if(!points.length)return 'translate(0 0) scale(1)';
 const cos=Math.cos(ANGLE),sin=Math.sin(ANGLE);
 const rotated=points.map(([x,y])=>[x*cos-y*sin,x*sin+y*cos]);
 const xs=rotated.map(p=>p[0]),ys=rotated.map(p=>p[1]);
 const minX=Math.min(...xs)-11,maxX=Math.max(...xs)+11;
 const minY=Math.min(...ys)-11,maxY=Math.max(...ys)+11;
 const scale=Math.min((WIDTH-8)/(maxX-minX),(HEIGHT-6)/(maxY-minY));
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
 const pose=menuPatientPose(run);
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
