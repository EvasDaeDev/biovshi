// Pure, headless-only analysis of long Tower fights. Never changes combat state.
const searchModes=new Set(['ищет врага','проверяет последнее место','обходит препятствие']);
const fleeingModes=new Set(['убегает без оружия','избегает боя','пытается спастись']);

export function captureTowerBattleSample(game){
 const living=game.robots.filter(r=>r.mobile&&r.visible&&r.segmentCount>0);
 const player=game.robots[0];
 const opponents=living.filter(r=>r.id!==0);
 const nearest=player?.mobile&&opponents.length?
  Math.min(...opponents.map(r=>Math.hypot(r.x-player.x,r.y-player.y))):null;
 const modes=opponents.map(r=>game.intents[r.id]?.mode??'');
 return {
  time:Math.round(game.round.elapsedSec*10)/10,
  hits:game.combat.hits,
  strikes:game.combat.strikes,
  playerSwings:game.combat.fighterSwings[0]??0,
  playerHits:game.combat.fighterHits[0]??0,
  playerAlive:!!player?.mobile,
  playerArmed:(player?.attackSources?.length??0)>0,
  playerNearestCm:nearest===null?null:Math.round(nearest*10)/10,
  aliveEnemies:opponents.length,
  armedEnemies:opponents.filter(r=>(r.attackSources?.length??0)>0).length,
  immobileEnemies:opponents.filter(r=>r.movementLimbs===0).length,
  searchingEnemies:modes.filter(m=>searchModes.has(m)).length,
  fleeingEnemies:modes.filter(m=>fleeingModes.has(m)).length
 };
}
export function diagnoseLongTowerFight(samples,completed=false){
 if(completed)return {reason:'completed',secondsObserved:samples.length};
 if(!samples.length)return {reason:'no-samples',secondsObserved:0};
 const end=samples[samples.length-1],tail=samples.filter(s=>s.time>=end.time-10);
 const first=tail[0];
 const delta=key=>Math.max(0,(end[key]??0)-(first[key]??0));
 const avg=key=>tail.reduce((n,s)=>n+(s[key]??0),0)/tail.length;
 const distances=tail.filter(s=>s.playerNearestCm!==null).map(s=>s.playerNearestCm);
 const averageDistanceCm=distances.length?distances.reduce((n,d)=>n+d,0)/distances.length:null;
 const recentHits=delta('hits'),recentSwings=delta('strikes'),recentPlayerSwings=delta('playerSwings');
 let reason='unclassified';
 if(!end.playerAlive)reason='player-out-but-round-open';
 else if(end.aliveEnemies>0&&end.armedEnemies===0)reason='disarmed-survivors';
 else if(end.aliveEnemies>0&&end.immobileEnemies===end.aliveEnemies)reason='immobile-survivors';
 else if(averageDistanceCm!==null&&averageDistanceCm>62&&recentPlayerSwings===0)reason='autopilot-keeps-distance';
 else if(recentHits>=3)reason='active-combat';
 else if(avg('searchingEnemies')>Math.max(0.5,end.aliveEnemies*.6))reason='search-or-perception';
 else if(avg('fleeingEnemies')>Math.max(0.5,end.aliveEnemies*.6))reason='fleeing';
 else if(recentSwings===0)reason='no-attack-opportunities';
 else reason='attacks-without-hits';
 return {
  reason,secondsObserved:tail.length,
  recentHits,recentSwings,recentPlayerSwings,
  averageDistanceCm:averageDistanceCm===null?null:Math.round(averageDistanceCm*10)/10,
  aliveEnemies:end.aliveEnemies,armedEnemies:end.armedEnemies,
  immobileEnemies:end.immobileEnemies,
  searchingEnemySamples:Math.round(avg('searchingEnemies')*10)/10,
  fleeingEnemySamples:Math.round(avg('fleeingEnemies')*10)/10
 };
}
