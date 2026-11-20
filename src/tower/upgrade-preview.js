// Horizontal static X-pose patient for the Tower modernization dialog.
// Same 4x4 atlas cells and transforms as the real rig; no special 3-D skin.
import {ROBOT_PARTS,skinMatrix} from '../render/robot-skin.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {towerUpgradeAtlas,towerUpgradeRarity,towerRaritySvgFilter} from './upgrade-appearance.js';
import {towerSurgerySiteLabel} from './surgery.js';
import {towerUpgradePose,towerPoseFit} from './upgrade-pose.js';
import {towerPatientAnatomy} from './anatomy.js';

const NS='http://www.w3.org/2000/svg';
const make=(name,attributes={},parent=null)=>{
 const node=document.createElementNS(NS,name);
 for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));
 parent?.appendChild(node);return node;
};
// Preserve standard thirteen sites for existing callers and UI tests.
export const TOWER_PATIENT_POSE=Object.freeze(towerUpgradePose(null));

const labelFor=site=>site==='head'?'Голова':
 site==='spine-0'?'Грудной сегмент':towerSurgerySiteLabel(site);
export function renderTowerUpgradePatient(target,patient,{
 selectedSite=null,availableSites=null,previewMutation=null,previewRarity=null,previewSurgery=null,previewReplaceSite=null,onSelect=null
}={}){
 target.replaceChildren();
 const svg=make('svg',{
  viewBox:'0 0 470 200',role:'group','aria-label':'Пациент на операционном столе, головой вправо',
  'data-tower-patient-pose':'horizontal',preserveAspectRatio:'xMidYMid meet'
 },target);
 // The artist-provided operating table replaces the vector plate, stripes and oval shadow.
 make('image',{
  href:assetUrl(ASSETS.textures.uiTable),
  x:5,y:5,width:460,height:190,
  preserveAspectRatio:'xMidYMid meet','aria-hidden':'true',
  'pointer-events':'none'
 },svg);
 // Keep the original softly rounded outer frame above the PNG texture.
 make('rect',{
  x:5,y:5,width:460,height:190,rx:18,
  fill:'none',stroke:'#80745a','stroke-width':1.5,
  'pointer-events':'none','aria-hidden':'true'
 },svg);
 const original=ASSETS.textures[['robotA','robotB','robotC','robotD'][(patient?.patient??0)%4]];
 const draft=previewSurgery?{...patient,surgeries:[...(patient?.surgeries??[]).filter(s=>s.site!==previewReplaceSite),previewSurgery]}:patient;
 const pose=towerUpgradePose(draft);
 const body=towerPatientAnatomy(draft);
 const prosthetics=new Set([...(patient?.prosthetics??[]),...(patient?.graftProsthetics??[])]);
 const anatomyLayer=make('g',{transform:towerPoseFit(pose),'data-upgrade-anatomy':'true'},svg);
 for(const [site,points] of Object.entries(pose)){
  const part=body?.skinParts?.[site]??ROBOT_PARTS[site];if(!part)continue;
  const [[ax,ay],[bx,by]]=points;
  const selectable=Array.isArray(availableSites)?availableSites.includes(site):true;
  const selected=site===selectedSite;
  const g=make('g',{
   'data-upgrade-site':site,'data-upgrade-selected':String(selected),
   'aria-label':labelFor(site)+(selectable?' — выбрать':' — недоступно'),
   'aria-disabled':String(!selectable),role:'button',tabindex:selectable?'0':'-1',
   transform:'matrix('+skinMatrix({x:ax,y:ay},{x:bx,y:by},part).join(' ')+')',
   class:'tower-upgrade-body-part'+(selected?' is-selected':'')+(selectable?' is-selectable':'')
  },anatomyLayer);
  const sprite=make('svg',{
   x:0,y:0,width:64,height:64,
   viewBox:`${part.col*64} ${part.row*64} 64 64`,
   overflow:'hidden',preserveAspectRatio:'none','aria-hidden':'true'
  },g);
  const replaced=towerUpgradeAtlas(patient,site,{previewSurgery,previewMutation});
  const rarity=replaced?towerUpgradeRarity(patient,site,{previewSurgery,previewMutation,previewRarity}):0;
  if(rarity)g.setAttribute('filter',towerRaritySvgFilter(svg,rarity));
  const path=replaced??(prosthetics.has(site)?ASSETS.textures.robotAndroid:original);
  make('image',{
   href:assetUrl(path),x:0,y:0,width:256,height:256,
   preserveAspectRatio:'none',style:'image-rendering:pixelated'
  },sprite);
  make('rect',{x:2,y:7,width:60,height:50,rx:6,
   fill:'transparent',stroke:'none','pointer-events':selectable?'all':'none'
  },g);
  make('title',{},g).textContent=site.includes('-graft-')?'Пересаженная '+(site.startsWith('arm-')?'рука':'нога'):labelFor(site);
  // A compact marker at the joint replaces the browser's huge transformed
  // SVG focus rectangle. The sprite itself stays unframed.
  if(selected){
   const [x,y]=points[0];
   make('circle',{cx:x,cy:y,r:6.5,class:'tower-upgrade-site-marker',
    'aria-hidden':'true','pointer-events':'none'},anatomyLayer);
  }
  if(selectable&&onSelect){
   g.addEventListener('click',()=>onSelect(site));
   g.addEventListener('keydown',e=>{
    if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(site);}
   });
  }
 }
 return svg;
}
