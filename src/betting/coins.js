export const COIN_SCALE=10;
export const ECONOMY_VERSION=2;
export const MAX_ISSUED_COINS=160_000_000;

export function issuedCoins(session){
 return (session.players.length+(session.retiredProfiles??0))*session.capital
  +(session.topUps??0)+(session.towerEarned??0);
}

export function canIssueCoins(session,amount){
 return Number.isSafeInteger(amount)&&amount>=0&&issuedCoins(session)+amount<=MAX_ISSUED_COINS;
}
