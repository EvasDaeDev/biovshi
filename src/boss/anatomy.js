import {standardLimbs,bodySegments,bodyParents} from '../robot/body.js';
import {BOSS_CONFIG,BOSS_VARIANTS} from './config.js';
export function bossAnatomy(variantId){
 const variant=BOSS_VARIANTS.find(v=>v.id===variantId)??BOSS_VARIANTS[0];
 const limbs=standardLimbs();
 if(variant.extra)for(const side of [-1,1])limbs.push({kind:variant.extra,side,key:`${variant.extra}-${side}-pair2`,anchor:variant.extraAnchor??(variant.extra==='arm'?2:3)});
 const spineSegments=variant.spineSegments,pelvisKey=`spine-${spineSegments-1}`;
 return {isBoss:true,headOffset:BOSS_CONFIG.headOffset,headSizeFactor:BOSS_CONFIG.headScale/BOSS_CONFIG.scale,variant,limbs,spineSegments,pelvisKey,segments:bodySegments(spineSegments,limbs),parent:bodyParents(spineSegments,limbs),
  maxHp:key=>key==='head'?6*BOSS_CONFIG.healthMultiplier:key===pelvisKey?4*BOSS_CONFIG.healthMultiplier:BOSS_CONFIG.segmentHp};
}
// Keep the existing blood-loss countdown, but its terminal state is death.
export function destroyFromBloodLoss(state){
 if(!state.mobile()||state.movementLimbs()>0)return false;
 state.bledOut=true;state.knockoutCause='blood-loss';state.finishMobility('погиб');state.api.capsules=state.makeCapsules();return true;
}
