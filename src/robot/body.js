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
