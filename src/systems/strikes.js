import {ctx} from '../game/state.js';

// A patient's attack cycle has a primary strike and at most one simultaneous
// strike at another opponent. Keeping them together makes resets atomic.
export function pendingStrikes(id){
 const first=ctx.combat.pending[id];
 return first?(first.secondary?[first,first.secondary]:[first]):[];
}
export function setPendingStrikes(id,strikes){
 const [first,second]=strikes;
 if(first){delete first.secondary;if(second)first.secondary=second;}
 ctx.combat.pending[id]=first??null;
}
export function cancelStrikesAgainst(victim){
 ctx.combat.pending.forEach((_,id)=>setPendingStrikes(id,pendingStrikes(id).filter(p=>p.victim!==victim)));
}
