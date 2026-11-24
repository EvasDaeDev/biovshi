import {resolvePatron} from '../garage/model.js';

// The totalizator uses array positions as player IDs. Keep them contiguous
// while preserving the stable keys used by each player's saved arena floors.
export function removeProfile(session,id){
 const player=session.players[id];
 if(!player||session.phase==='running')throw Error('Профиль сейчас нельзя удалить.');
 const remap=index=>index===id?null:index>id?index-1:index;
 session.players.forEach(p=>{p.floorKey??=String(p.id);});
 session.players.splice(id,1);
 session.players.forEach((p,index)=>{p.id=index;});
 session.retiredProfiles=(session.retiredProfiles??0)+1;
 session.retiredBalance=(session.retiredBalance??0)+player.balance;
 delete session.towers[id];
 session.towers=Object.fromEntries(Object.entries(session.towers).map(([key,tower])=>[remap(Number(key)),tower]));
 session.bets=session.bets.filter(bet=>bet.player!==id).map(bet=>({...bet,player:remap(bet.player)}));
 for(const patient of session.garage){
  const investments=patient.investments;
  delete investments[id];
  patient.investments=Object.fromEntries(Object.entries(investments).map(([key,amount])=>[remap(Number(key)),amount]));
  if(patient.head?.player!=null)patient.head.player=remap(patient.head.player);
  if(patient.patron!=null)patient.patron=remap(patient.patron);
  patient.patron=resolvePatron(patient);
 }
 session.towerPlayerId=remap(session.towerPlayerId??0)??Math.min(id,session.players.length-1);
}
