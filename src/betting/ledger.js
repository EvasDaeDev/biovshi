export function betNewSession(names, capital) {
  return {
    version: 1,
    round: 1,
    capital,
    phase: 'betting',
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
  s.lockedJackpot = s.jackpot;
  s.jackpot = 0;
  s.phase = 'running';
  s.lastResult = null;
}
export function betResolve(s, winner) {
  if (s.phase !== 'running') return null; // A round is paid exactly once.
  const stakes = s.bets.reduce((n, b) => n + b.amount, 0),
    bank = stakes + s.lockedJackpot;
  const winning = s.bets.filter(b => b.robot === winner),
    winningTotal = winning.reduce((n, b) => n + b.amount, 0);
  const payouts = s.players.map(() => 0);
  let message;
  if (winner === null) {
    for (const b of s.bets) payouts[b.player] = b.amount;
    s.jackpot = s.lockedJackpot;
    message = 'Ничья: все ставки возвращены. Джекпот сохранён.';
  } else if (!winningTotal) {
    s.jackpot = bank;
    message = 'На победителя никто не поставил. Весь банк переходит в джекпот.';
  } else {
    for (const b of winning) payouts[b.player] = Math.floor(bank * b.amount / winningTotal);
    s.jackpot = bank - payouts.reduce((n, x) => n + x, 0);
    message = 'Банк распределён пропорционально ставкам на победителя.' + (s.jackpot ? ' Остаток округления — в джекпоте.' : '');
  }
  payouts.forEach((amount, i) => s.players[i].balance += amount);
  s.lastResult = {
    round: s.round,
    winner,
    bank,
    stakes,
    jackpot: s.jackpot,
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
  s.jackpot = s.lockedJackpot;
  s.lockedJackpot = 0;
  s.bets = [];
  s.phase = 'betting';
  return true;
}
