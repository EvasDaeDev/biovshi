// Horizontal static X-pose patient for the Tower modernization dialog.
// Same 4x4 atlas cells and transforms as the real rig; no special 3-D skin.
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {towerUpgradeAtlas} from './upgrade-appearance.js';
import {towerSurgerySiteLabel} from './surgery.js';

const NS='http://www.w3.org/2000/svg';
const make=(name,attributes={},parent=null)=>{
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
 parent?.appendChild(node);return node;
};
// Keep static anatomy proportional to combat kinematics: game uses
// vertebraBaseCm * robot.scale, 27/29 * scale for arms and 32/33 for legs.
// Only the overall preview zoom differs, never the size of individual parts.
import {CONFIG} from '../config.js';
const PREVIEW_ZOOM=3.2;
const boneScale=CONFIG.robot.scale*PREVIEW_ZOOM;
const spineStep=CONFIG.robot.vertebraBaseCm*boneScale;
const armUpper=27*boneScale,armLower=29*boneScale;
const legUpper=32*boneScale,legLower=33*boneScale;
const point=(x,y,dx,dy,len)=>[x+dx*len,y+dy*len];
const chest=[290,100],neck=[chest[0]+20*boneScale,100];
const spine=Array.from({length:5},(_,i)=>[chest[0]-spineStep*i,100]);
const pose={};
for(let i=0;i<4;i++)pose['spine-'+i]=[spine[i],spine[i+1]];
pose.head=[[neck[0]+10*boneScale,100],[neck[0]-10*boneScale,100]];
for(const side of [-1,1]){
 const armJoint=point(...chest,.58,side*.814616,armUpper);
 const armTip=point(...armJoint,.74,side*.672607,armLower);
 pose['arm-'+side+'-upper']=[chest,armJoint];
 pose['arm-'+side+'-lower']=[armJoint,armTip];
 const hip=spine[4];
 const knee=point(...hip,-.75,side*.661438,legUpper);
 const foot=point(...knee,-.8,side*.6,legLower);
 pose['leg-'+side+'-upper']=[hip,knee];
 pose['leg-'+side+'-lower']=[knee,foot];
}
export const TOWER_PATIENT_POSE=Object.freeze(pose);

const labelFor=site=>site==='head'?'Голова':
 site==='spine-0'?'Грудной сегмент':towerSurgerySiteLabel(site);
export function renderTowerUpgradePatient(target,patient,{
 selectedSite=null,availableSites=null,previewMutation=null,previewSurgery=null,onSelect=null
}={}){
 target.replaceChildren();
 const svg=make('svg',{
  viewBox:'0 0 470 200',role:'group','aria-label':'Пациент на операционном столе, головой вправо',
  'data-tower-patient-pose':'horizontal',preserveAspectRatio:'xMidYMid meet'
 },target);
 make('rect',{x:5,y:5,width:460,height:190,rx:18,fill:'#25281f',stroke:'#80745a','stroke-width':1.5},svg);
 make('rect',{x:18,y:16,width:434,height:168,rx:12,fill:'#34382d',stroke:'#505645','stroke-width':1},svg);
 for(const x of [83,190,310,415])
  make('path',{d:`M${x} 18v164`,stroke:'#5f5c49','stroke-opacity':'.24','stroke-width':1},svg);
 // A subdued shadow holds the body against the table, not a spotlight.
 make('ellipse',{cx:248,cy:103,rx:168,ry:31,fill:'#0b0c0a',opacity:.42},svg);
 const original=ASSETS.textures[['robotA','robotB','robotC','robotD'][(patient?.patient??0)%4]];
 const prosthetics=new Set(patient?.prosthetics??[]);
 for(const [site,points] of Object.entries(TOWER_PATIENT_POSE)){
  const part=ROBOT_PARTS[site];if(!part)continue;
  const [[ax,ay],[bx,by]]=points;
  const selectable=Array.isArray(availableSites)?availableSites.includes(site):true;
  const selected=site===selectedSite;
  const g=make('g',{
   'data-upgrade-site':site,'data-upgrade-selected':String(selected),
   'aria-label':labelFor(site)+(selectable?' — выбрать':' — недоступно'),
   'aria-disabled':String(!selectable),role:'button',tabindex:selectable?'0':'-1',
   transform:'matrix('+skinMatrix({x:ax,y:ay},{x:bx,y:by},part).join(' ')+')',
   class:'tower-upgrade-body-part'+(selected?' is-selected':'')+(selectable?' is-selectable':'')
  },svg);
  const sprite=make('svg',{
   x:0,y:0,width:64,height:64,
   viewBox:`${part.col*64} ${part.row*64} 64 64`,
   overflow:'hidden',preserveAspectRatio:'none','aria-hidden':'true'
  },g);
  const replaced=towerUpgradeAtlas(patient,site,{previewSurgery,previewMutation});
  const path=replaced??(prosthetics.has(site)?ASSETS.textures.robotAndroid:original);
  make('image',{
   href:assetUrl(path),x:0,y:0,width:256,height:256,
   preserveAspectRatio:'none',style:'image-rendering:pixelated'
  },sprite);
  make('rect',{x:2,y:7,width:60,height:50,rx:6,
   fill:'transparent',stroke:'none','pointer-events':selectable?'all':'none'
  },g);
  make('title',{},g).textContent=labelFor(site);
  if(selectable&&onSelect){
   g.addEventListener('click',()=>onSelect(site));
   g.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(site);}
   });
  }
 }
 return svg;
}
