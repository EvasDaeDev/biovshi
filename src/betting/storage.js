import {ARENAS} from '../game/arenas.js';
import {validTower,normalizeTower} from '../tower/model.js';
import {newGarage,validStats,normalizePatronage,normalizePatient} from '../garage/model.js';
import { ctx } from "../game/state.js";
import { betRefund, JACKPOT_INTERVAL } from "./ledger.js";

function validateGarage(s, garage) {
  if (!Array.isArray(garage) || garage.length !== 4) throw Error();
  let invested = 0;
  for (const g of garage) {
    if (!g || !validStats(g.stats,g.wins) || !Number.isSafeInteger(g.wins) || g.wins < 0
      || !(g.head === null || g.head && [1,2,3,4].includes(g.head.hat)
        && Number.isSafeInteger(g.head.price) && g.head.price >= 10
        && Number.isInteger(g.head.player) && s.players[g.head.player])) throw Error();
    if (!g.investments || typeof g.investments !== 'object' || Array.isArray(g.investments)) throw Error();
    for (const [id,sum] of Object.entries(g.investments)) {
      if (!/^(0|[1-9]\d*)$/.test(id) || !s.players[Number(id)] || !Number.isSafeInteger(sum) || sum < 0) throw Error();
      invested += sum;
    }
  }
  if (invested > s.shopSpent) throw Error();
}
export function bettingSave() {
  try {
    localStorage.setItem(ctx.BET_STORAGE, JSON.stringify(ctx.betting));
  } catch {
    ctx.betStorageAvailable = false;
  }
}
export function bettingLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(ctx.BET_STORAGE));
    if (!s) return null;
    if (s.version !== 1 || !Array.isArray(s.players) || s.players.length < 1 || s.players.length > 16 || !['betting', 'running', 'settled'].includes(s.phase) || !Number.isSafeInteger(s.round) || s.round < 1) throw Error();
    if (![s.capital, s.jackpot, s.lockedJackpot].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 16000000)) throw Error();
    if (!s.players.every((p, i) => p.id === i && typeof p.name === 'string' && p.name.length <= 32 && Number.isSafeInteger(p.balance) && p.balance >= 0 && p.balance <= 16000000)) throw Error();
    if (!Array.isArray(s.bets) || s.bets.length > s.players.length || new Set(s.bets.map(b => b.player)).size !== s.bets.length || !s.bets.every(b => Number.isInteger(b.player) && b.player >= 0 && b.player < s.players.length && Number.isInteger(b.robot) && b.robot >= 0 && b.robot < 4 && Number.isSafeInteger(b.amount) && b.amount > 0 && b.amount <= 16000000)) throw Error();
    if (!Array.isArray(s.history) || s.history.length > 10) throw Error();
    s.jackpotRounds ??= 0;
    if (!Number.isInteger(s.jackpotRounds) || s.jackpotRounds < 0 || s.jackpotRounds >= JACKPOT_INTERVAL) throw Error();
    s.towerEarned??=0;
    if(!Number.isSafeInteger(s.towerEarned)||s.towerEarned<0||s.towerEarned>16000000)throw Error();
    s.towers??={};
    if(typeof s.towers!=='object'||Array.isArray(s.towers)||s.towers===null||!Object.entries(s.towers).every(([id,t])=>/^(0|[1-9]\d*)$/.test(id)&&s.players[Number(id)]&&validTower(normalizeTower(t))))throw Error();
    s.garage??=newGarage();
    if(!Array.isArray(s.garage)||s.garage.length!==4||!s.garage.every(g=>g&&typeof g==='object'))throw Error();
    s.garage.forEach(normalizePatient);s.shopSpent??=0;s.topUps??=0;
    if(!Number.isSafeInteger(s.topUps)||s.topUps<0||s.players.length*s.capital+s.topUps+s.towerEarned>16000000)throw Error();
    if(!Number.isSafeInteger(s.shopSpent)||s.shopSpent<0)throw Error();
    if(!Object.hasOwn(ARENAS,s.arenaId))s.arenaId='ward';
    normalizePatronage(s);
    validateGarage(s, s.garage);
    if (s.roundSnapshot !== undefined) {
      if (s.phase !== 'running' || !s.roundSnapshot || typeof s.roundSnapshot !== 'object') throw Error();
      validateGarage(s, s.roundSnapshot.garage);
      normalizePatronage({garage:s.roundSnapshot.garage});
    }
    // Accept both legacy locked jackpots and separately carried jackpots.
    const total = s.players.reduce((n, p) => n + p.balance, 0) + s.jackpot + (s.phase === 'running' ? s.lockedJackpot + s.bets.reduce((n, b) => n + b.amount, 0) : 0);
    if (total + s.shopSpent !== s.players.length * s.capital + s.topUps + s.towerEarned) throw Error();
    if (betRefund(s)) ctx.betNotice = 'Предыдущий бой был прерван: ставки возвращены, пациенты восстановлены по сохранённым данным, джекпот сохранён.';
    return s;
  } catch {
    ctx.betNotice = 'Не удалось загрузить сохранённую сессию. Можно начать новую игру.';
    return null;
  }
}
