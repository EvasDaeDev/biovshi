export const BASE_STATS = [3,3,3];
export const HATS = [1,2,3,4];
export function validStats(stats) {
  return Array.isArray(stats)&&stats.length===3&&stats.every(n=>Number.isInteger(n)&&n>=2&&n<=4)&&stats.reduce((a,b)=>a+b,0)===9&&stats.filter(n=>n===3).length>=1;
}
export function newGarage(){return Array.from({length:4},()=>({stats:[3,3,3],head:null}));}
export function statMultiplier(points){return 1+(points-3)*.2;}
export function critChance(points){return (points-2)*.15;}
export function nextPrice(slot){return slot?slot.price+Math.ceil(slot.price/10):10;}
export function buyHat(session,patient,player,hat,price){
  if(session.phase!=='betting')throw Error('Покупки доступны до ставок.');
  const target=session.garage?.[patient],buyer=session.players[player];
  if(!target||!buyer||!HATS.includes(hat)||!Number.isSafeInteger(price)||price<nextPrice(target.head)||price>buyer.balance)throw Error('Проверьте цену и баланс игрока.');
  buyer.balance-=price;session.shopSpent=(session.shopSpent??0)+price;
  target.head={hat,price,player};
}
