import {newGarage} from '../garage/model.js';
export const BET_WIN_PERCENT = 85;
export function betOdds(stakes, winningTotal) {
  return winningTotal ? 1 + (stakes - winningTotal) * BET_WIN_PERCENT / (100 * winningTotal) : null;
}
export function betNewSession(names, capital) {
  return {
    version: 1,
    garage: newGarage(),
    shopSpent: 0,
    topUps: 0,
    towerEarned: 0,
    towers: {},
    floorId: globalThis.crypto?.randomUUID?.()??String(Date.now())+Math.random(),
    round: 1,
    capital,
    phase: 'betting',
    arenaId:'ward',
    jackpot: 0,
    lockedJackpot: 0,
    players: names.map((name, id) => ({
      id,
      name,
      balance: capital
    })),
    bets: [],
    history: [],
    lastResult: null
  };
}
export function betCommit(s, bets) {
  if (s.phase !== 'betting') throw Error('Ставки на этот раунд уже закрыты.');
  if (bets.length !== s.players.length) throw Error('Проверьте ставки всех игроков.');
  bets.forEach((b, i) => {
    if (b.player !== i || !Number.isInteger(b.amount) || b.amount < 0 || b.amount > s.players[i].balance || !Number.isInteger(b.robot) || b.robot < 0 || b.robot > 3) throw Error('Сумма ставки должна быть целым числом от 0 до баланса игрока.');
  });
  s.bets = bets.filter(b => b.amount > 0).map(b => ({
    ...b
  }));
  for (const b of s.bets) s.players[b.player].balance -= b.amount;
  // Kept for version-1 saves; new rounds never put the jackpot at stake.
  s.lockedJackpot = 0;
  s.phase = 'running';
  s.lastResult = null;
}
// Joining adds exactly one original starting capital to the issued chips.
export function betAddPlayer(s,name){
  if(s.phase!=='betting')throw Error('Добавлять игроков можно только до начала боя.');
  if(s.players.length>=16)throw Error('За одним столом может быть не больше 16 игроков.');
  const clean=typeof name==='string'?name.trim():'';
  if(!clean||clean.length>32)throw Error('Введите имя от 1 до 32 символов.');
  const issued=(s.players.length+1)*s.capital+(s.topUps??0)+(s.towerEarned??0);
  if(!Number.isSafeInteger(issued)||issued>16000000)throw Error('Общий выпуск фишек не может превышать 16 000 000.');
  const player={id:s.players.length,name:clean,balance:s.capital};
  s.players.push(player);
  return player;
}
export function betResolve(s, winner) {
  if (s.phase !== 'running') return null; // A round is paid exactly once.
  const stakes = s.bets.reduce((n, b) => n + b.amount, 0),
    bank = stakes,
    jackpotBefore = s.jackpot + s.lockedJackpot;
  const winning = s.bets.filter(b => b.robot === winner),
    winningTotal = winning.reduce((n, b) => n + b.amount, 0);
  const payouts = s.players.map(() => 0);
  let message;
  if (winner === null) {
    for (const b of s.bets) payouts[b.player] = b.amount;
    message = 'Ничья: все ставки возвращены. Джекпот сохранён.';
  } else if (!winningTotal) {
    message = 'На победителя никто не поставил. Все ставки переходят в джекпот.';
  } else {
    const lost = BigInt(stakes - winningTotal);
    for (const b of winning) {
      const profit = lost * BigInt(BET_WIN_PERCENT) * BigInt(b.amount) / (100n * BigInt(winningTotal));
      payouts[b.player] = b.amount + Number(profit);
    }
    message = stakes === winningTotal
      ? 'Все ставки сделаны на победителя: ставки возвращены полностью. Джекпот сохранён.'
      : 'Ставки победителей возвращены. 85% проигравших ставок распределены пропорционально; 15% и остатки округления — в джекпот.';
  }
  const jackpotAdded = stakes - payouts.reduce((n, x) => n + x, 0);
  s.jackpot = jackpotBefore + jackpotAdded;
  payouts.forEach((amount, i) => s.players[i].balance += amount);
  s.lastResult = {
    round: s.round,
    winner,
    bank,
    stakes,
    jackpot: s.jackpot,
    jackpotAdded,
    message,
    rows: s.players.map((p, i) => ({
      name: p.name,
      balance: p.balance,
      stake: s.bets.find(b => b.player === i)?.amount || 0,
      robot: s.bets.find(b => b.player === i)?.robot ?? null,
      payout: payouts[i]
    }))
  };
  s.history.unshift(s.lastResult);
  s.history = s.history.slice(0, 10);
  s.phase = 'settled';
  s.lockedJackpot = 0;
  return s.lastResult;
}
export function betWinnerNames(s, winner) {
  if (!s || winner === null) return '—';
  const names = s.players.filter(p => s.bets.some(b => b.player === p.id && b.robot === winner && b.amount > 0)).map(p => p.name);
  return names.length ? names.join(', ') : '—';
}
export function betRefund(s) {
  if (s.phase !== 'running') return false;
  for (const b of s.bets) s.players[b.player].balance += b.amount;
  // Old interrupted rounds held their jackpot in lockedJackpot.
  s.jackpot += s.lockedJackpot;
  s.lockedJackpot = 0;
  s.bets = [];
  s.phase = 'betting';
  return true;
}

// Temporary free top-up; counted separately from the original capital.
export function betTopUp(s,player,amount){
  const target=s.players[player],issued=s.players.length*s.capital+(s.topUps??0)+(s.towerEarned??0);
  if(s.phase!=='betting'||!Number.isInteger(player)||!target||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(issued+amount)||issued+amount>16000000)throw Error('Введите целое положительное число. Общий выпуск фишек не может превышать 16 000 000.');
  target.balance+=amount;s.topUps=(s.topUps??0)+amount;
}
