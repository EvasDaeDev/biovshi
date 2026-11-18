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
// Priority: the operation implanted INTO this exact piece, then the first
// installed mutation that covers it. Later mutations still grant all of their
// gameplay bonuses even if an earlier mutation owns this sprite slot.
export function towerUpgradeAtlas(patient,site,{previewSurgery=null,previewMutation=null}={}){
 const surgery=previewSurgery?.site===site?previewSurgery:
  (patient?.surgeries??[]).find(op=>op.site===site);
 if(surgery&&TOWER_SURGERY_ATLAS[surgery.procedure])
  return TOWER_SURGERY_ATLAS[surgery.procedure];
 // A newly owned version of the same module uses its prospective rarity,
 // while other already installed modules retain their original sprite priority.
 const installed=(patient?.mutations??[]).find(id=>towerUpgradeApplies(id,site));
 if(previewMutation&&towerUpgradeApplies(previewMutation,site)&&(!installed||installed===previewMutation))
  return TOWER_MUTATION_ATLAS[previewMutation]??null;
 if(installed)return TOWER_MUTATION_ATLAS[installed]??null;
 // A hovered/pending module only fills free sprite slots; it does not
 // hide an earlier installed module that will remain visible after purchase.
 if(previewMutation&&towerUpgradeApplies(previewMutation,site))
  return TOWER_MUTATION_ATLAS[previewMutation]??null;
 return null;
}

// Visual-only rarity tint: 80% of the original RGB + 20% of rarity colour.
// Combat skills retain their existing values until the balance model is approved.
export function towerUpgradeRarity(patient,site,{previewMutation=null,previewRarity=null,previewSurgery=null}={}){
 if(previewSurgery?.site===site&&TOWER_SURGERY_ATLAS[previewSurgery.procedure]||
  (patient?.surgeries??[]).some(op=>op.site===site&&TOWER_SURGERY_ATLAS[op.procedure]))return 0;
 const module=towerInstalledItems(patient).find(item=>towerUpgradeApplies(item.type,site));
 if(previewMutation&&towerUpgradeApplies(previewMutation,site)&&(!module||module.type===previewMutation))
  return previewRarity??patient?.mutationDraft?.rarity??0;
 if(module)return module.rarity;
 return 0;
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
