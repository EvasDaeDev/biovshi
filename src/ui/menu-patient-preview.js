// Main-menu patient preview. Reuses the Tower surgery pose, anatomy and
// per-segment atlas selection from combat and the Shelter. It is a decorative
// SVG view only: no robot physics, atlas copies or extra animation loop.
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {towerUpgradeAtlas,towerUpgradeRarity,towerRaritySvgFilter} from '../tower/upgrade-appearance.js';
import {towerPatientAnatomy} from '../tower/anatomy.js';
import {towerUpgradePose} from '../tower/upgrade-pose.js';
import {CONFIG} from '../config.js';

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
// Centimetres -> neutral pose units (the same scale as towerUpgradePose).
// Convert an upward screen-space displacement back through the -30deg
// display rotation before applying it to the unrotated skeleton.
const RAISED_CONTACT_CM=15;
const CONTACT_RISE=RAISED_CONTACT_CM*CONFIG.robot.scale*3.2;
const RAISED_CONTACT_OFFSET=[
 -Math.sin(ANGLE)*CONTACT_RISE,
 -Math.cos(ANGLE)*CONTACT_RISE
];
export function menuRaisedContactOffset(){return [...RAISED_CONTACT_OFFSET];}


// Find the joint of a two-bone chain while keeping its contact point fixed.
// Bend direction comes from the original drawing, so elbows and knees never flip.
export function solveMenuLimb(root,contact,upperLength,lowerLength,bendSign){
 const dx=contact[0]-root[0],dy=contact[1]-root[1];
 const distanceToContact=Math.hypot(dx,dy);
 const distanceSafe=Math.max(1e-6,distanceToContact);
 const along=(upperLength*upperLength-lowerLength*lowerLength+distanceSafe*distanceSafe)/(2*distanceSafe);
 const perpendicular=Math.sqrt(Math.max(0,upperLength*upperLength-along*along));
 const ux=dx/distanceSafe,uy=dy/distanceSafe;
 const joint=[root[0]+ux*along-uy*perpendicular*bendSign,
              root[1]+uy*along+ux*perpendicular*bendSign];
 return {joint,tip:[...contact]};
}

const menuStaticPose=run=>{
 const pose=towerUpgradePose(run);
 for(const site of Object.keys(pose)){
  const match=/^(arm|leg)-(-?1)(?:-graft(?:-\d+)?)?-upper$/.exec(site);
  if(!match)continue;
  const lowerKey=site.slice(0,-5)+'lower';
  const upper=pose[site],lower=pose[lowerKey];
  if(!lower)continue;
  const [,kind,sideText]=match,side=Number(sideText);
  const graft=site.includes('-graft');
  const spread=graft?(side<0?-7:7):0;
  const angles=kind==='arm'
   ?(side<0?[-151,-190]:[20,-4])
   :(side<0?[144,110]:[48,65]);
  const joint=polar(upper[0],distance(upper[0],upper[1]),angles[0]+spread);
  const tip=polar(joint,distance(lower[0],lower[1]),angles[1]+spread);
  pose[site]=[upper[0],joint];
  pose[lowerKey]=[joint,tip];
 }
 // Lift both feet and the right hand by 15 cm in displayed vertical space.
 // Surgical grafts on these limbs follow their corresponding contacts.
 // Solve both bones again instead of simply translating the extremities:
 // shoulder/hip roots and real atlas segment lengths remain unchanged.
 for(const site of Object.keys(pose)){
  const match=/^(arm|leg)-(-?1)(?:-graft(?:-\d+)?)?-upper$/.exec(site);
  if(!match)continue;
  const [,kind,sideText]=match;
  if(kind!=='leg'&&!(kind==='arm'&&Number(sideText)===1))continue;
  const lowerKey=site.slice(0,-5)+'lower';
  const upper=pose[site],lower=pose[lowerKey];
  if(!lower)continue;
  const root=upper[0],target=[
   lower[1][0]+RAISED_CONTACT_OFFSET[0],
   lower[1][1]+RAISED_CONTACT_OFFSET[1]
  ];
  const cross=(lower[1][0]-root[0])*(upper[1][1]-root[1])-
              (lower[1][1]-root[1])*(upper[1][0]-root[0]);
  const {joint,tip}=solveMenuLimb(root,target,
   distance(root,upper[1]),distance(lower[0],lower[1]),cross>=0?1:-1);
  pose[site]=[root,joint];
  pose[lowerKey]=[joint,tip];
 }
 return pose;
};

