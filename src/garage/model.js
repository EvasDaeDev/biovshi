export const BASE_STATS = [3,3,3];
export const HATS = [1,2,3,4];
export function validStats(stats) {
  return Array.isArray(stats)&&stats.length===3&&stats.every(n=>Number.isInteger(n)&&n>=2&&n<=4)&&stats.reduce((a,b)=>a+b,0)===9&&stats.filter(n=>n===3).length>=1;
}
export function newGarage(){return Array.from({length:4},()=>({stats:[3,3,3],head:null,investments:{},patron:null}));}
export function statMultiplier(points){return 1+(points-3)*.2;}
export function critChance(points){return (points-2)*.15;}
export function nextPrice(slot){return slot?slot.price+Math.ceil(slot.price/10):10;}
export function buyHat(session,patient,player,hat,price){
  if(session.phase!=='betting')throw Error('Покупки доступны до ставок.');
  normalizePatronage(session);
  const target=session.garage?.[patient],buyer=session.players[player];
  if(!target||!buyer||!HATS.includes(hat)||!Number.isSafeInteger(price)||price<nextPrice(target.head)||price>buyer.balance)throw Error('Проверьте цену и баланс игрока.');
  buyer.balance-=price;session.shopSpent=(session.shopSpent??0)+price;
  target.head={hat,price,player};
  target.investments[player]=(target.investments[player]??0)+price;
  target.patron=resolvePatron(target);
}

export function resolvePatron(patient){
  const entries=Object.entries(patient.investments??{}),max=Math.max(0,...entries.map(([,sum])=>sum));
  if(!max)return null;
  if(patient.patron!==null&&patient.investments?.[patient.patron]===max)return Number(patient.patron);
  return Number(entries.find(([,sum])=>sum===max)[0]);
}
export function normalizePatronage(session){
  for(const patient of session.garage??[]){
    if(!patient.investments){patient.investments={};if(patient.head)patient.investments[patient.head.player]=patient.head.price;}
    patient.patron=resolvePatron(patient);
  }
}
export function setPatientStats(session,patientId,editor,stats){
  const patient=session.garage?.[patientId];
  if(session.phase!=='betting'||!patient||!session.players[editor]||!validStats(stats))throw Error('Настройка доступна перед ставками: один перенос очка.');
  const patron=resolvePatron(patient);
  if(patron!==null&&patron!==editor)throw Error('Настраивать пациента может только его покровитель.');
  patient.stats=[...stats];
}
