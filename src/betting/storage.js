import {ARENAS,arenaDefinition} from '../game/arenas.js';
import {initializePlayerArchive,validArchiveNotes,validUnreadArchiveNotes} from '../tower/archive-notes.js';
import {validTower,normalizeTower} from '../tower/model.js';
import {newGarage,validStats,normalizePatronage,normalizePatient} from '../garage/model.js';
import { ctx } from "../game/state.js";
import {trackPlayerBalances} from "../ui/currency-animation.js";
import {COIN_SCALE,ECONOMY_VERSION,MAX_ISSUED_COINS,issuedCoins} from './coins.js';
import {INSURANCE_START_PRICE} from '../tower/insurance.js';
import { betRefund, JACKPOT_INTERVAL } from "./ledger.js";

function validateGarage(s, garage) {
  if (!Array.isArray(garage) || garage.length !== 4) throw Error();
  let invested = 0;
  for (const g of garage) {
    if (!g || !validStats(g.stats,g.wins) || !Number.isSafeInteger(g.wins) || g.wins < 0
      || !(g.head === null || g.head && [1,2,3,4].includes(g.head.hat)
        && Number.isSafeInteger(g.head.price) && g.head.price >= 10
        && (g.head.player===null||Number.isInteger(g.head.player)&&s.players[g.head.player]))) throw Error();
    if (!g.investments || typeof g.investments !== 'object' || Array.isArray(g.investments)) throw Error();
    for (const [id,sum] of Object.entries(g.investments)) {
      if (!/^(0|[1-9]\d*)$/.test(id) || !s.players[Number(id)] || !Number.isSafeInteger(sum) || sum < 0) throw Error();
      invested += sum;
    }
  }
  if (invested > s.shopSpent) throw Error();
}
export function bettingSave({animateBalances=true}={}) {
  try {
    if(ctx.betting)localStorage.setItem(ctx.BET_STORAGE, JSON.stringify(ctx.betting));
    else localStorage.removeItem(ctx.BET_STORAGE);
  } catch {
    ctx.betStorageAvailable = false;
  }
  trackPlayerBalances(ctx.betting,ctx.root,{animate:animateBalances});
}
function migrateCoins(session){
 const scale=(object,keys)=>{
  if(!object)return;
  for(const key of keys){
   if(object[key]===undefined||object[key]===null)continue;
   if(!Number.isSafeInteger(object[key])||object[key]<0||object[key]>MAX_ISSUED_COINS/COIN_SCALE)throw Error();
   object[key]*=COIN_SCALE;
  }
 };
 const scaleGarage=garage=>{
  for(const patient of garage??[]){
   scale(patient.head,['price']);
   scale(patient.investments,Object.keys(patient.investments??{}));
  }
 };
 const scaleResult=result=>{
  scale(result,['bank','stakes','jackpot','jackpotAdded','jackpotPaid']);
  for(const row of result?.rows??[])scale(row,['balance','stake','payout','jackpotPayout']);
  if(result?.jackpotPaid&&typeof result.message==='string')
   result.message=result.message.replace(/Розыгрыш джекпота: \d+ монет/, 'Розыгрыш джекпота: '+result.jackpotPaid+' монет');
 };
 scale(session,['capital','jackpot','lockedJackpot','shopSpent','insuranceSpent','surgerySpent',
  'mutationSpent','towerEconomySpent','topUps','towerEarned']);
 for(const player of session.players)scale(player,['balance']);
 for(const bet of session.bets)scale(bet,['amount']);
 for(const tower of Object.values(session.towers??{})){
  scale(tower,['runCoins']);
  scale(tower?.insurance?.checkpoint,['runCoins']);
  if(tower?.insurance){
   if(!Number.isSafeInteger(tower.insurance.price)||tower.insurance.price<50)throw Error();
   tower.insurance.price=INSURANCE_START_PRICE;
  }
 }
 scaleGarage(session.garage);
 scaleGarage(session.roundSnapshot?.garage);
 scaleResult(session.lastResult);
 scaleResult(session.roundSnapshot?.lastResult);
 for(const result of session.history)scaleResult(result);
 session.economyVersion=ECONOMY_VERSION;
}
const validCount=value=>Number.isSafeInteger(value)&&value>=0;

