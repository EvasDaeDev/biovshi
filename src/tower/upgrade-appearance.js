// Per-segment replacement atlases for Tower upgrades. PNGs are artistic
// placeholders copied from ar_01.png. Replacing them changes BOTH the arena
// patient and the horizontal preparation preview, with no save-format changes.
import {TOWER_MUTATIONS} from './mutations.js';
import {TOWER_SURGERY_OPERATIONS} from './surgery.js';

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
 Object.keys(TOWER_SURGERY_OPERATIONS).map(id=>[id,ROOT+'ar_surg_'+id+'.png'])
));
export const TOWER_MUTATION_ATLAS=Object.freeze(Object.fromEntries(
 Object.keys(TOWER_MUTATIONS).map(id=>[id,ROOT+'ar_mod_'+id+'.png'])
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
 if(previewMutation&&towerUpgradeApplies(previewMutation,site))
  return TOWER_MUTATION_ATLAS[previewMutation]??null;
 for(const id of patient?.mutations??[])
  if(towerUpgradeApplies(id,site))return TOWER_MUTATION_ATLAS[id]??null;
 return null;
}
