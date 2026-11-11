export const BASE_STATS = [3,3,3];
export const HATS = [1,2,3,4];
export function earnedStats(wins=0) {
  const n=Math.max(0,Math.floor(wins));
  return BASE_STATS.map((base,i)=>base+Math.floor((n+2-[1,0,2][i])/3));
}
export function validStats(stats, wins=0) {
  const base=earnedStats(wins);
  if(!Array.isArray(stats)||stats.length!==3||!stats.every(n=>Number.isInteger(n)&&n>=2))return false;
  const delta=stats.map((n,i)=>n-base[i]);
  return delta.every(n=>Math.abs(n)<=1)&&delta.reduce((a,b)=>a+b,0)===0;
}
// The standard selector moves one point automatically and keeps the earned total.
export function redistributeStat(patient,index,value){
  const base=earnedStats(patient.wins),stats=[...base];
  if(!Number.isInteger(index)||index<0||index>2||!Number.isInteger(value))throw Error('Некорректный навык.');
  if(value!==base[index]){
    let other=patient.stats.findIndex((n,j)=>j!==index&&n===base[j]+(base[index]-value));
    if(other<0)other=patient.stats.findIndex((n,j)=>j!==index&&n===base[j]);
    if(other<0)other=(index+1)%3;
    if(base[other]+base[index]-value<2)other=[0,1,2].find(j=>j!==index&&base[j]+base[index]-value>=2)??other;
    stats[index]=value;stats[other]+=base[index]-value;
  }
  if(!validStats(stats,patient.wins))throw Error('Можно перенести одно очко между навыками.');
  return stats;
}
export function normalizePatient(patient) {
  patient.wins=Number.isSafeInteger(patient.wins)&&patient.wins>=0?patient.wins:0;
  if(!validStats(patient.stats,patient.wins))patient.stats=earnedStats(patient.wins);
  return patient;
}
export function patientVictory(patient) {
  normalizePatient(patient);
  patient.wins++;
  const next=earnedStats(patient.wins);
  const old=earnedStats(patient.wins-1);
  patient.stats=patient.stats.map((n,i)=>n+next[i]-old[i]);
}
export function patientDeath(patient) {
  patient.wins=0;
  patient.stats=[...BASE_STATS];
  patient.head=null;
  // Future decoration slots must also be cleared here.
  if(patient.decor)patient.decor={};
  if(patient.decorations)patient.decorations={};
}
export function newGarage(){return Array.from({length:4},()=>({stats:[3,3,3],wins:0,head:null,investments:{},patron:null}));}
export function statMultiplier(points){return points<=4?1+(points-3)*.2:1.2+[0,.15,.30,.40,.50,.60][Math.min(5,Math.max(0,points-4))];}
export function critChance(points){return points<=4?Math.max(0,(points-2)*.15):[.30,.38,.45,.50,.55,.60][Math.min(5,Math.max(0,points-4))];}
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
  if(session.phase!=='betting'||!patient||!session.players[editor]||!validStats(stats,patient.wins))throw Error('Настройка доступна перед ставками: один перенос очка.');
  const patron=resolvePatron(patient);
  if(patron!==null&&patron!==editor)throw Error('Настраивать пациента может только его покровитель.');
  patient.stats=[...stats];
}
