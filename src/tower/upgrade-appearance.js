// Per-segment replacement atlases for Tower upgrades. PNGs are artistic
// placeholders copied from ar_01.png. Replacing them changes BOTH the arena
// patient and the horizontal preparation preview, with no save-format changes.
import {towerInstalledItems} from './mutations.js';
import {towerRarityMatrix} from './rarity-tint.js';
export {towerRarityMatrix} from './rarity-tint.js';

const ROOT='assets/textures/robots/upgrades/';
export const TOWER_UPGRADE_PARTS=Object.freeze({
 turbo:['leg','spine-3'],
 servo:['arm','leg'],
 piston:['arm'],
 adrenal:['spine'],
 predator:['arm'],
 instinct:['head','spine-0'],
 flywheel:['spine-1','spine-2','spine-3','arm-upper'],
 gyro:['spine'],
 spike:['arm'],
 sinews:['arm','leg'],
 ossify:['spine','arm'],
 twitch:['arm','leg'],
 optic:['head','spine-0'],
 synapse:['head','spine'],
 focus:['head','arm-lower'],
 metronome:['spine'],
 alarm:['head','spine-0'],
 quiet:['head','spine-0','spine-1']
});
export const TOWER_SURGERY_ATLAS=Object.freeze(Object.fromEntries(
 ['brace','alignment','drive','impact','reflex'].map(id=>[id,ROOT+'ar_surg_'+id+'.png'])
));
export const TOWER_MUTATION_ATLAS=Object.freeze(Object.fromEntries(
 Object.keys(TOWER_UPGRADE_PARTS).map(id=>[id,ROOT+'ar_mod_'+id+'.png'])
));
export function towerUpgradeApplies(id,site){
 const patterns=TOWER_UPGRADE_PARTS[id];
 if(!patterns||typeof site!=='string')return false;
 return patterns.some(pattern=>
  pattern==='arm'&&site.startsWith('arm-')||
  pattern==='leg'&&site.startsWith('leg-')||
  pattern==='spine'&&site.startsWith('spine-')||
  pattern==='arm-upper'&&site.startsWith('arm-')&&site.endsWith('-upper')||
  pattern==='arm-lower'&&site.startsWith('arm-')&&site.endsWith('-lower')||
  pattern===site
 );
}
// Assign a stable, pseudo-random-looking mosaic of eligible atlases across
// anatomical cells. Each surgery and each equipped mutation is a candidate;
// no improvement has blanket priority over another at an overlapping site.
// The choice is derived from the upgrade set and cell, not Math.random(), so
// previews, arena sprites and detached pieces agree between redraws/reloads.
const hashString=value=>{
 let hash=2166136261;
 for(let i=0;i<value.length;i++)hash=Math.imul(hash^value.charCodeAt(i),16777619);
 return hash>>>0;
};
const segmentIndex=site=>{
 if(site.startsWith('spine-'))return Number(site.slice(6))||0;
 const match=/^(arm|leg)-(-?1)(?:-graft-(\d+))?-(upper|lower)$/.exec(site);
 if(!match)return 0;
 const [,kind,side,graft,part]=match;
 // Paired upper/lower cells are deliberately given different slots.
 return (graft?Number(graft)*4:0)+(side==='1'?2:0)+(part==='lower'?1:0);
};
export function towerUpgradeVisual(patient,site,{previewSurgery=null,previewMutation=null,previewRarity=null}={}){
 // Segmented equipment owns its exact cell. The old mosaic is retained only
 // for pre-migration whole-kit equipment and unoccupied atlas previews.
 const equipped=(patient?.segmentInventory??[]).find(item=>item.site===site&&
  (patient?.equippedSegments??[]).includes(item.id));
 if(equipped&&previewSurgery?.site!==site){
  return {atlas:TOWER_MUTATION_ATLAS[equipped.type]??null,rarity:equipped.rarity};
 }
 const candidates=[];
 for(const op of patient?.surgeries??[]){
  if(op.site===site&&TOWER_SURGERY_ATLAS[op.procedure]&&op.site!==previewSurgery?.site)
   candidates.push({key:'surgery:'+op.procedure,atlas:TOWER_SURGERY_ATLAS[op.procedure],rarity:0});
 }
 if(previewSurgery?.site===site&&TOWER_SURGERY_ATLAS[previewSurgery.procedure])
  candidates.push({key:'surgery:'+previewSurgery.procedure,atlas:TOWER_SURGERY_ATLAS[previewSurgery.procedure],rarity:0});
 const installed=towerInstalledItems(patient);
 for(const type of new Set([...(patient?.mutations??[]),...installed.map(item=>item.type)])){
  if(!towerUpgradeApplies(type,site)||!TOWER_MUTATION_ATLAS[type])continue;
  const item=installed.find(entry=>entry.type===type);
  candidates.push({key:'mutation:'+type,atlas:TOWER_MUTATION_ATLAS[type],
   rarity:item?.rarity??0});
 }
 if(previewMutation&&towerUpgradeApplies(previewMutation,site)&&TOWER_MUTATION_ATLAS[previewMutation]){
  const previous=candidates.findIndex(item=>item.key==='mutation:'+previewMutation);
  if(previous>=0)candidates.splice(previous,1);
  candidates.push({key:'mutation:'+previewMutation,atlas:TOWER_MUTATION_ATLAS[previewMutation],
   rarity:previewRarity??installed.find(item=>item.type===previewMutation)?.rarity??patient?.mutationDraft?.rarity??0});
 }
 // An operation modifies one actual anatomical segment. Keep its own
 // implant visible; distribute competing mutations over the other cells.
 // This prevents a surgery from becoming visually invisible.
 const operated=candidates.find(item=>item.key.startsWith('surgery:'));
 if(operated)return {atlas:operated.atlas,rarity:0};
 if(!candidates.length)return {atlas:null,rarity:0};
 candidates.sort((a,b)=>a.key.localeCompare(b.key,'en'));
 const identity=candidates.map(item=>item.key).join('|');
 // All four standard limb cells share the same candidate-set rotation.
 // That gives both overlapping sets visible cells instead of allowing one
 // atlas to win every cell by chance. Extra graft limbs use the same rule.
 const rotation=hashString(identity)%candidates.length;
 const selected=candidates[(rotation+segmentIndex(site))%candidates.length];
 return {atlas:selected.atlas,rarity:selected.rarity};
}
export function towerUpgradeAtlas(patient,site,options={}){
 return towerUpgradeVisual(patient,site,options).atlas;
}
// Rarity tint always belongs to the atlas actually selected for this cell.
export function towerUpgradeRarity(patient,site,options={}){
 return towerUpgradeVisual(patient,site,options).rarity;
}
const filters=new WeakMap();let serial=0;
export function towerRaritySvgFilter(root,rank){
 const matrix=towerRarityMatrix(rank);if(!matrix)return null;
 let perRoot=filters.get(root);
 if(!perRoot){perRoot=new Map();filters.set(root,perRoot);}
 if(perRoot.has(rank))return 'url(#'+perRoot.get(rank)+')';
 const ns='http://www.w3.org/2000/svg',defs=root.querySelector(':scope > defs')??root.insertBefore(root.ownerDocument.createElementNS(ns,'defs'),root.firstChild);
 const node=root.ownerDocument.createElementNS(ns,'filter');const id='tower-rarity-'+(++serial);
 node.setAttribute('id',id);node.setAttribute('color-interpolation-filters','sRGB');
 const tint=root.ownerDocument.createElementNS(ns,'feColorMatrix');
 tint.setAttribute('type','matrix');tint.setAttribute('values',matrix.join(' '));
 node.append(tint);defs.append(node);perRoot.set(rank,id);return 'url(#'+id+')';
}
