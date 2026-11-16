import {artifactDropChance,ARTIFACT_COMPLETION_REWARD,ARTIFACT_PIECE_COUNT} from './artifacts.js';
import {bossName} from '../boss/names.js';
import {setPaused} from '../ui/controls.js';
import {hasBoss} from '../boss/config.js';
import {bossFloorReward} from '../boss/encounter.js';
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
import {ctx} from '../game/state.js';
import {towerFor,resetTower,completeTower,rewardTower,towerEnemyCount,buyTowerInsurance} from './model.js';
import {bettingSave} from '../betting/storage.js';
import {bettingSetup,bettingCancel,bettingReadDraft} from '../betting/ui.js';
import {patientRecovery,validStats,earnedStats,redistributeStat,statMultiplier,critChance} from '../garage/model.js';
import {startSpawnSequence} from '../game/session.js';
import {onGameEvent} from '../game/event-bus.js';
import {installTowerInput} from './input.js';
import {SKILLS,skillHintAttributes} from '../ui/patient.js';
import {arenaDiagram} from '../game/arenas.js';
import {artifactCollectionMarkup} from './artifact-ui.js';
import {formatChips} from '../ui/currency.js';
import {playerBalanceMarkup} from '../ui/currency-animation.js';

function renderTowerPlayerWallet(target){
  const player=ctx.betting.players[ctx.towerPlayer];
  const name=document.createElement('span');name.className='tower-player-name';name.textContent=player.name;
  const bank=document.createElement('span');bank.className='tower-player-bank';bank.innerHTML=`БАНК: ${playerBalanceMarkup(player.id,player.balance)}`;
  target.replaceChildren(name,bank);
}

