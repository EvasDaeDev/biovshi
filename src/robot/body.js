// Shared rig vocabulary. Boss-specific profiles live in ../boss/.
export const limbKey=limb=>limb.key??`${limb.kind}-${limb.side}`;
export const standardLimbs=()=>[-1,1].flatMap(side=>['arm','leg'].map(kind=>({kind,side,key:`${kind}-${side}`})));
export function bodySegments(spineSegments,limbs){
 return ['head',...Array.from({length:spineSegments},(_,i)=>`spine-${i}`),...['arm','leg'].flatMap(kind=>limbs.filter(l=>l.kind===kind)).flatMap(l=>['upper','lower'].map(part=>`${limbKey(l)}-${part}`))];
}
export function bodyParents(spineSegments,limbs){
 const parent=new Map([['spine-0',null],['head',null]]);
 for(let i=1;i<spineSegments;i++)parent.set(`spine-${i}`,`spine-${i-1}`);
 for(const l of limbs){const key=limbKey(l);parent.set(key+'-upper',l.anchor!==undefined?`spine-${Math.min(l.anchor,spineSegments-1)}`:l.kind==='arm'?null:`spine-${spineSegments-1}`);parent.set(key+'-lower',key+'-upper');}
 return parent;
}

// Atlas rig coordinates are in body units, before CONFIG.robot.scale.
// The calibrated neutral limb determines both IK segment lengths.
function calibratedLimb(root,joint,rest){
 const span=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 return {root,rest,lengths:[span(root,joint),span(joint,rest)]};
}
export const PATIENT_HEAD_OFFSET=22;
const patientLimbs={
 arm:calibratedLimb([0,12],[5.129991306170663,41.91585289444935],[40,26]),
 leg:calibratedLimb([-5,12],[2,44],[-34,32])
};
const originalLimbs={
 arm:{root:[3,15],rest:[30,27],graftRest:[30,35],lengths:[27,29]},
 leg:{root:[-5,12],rest:[-28,31],graftRest:[-28,40],lengths:[32,33]}
};
export function limbRig(body,limb){
 return (body?.isBoss||limb.anchor!==undefined?originalLimbs:patientLimbs)[limb.kind];
}
