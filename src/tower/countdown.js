// Countdown is measured in game startup time: pausing, switching tabs and
// inactive Telegram WebViews freeze both the animation and the countdown.
export function towerCountdownDuration(fighters,startup){
 return Math.max(0,fighters-1)*startup.spawnIntervalSec+startup.spawnDurationSec;
}
export function towerCountdownText(readyAt,elapsed){
 const remaining=Math.max(0,readyAt-elapsed);
 return remaining<=1?'ПОГНАЛИ!!!':String(Math.ceil(remaining));
}