export function refreshMenu(){
  const s=ctx.betting,select=ctx.root.querySelector('#menu-player');
  ctx.menuPlayer=s?.players[s.towerPlayerId]?.id??s?.players[0]?.id??0;
  select.replaceChildren();
  for(const p of s?.players??[]){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.selected=p.id===ctx.menuPlayer;select.append(option);}
  select.disabled=!s;
  const t=s?towerFor(s,ctx.menuPlayer):null;
  ctx.root.querySelector('#menu-bank').innerHTML=s?playerBalanceMarkup(ctx.menuPlayer,s.players[ctx.menuPlayer].balance):'';
  ctx.root.querySelector('#launch-tower').textContent=`РЕЖИМ БАШНЯ · ЭТАЖ ${t?.level??1}`;
  ctx.root.querySelector('#menu-tower-progress').textContent=`ПРОЙДЕНО ЭТАЖЕЙ: ${t?.wins??0} · РЕКОРД: ${t?.record??0}`;
  ctx.root.querySelector('#tower-reset').disabled=!s;
  ctx.root.querySelector('#launch-totalizator').hidden=!s;
  const newGame=ctx.root.querySelector('#launch-setup');
  newGame.textContent=s?'НОВАЯ ИГРА':'СОЗДАТЬ ИГРУ';
  newGame.classList.toggle('is-new-game',Boolean(s));
}
export function openMenu(){
  const active=['spawning','running'].includes(ctx.startup.phase)&&!ctx.combat.finished;
  if(active&&!confirm('Вернуться в главное меню? Текущий бой будет отменён.'))return false;
  if(active)bettingCancel();
  if(!ctx.betOverlay.hidden&&ctx.betContent.querySelector('#bet-stakes-form')){
    ctx.betDraft={session:ctx.betting,round:ctx.betting.round,bets:bettingReadDraft(),arenaId:ctx.selectedArenaId};
  }
  ctx.startup.phase='menu';
  ctx.clearTowerInput?.();ctx.clearTowerDestination?.();setPaused(true);
  ctx.betOverlay.hidden=true;ctx.resultsPanel.hidden=true;
  ctx.root.querySelector('#tower-preparation').hidden=true;
  ctx.root.querySelector('#tower-controls').hidden=true;
  refreshMenu();ctx.root.querySelector('#launch-overlay').hidden=false;
  ctx.root.querySelector('#launch-tower').focus();
  return true;
}
export function towerPreparation(){
  const t=towerFor(ctx.betting,ctx.towerPlayer),panel=ctx.root.querySelector('#tower-preparation');
  ctx.startup.phase='tower-ready';ctx.resultsPanel.hidden=true;ctx.root.querySelector('#tower-controls').hidden=true;
  panel.hidden=false;const title=ctx.root.querySelector('#tower-prep-title');
  title.classList.toggle('boss-floor-title',hasBoss(t));
  title.textContent=hasBoss(t)?`${bossName(t.level)}\nЭТАЖ №${t.level}`:`БАШНЯ · ЭТАЖ ${t.level}`;
  renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
  ctx.root.querySelector('#tower-floor-preview').innerHTML=`${arenaDiagram(ctx.arenaDefinition)}<div><strong>${ctx.arenaDefinition.name}</strong><span>ПРОТИВНИКОВ: ${towerEnemyCount(t)} · РЕКОРД: ${t.record}</span>${t.preparing?'<b>+1 ОЧКО НАВЫКОВ · ПАЦИЕНТ ВОССТАНОВЛЕН</b>':''}<span>${hasBoss(t)?bossName(t.level)+' · ':''}${formatChips(bossFloorReward(t))} ${hasBoss(t)?'ЗА БОССА · '+formatChips(10)+' ЗА ПАЦИЕНТА · ВСЕ ПРОТИВ ВСЕХ':'ЗА ЛИЧНОЕ ВЫБИВАНИЕ'}</span>${hasBoss(t)?`<span data-artifact-chance>${t.artifacts.pieces.length===ARTIFACT_PIECE_COUNT?'КОЛЛЕКЦИЯ СОБРАНА':'ШАНС ФРАГМЕНТА: '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(artifactDropChance(t.artifacts,t.level)*100)+'%'}</span>`:''}</div>`;
  const fields=ctx.root.querySelector('#tower-stats');fields.replaceChildren();
  function renderSkills(){
    const snapshot=prostheticStatSnapshot(t),stats=snapshot.effective;
    fields.innerHTML=`<div class="garage-stat-list"><small>Побед: ${t.wins} · заработано очков: ${9+t.wins}</small>
      ${SKILLS.map((skill,i)=>`<label ${skillHintAttributes(snapshot,i)}><span>${skill.icon} ${i===2?'Манёвр.':skill.name}</span><select data-tower-stat="${i}" aria-label="${skill.name}">${[earnedStats(t.wins)[i]-1,earnedStats(t.wins)[i],earnedStats(t.wins)[i]+1].filter(n=>n>=2).map(n=>`<option value="${n}" ${n===t.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div>
      <small class="garage-stat-effects">Скор. ${Math.round(statMultiplier(stats[0])*100)}% Мобиль. ${Math.round(statMultiplier(stats[2])*100)}% Сила +${Math.round(critChance(stats[1])*100)}%крит.</small>
      <button type="button" data-tower-base>ВЕРНУТЬ ИСХОДНЫЕ</button>`;
    fields.querySelectorAll('select').forEach(select=>select.onchange=()=>{
      const index=Number(select.dataset.towerStat);
      t.stats=redistributeStat(t,index,Number(select.value));ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();
      fields.querySelector(`[data-tower-stat="${index}"]`).focus();
    });
    fields.querySelector('[data-tower-base]').onclick=()=>{t.stats=earnedStats(t.wins);ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();};
  }
  renderSkills();
  ctx.root.querySelector('#tower-prep-artifacts').innerHTML=artifactCollectionMarkup(t.artifacts)+`<p class="artifact-bonus-note">ПОЛНЫЙ АРТЕФАКТ: +${formatChips(ARTIFACT_COMPLETION_REWARD)}</p>`;
  ctx.root.querySelector('#tower-prep-error').textContent='';
  const insuranceButton=ctx.root.querySelector('#tower-insurance');
  const renderInsurance=()=>{
    const c=t.insurance.checkpoint,renewal=Boolean(c&&t.level>c.level);
    insuranceButton.classList.toggle('is-active',Boolean(c));
    insuranceButton.innerHTML=renewal?`ПРОДЛИТЬ ДМС · ${formatChips(t.insurance.price)}`:c?`ДМС · ЭТАЖ ${c.level}`:`ДМС · ${formatChips(t.insurance.price)}`;
    insuranceButton.disabled=Boolean(c&&!renewal)||ctx.betting.players[ctx.towerPlayer].balance<t.insurance.price;
    insuranceButton.title=renewal?`Перенести ДМС с этажа ${c.level} на этаж ${t.level} за ${t.insurance.price} монет и сохранить текущие навыки и протезы. Старый полис заменяется. Следующий тариф дороже на 3%, с округлением вверх.`:c?`При поражении вернёт на этаж ${c.level} с сохранёнными навыками. Страховка одноразовая. На более высоком этаже её можно продлить.`:'Одноразовая страховка этажа и выбранных навыков. Следующая покупка дороже на 10%, с округлением вверх.';
  };
  renderInsurance();
  insuranceButton.onclick=()=>{
    if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
    try{
      const renewal=Boolean(t.insurance.checkpoint);
      buyTowerInsurance(ctx.betting,ctx.towerPlayer);bettingSave();renderInsurance();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));updateTowerHud();
      ctx.root.querySelector('#tower-prep-error').textContent=renewal?`ДМС продлена: этаж ${t.level} и текущие навыки застрахованы.`:'ДМС оформлена: этаж и навыки застрахованы.';
    }
    catch(error){ctx.root.querySelector('#tower-prep-error').textContent=error.message;}
  };
  ctx.root.querySelector('#tower-fight').onclick=()=>{
    const stats=[...fields.querySelectorAll('select')].map(n=>Number(n.value));
    if(!validStats(stats,t.wins)){ctx.root.querySelector('#tower-prep-error').textContent='Можно перенести одно очко между навыками, сохранив их сумму.';return;}
    t.stats=stats;t.preparing=false;ctx.towerGarage[0].stats=[...stats];bettingSave();panel.hidden=true;
    ctx.root.querySelector('#tower-controls').hidden=false;startSpawnSequence();
  };
  ctx.root.querySelector('#tower-fight').focus();
}
export function updateTowerHud(){
  const count=ctx.ROBOT_COUNT-1,remaining=ctx.startup.phase==='running'?ctx.robots.filter(r=>r.id!==0&&r.mobile&&r.visible).length:count;
  const floor=ctx.towerRun.level;
  ctx.root.querySelector('#tower-wallet').innerHTML=`${hasBoss(ctx.towerRun)?'':`ЭТАЖ ${floor} · ПРОТИВНИКОВ ${remaining}/${count} · `}БАНК ${playerBalanceMarkup(ctx.towerPlayer,ctx.betting.players[ctx.towerPlayer].balance)}`;
}
export function settleTower(winner){
  if(ctx.towerSettled)return;ctx.towerSettled=true;
  const t=towerFor(ctx.betting,ctx.towerPlayer),won=winner===0,cleared=won?t.level:t.wins;
  ctx.towerOutcome={won,floor:t.level,cleared,record:Math.max(t.record,cleared),newRecord:cleared>t.record,
    runKills:t.runKills,runCoins:t.runCoins,floorCoins:ctx.towerFloorCoins??0,time:ctx.round.elapsedSec,
    reason:ctx.robots[0].hasHead?'Потерял сознание':'Погиб'};
  if(won)patientRecovery(t,ctx.robots[0]);
  const insuredFloor=!won?t.insurance.checkpoint?.level:null;
  ctx.towerOutcome.insuranceFloor=insuredFloor;
  const priorPieces=[...t.artifacts.pieces];
  const balanceBefore=ctx.betting.players[ctx.towerPlayer].balance;
  const next=completeTower(ctx.betting,ctx.towerPlayer,won);
  const bonus=ctx.betting.players[ctx.towerPlayer].balance-balanceBefore;
  ctx.towerOutcome.artifactBonus=bonus;
  if(bonus){ctx.towerFloorCoins=(ctx.towerFloorCoins??0)+bonus;ctx.towerOutcome.floorCoins=ctx.towerFloorCoins;ctx.towerOutcome.runCoins=t.runCoins;}
  ctx.towerOutcome.artifact=won?next.artifacts.pieces.find(id=>!priorPieces.includes(id))??null:null;
  bettingSave();ctx.clearTowerInput?.();ctx.clearTowerDestination?.();
}
export function towerResults(){
  const won=ctx.combat.winner===0,t=towerFor(ctx.betting,ctx.towerPlayer),o=ctx.towerOutcome??{floor:ctx.towerRun.level,cleared:won?ctx.towerRun.level:ctx.towerRun.level-1,record:t.record};
  ctx.resultsTitle.textContent=won?`ЭТАЖ ${o.floor} ПРОЙДЕН`:`ПРОЙДЕНО ЭТАЖЕЙ: ${o.cleared}`;
  ctx.resultsSummary.textContent=won?`Получено +1 очко навыков. Далее — этаж ${t.level}, противников: ${towerEnemyCount(t)}.`:`${o.reason??'Поражение'} на этаже ${o.floor}. ${o.insuranceFloor?`ДМС сработала: возврат на этаж ${o.insuranceFloor} с застрахованными навыками. Страховка использована.`:'Заработанные монеты сохранены.'}`;
  const coins=o.floorCoins??0;
  const resultWallet=ctx.root.querySelector('#tower-results-player');
  renderTowerPlayerWallet(resultWallet);resultWallet.hidden=false;
  ctx.root.querySelector('#bet-result-summary').innerHTML=`<div class="tower-run-summary${o.newRecord?' is-record':''}">
    ${o.newRecord?'<strong class="tower-record-banner">НОВЫЙ ЛИЧНЫЙ РЕКОРД!</strong>':''}
    ${won&&o.cleared%5===0?`<strong class="tower-milestone">РУБЕЖ: ${o.cleared} ЭТАЖЕЙ</strong>`:''}
    <div class="tower-result-numbers"><div><strong>${o.cleared}</strong><span>ЭТАЖЕЙ ПРОЙДЕНО</span></div><div><strong>${o.record}</strong><span>ЛИЧНЫЙ РЕКОРД</span></div><div><strong>${formatChips(coins)}</strong><span>МОНЕТ ЗА ЭТАЖ</span></div></div>
    ${artifactCollectionMarkup(t.artifacts,o.artifact,o.artifactBonus)}
    ${o.runKills==null?'':`<p>ЛИЧНЫХ ПОБЕД: ${o.runKills}</p>`}
  </div>`;
  ctx.resultsAgain.textContent=won?`НА ЭТАЖ ${t.level}`:o.insuranceFloor?`ДМС · НА ЭТАЖ ${t.level}`:'НОВАЯ ПОПЫТКА · ЭТАЖ 1';
  ctx.resultsAgain.onclick=()=>ctx.startTower(ctx.towerPlayer);
  ctx.resultsProcedure.hidden=false;ctx.resultsProcedure.textContent='В МЕНЮ';ctx.resultsProcedure.onclick=openMenu;
  ctx.root.querySelector('#tower-controls').hidden=true;ctx.resultsPanel.hidden=false;ctx.resultsAgain.focus();
}
export function installTowerUI(){
  refreshMenu();
  ctx.resetButton.hidden=false;
  ctx.root.querySelector('#tower-wallet').hidden=ctx.mode!=='tower';
  const menu=ctx.root.querySelector('#launch-overlay');
  ctx.root.querySelector('#menu-player').onchange=e=>{ctx.betting.towerPlayerId=Number(e.target.value);bettingSave();refreshMenu();};
  ctx.root.querySelector('#tower-reset').onclick=()=>{if(confirm('Сбросить башню выбранного игрока? Банк монет и личный рекорд сохранятся.')){resetTower(ctx.betting,ctx.menuPlayer);bettingSave();refreshMenu();}};
  ctx.root.querySelector('#launch-tower').onclick=()=>{
    ctx.audio?.unlock();
    if(!ctx.betting){menu.hidden=true;ctx.afterSetup='menu';bettingSetup();return;}
    ctx.startTower(ctx.menuPlayer);
  };
  ctx.root.querySelector('#launch-totalizator').onclick=async()=>{ctx.audio?.unlock();await ctx.startTotalizator();};
  if(ctx.mode!=='tower'){
    ctx.root.querySelector('#tower-controls').hidden=true;ctx.root.querySelector('#tower-preparation').hidden=true;
    ctx.resultsProcedure.textContent='ПРОЦЕДУРНАЯ';ctx.resultsAgain.textContent='К СТАВКАМ СЛЕДУЮЩЕГО РАУНДА';ctx.resultsProcedure.hidden=false;
    return;
  }
  ctx.towerSettled=false;ctx.towerFloorCoins=0;ctx.towerOutcome=null;ctx.towerFeedbackUntil=0;
  const off=onGameEvent(event=>{
    if(event.type==='robot-immobilized'&&!ctx.towerSettled&&rewardTower(ctx.betting,ctx.towerPlayer,event.robot,event.lastAttacker)){
      const reward=bossFloorReward(ctx.towerRun,event.robot);ctx.towerFloorCoins+=reward;bettingSave();
      const toast=ctx.root.querySelector('#tower-reward-toast');toast.innerHTML='+'+formatChips(reward);toast.hidden=false;ctx.towerFeedbackUntil=ctx.game.time+1.2;
    }
    if(event.type==='robot-immobilized')updateTowerHud();
  });
  const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{off();dispose();};
  updateTowerHud();
  ctx.resetButton.hidden=true;
  ctx.speedButton.disabled=true;ctx.svg.onclick=null;ctx.svg.style.cursor='default';
  installTowerInput();towerPreparation();
}