export function bettingLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(ctx.BET_STORAGE));
    if (!s) return null;
    if (s.version !== 1 || !Array.isArray(s.players) || s.players.length < 1 || s.players.length > 16 || !['betting', 'running', 'settled'].includes(s.phase) || !Number.isSafeInteger(s.round) || s.round < 1) throw Error();
    const migrateEconomy=s.economyVersion===undefined;
    if(!Array.isArray(s.bets)||!Array.isArray(s.history))throw Error();
    if(migrateEconomy)migrateCoins(s);
    if(s.economyVersion!==ECONOMY_VERSION)throw Error();
    if (![s.capital, s.jackpot, s.lockedJackpot].every(n => Number.isSafeInteger(n) && n >= 0 && n <= MAX_ISSUED_COINS)) throw Error();
    if (!s.players.every((p, i) => p.id === i && typeof p.name === 'string' && p.name.length <= 32 && Number.isSafeInteger(p.balance) && p.balance >= 0 && p.balance <= MAX_ISSUED_COINS)) throw Error();
    if (!Array.isArray(s.bets) || s.bets.length > s.players.length || new Set(s.bets.map(b => b.player)).size !== s.bets.length || !s.bets.every(b => Number.isInteger(b.player) && b.player >= 0 && b.player < s.players.length && Number.isInteger(b.robot) && b.robot >= 0 && b.robot < 4 && Number.isSafeInteger(b.amount) && b.amount > 0 && b.amount <= MAX_ISSUED_COINS)) throw Error();
    if (!Array.isArray(s.history) || s.history.length > 10) throw Error();
    s.jackpotRounds ??= 0;
    if (!Number.isInteger(s.jackpotRounds) || s.jackpotRounds < 0 || s.jackpotRounds >= JACKPOT_INTERVAL) throw Error();
    s.towerEarned??=0;
    if(!Number.isSafeInteger(s.towerEarned)||s.towerEarned<0||s.towerEarned>MAX_ISSUED_COINS)throw Error();
    s.towerEnemyGenerations??={};
    if(typeof s.towerEnemyGenerations!=='object'||s.towerEnemyGenerations===null||Array.isArray(s.towerEnemyGenerations)
      ||!Object.entries(s.towerEnemyGenerations).every(([id,n])=>/^[1-9]\d*$/.test(id)&&Number.isSafeInteger(n)&&n>=0))throw Error();
    s.towers??={};
    const migrateArtifacts=Object.values(s.towers).some(t=>t&&(t.insurance===undefined||t.artifacts===undefined||t.artifacts?.version===1||t.artifacts?.version===2&&t.artifacts.bossEvery!==5));
    if(typeof s.towers!=='object'||Array.isArray(s.towers)||s.towers===null||!Object.entries(s.towers).every(([id,t])=>/^(0|[1-9]\d*)$/.test(id)&&s.players[Number(id)]&&validTower(normalizeTower(t))))throw Error();
    s.garage??=newGarage();
    if(!Array.isArray(s.garage)||s.garage.length!==4||!s.garage.every(g=>g&&typeof g==='object'))throw Error();
    s.garage.forEach(normalizePatient);s.shopSpent??=0;s.topUps??=0;s.insuranceSpent??=0;s.surgerySpent??=0;s.towerEconomySpent??=0;s.mutationSpent??=0;
    if(!validCount(s.topUps)||!validCount(s.retiredProfiles??0)||!validCount(s.retiredBalance??0)
      ||!Number.isSafeInteger(issuedCoins(s))||issuedCoins(s)>MAX_ISSUED_COINS)throw Error();
    if(!Number.isSafeInteger(s.mutationSpent)||s.mutationSpent<0||s.mutationSpent>MAX_ISSUED_COINS||!Number.isSafeInteger(s.shopSpent)||s.shopSpent<0||!Number.isSafeInteger(s.insuranceSpent)||s.insuranceSpent<0||s.insuranceSpent>MAX_ISSUED_COINS||!Number.isSafeInteger(s.surgerySpent)||s.surgerySpent<0||s.surgerySpent>MAX_ISSUED_COINS||!Number.isSafeInteger(s.towerEconomySpent)||s.towerEconomySpent<0||s.towerEconomySpent>MAX_ISSUED_COINS)throw Error();
    if(!Object.hasOwn(ARENAS,s.arenaId))s.arenaId=arenaDefinition().id;
    normalizePatronage(s);
    validateGarage(s, s.garage);
    if (s.roundSnapshot !== undefined) {
      if (s.phase !== 'running' || !s.roundSnapshot || typeof s.roundSnapshot !== 'object') throw Error();
      validateGarage(s, s.roundSnapshot.garage);
      normalizePatronage({garage:s.roundSnapshot.garage});
    }
    // Accept both legacy locked jackpots and separately carried jackpots.
    const total = s.players.reduce((n, p) => n + p.balance, 0) + s.jackpot + (s.phase === 'running' ? s.lockedJackpot + s.bets.reduce((n, b) => n + b.amount, 0) : 0);
    if (total + (s.retiredBalance??0) + s.shopSpent + s.insuranceSpent + s.surgerySpent + s.towerEconomySpent + s.mutationSpent !== issuedCoins(s)) throw Error();
    if (!s.players.every(p=>p.archiveNotes===undefined||validArchiveNotes(p.archiveNotes))) throw Error();
    if (!s.players.every(p=>p.unreadArchiveNoteIds===undefined||validUnreadArchiveNotes(p.unreadArchiveNoteIds,p.archiveNotes))) throw Error();
    const floorKeys=s.players.map(p=>p.floorKey??String(p.id));
    if(new Set(floorKeys).size!==floorKeys.length||!floorKeys.every(key=>typeof key==='string'&&/^(0|[1-9]\d*)$/.test(key)))throw Error();
    if(!s.players.every(p=>(p.towerBattles===undefined||validCount(p.towerBattles))
      &&(p.towerKnockouts===undefined||validCount(p.towerKnockouts))))throw Error();
    const migrateProfiles=s.players.some(p=>p.towerBattles===undefined||p.towerKnockouts===undefined);
    for(const p of s.players){
     const tower=s.towers[p.id];
     p.towerBattles??=tower?.record??0;
     p.towerKnockouts??=tower?.runKills??0;
    }
    const migrateNotes=s.players.some(p=>p.archiveNotes===undefined||p.unreadArchiveNoteIds===undefined);
    if(migrateNotes)s.players.forEach(initializePlayerArchive);
    if (betRefund(s)) ctx.betNotice = 'Предыдущий бой был прерван: ставки возвращены, пациенты восстановлены по сохранённым данным, джекпот сохранён.';
    if(migrateEconomy||migrateProfiles||migrateArtifacts||migrateNotes){try{localStorage.setItem(ctx.BET_STORAGE,JSON.stringify(s));}catch{ctx.betStorageAvailable=false;}}
    return s;
  } catch {
    ctx.betNotice = 'Не удалось загрузить сохранённую сессию. Можно начать новую игру.';
    return null;
  }
}