// The neutral pose defines immutable contacts for every hand/foot, including
// surgical grafts. Only the body and shoulders/hips move during idle.
export function menuPatientFramePose(base,phase=0){
 if(!phase)return base;
 const dx=Math.sin(phase)*1.8,dy=(1-Math.cos(phase))*0.8;
 const move=([x,y])=>[x+dx,y+dy];
 const pose={};
 for(const [site,points] of Object.entries(base)){
  if(site.startsWith('spine-')||site==='head')pose[site]=points.map(move);
 }
 for(const site of Object.keys(base)){
  if(!/^(arm|leg)-(-?1)(?:-graft(?:-\d+)?)?-upper$/.test(site))continue;
  const lowerKey=site.slice(0,-5)+'lower';
  const upper=base[site],lower=base[lowerKey];
  if(!lower)continue;
  const root=move(upper[0]),contact=lower[1];
  const upperLength=distance(upper[0],upper[1]);
  const lowerLength=distance(lower[0],lower[1]);
  const cross=(contact[0]-upper[0][0])*(upper[1][1]-upper[0][1])-
              (contact[1]-upper[0][1])*(upper[1][0]-upper[0][0]);
  const sign=cross>=0?1:-1;
  const {joint,tip}=solveMenuLimb(root,contact,upperLength,lowerLength,sign);
  pose[site]=[root,joint];
  pose[lowerKey]=[joint,tip];
 }
 return pose;
}

export function menuPatientPose(run,phase=0){
 return menuPatientFramePose(menuStaticPose(run),phase);
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

// A single menu preview owns at most one animation frame. The static SVG and
// atlas image elements are created once; animation only updates 2D transforms.
let idleState=null;
export function stopMenuPatientIdle(){
 if(idleState?.raf!=null&&typeof cancelAnimationFrame==='function')
  cancelAnimationFrame(idleState.raf);
 idleState=null;
}

export function startMenuPatientIdle(target,menu){
 if(typeof requestAnimationFrame!=='function'||!target||!menu||menu.hidden||target.hidden)return;
 if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 if(!idleState||idleState.target!==target)return;
 if(idleState.raf!=null)return;
 const state=idleState;
 const tick=now=>{
  state.raf=null;
  if(idleState!==state||menu.hidden||target.hidden||!target.isConnected){
   if(idleState===state)idleState=null;
   return;
  }
  // ~25 fps is sufficient for a subtle idle, with no new images or SVG nodes.
  if(now-state.lastFrame>=40){
   state.lastFrame=now;
   const frame=menuPatientFramePose(state.pose,(now-state.started)/1000*1.35);
   for(const [site,node] of state.nodes){
    const points=frame[site],part=state.parts.get(site);
    if(!points)continue;
    const [[ax,ay],[bx,by]]=points;
    node.setAttribute('transform','matrix('+skinMatrix({x:ax,y:ay},{x:bx,y:by},part).join(' ')+')');
   }
  }
  state.raf=requestAnimationFrame(tick);
 };
 state.raf=requestAnimationFrame(tick);
}

export function renderMenuPatient(target,run){
 stopMenuPatientIdle();
 target.replaceChildren();
 if(!run){target.hidden=true;return null;}
 target.hidden=false;
 const svg=make('svg',{
  viewBox:`0 0 ${WIDTH} ${HEIGHT}`,preserveAspectRatio:'xMidYMid meet',
  role:'img','aria-label':'Текущий пациент с установленными модификациями и хирургией',
  'data-menu-patient':'true'
 },target);
 const pose=menuPatientPose(run);
 const nodes=new Map(),parts=new Map();
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
  nodes.set(site,group);parts.set(site,part);
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
 idleState={target,pose,nodes,parts,started:performance.now(),lastFrame:-Infinity,raf:null};
 return svg;
}
