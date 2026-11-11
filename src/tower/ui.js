import {ctx} from '../game/state.js';
import {towerFor,resetTower,completeTower,rewardTower,towerEnemyCount} from './model.js';
import {bettingSave} from '../betting/storage.js';
import {bettingSetup} from '../betting/ui.js';
import {validStats,earnedStats,redistributeStat,statMultiplier,critChance} from '../garage/model.js';
import {startSpawnSequence} from '../game/session.js';
import {onGameEvent} from '../game/event-bus.js';
import {installTowerInput} from './input.js';
import {SKILLS} from '../ui/patient.js';
import {arenaDiagram} from '../game/arenas.js';

export function refreshMenu(){
  const s=ctx.betting,select=ctx.root.querySelector('#menu-player');
  ctx.menuPlayer=s?.players[s.towerPlayerId]?.id??s?.players[0]?.id??0;
  select.replaceChildren();
  for(const p of s?.players??[]){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.selected=p.id===ctx.menuPlayer;select.append(option);}
  select.disabled=!s;
  const t=s?towerFor(s,ctx.menuPlayer):null;
  ctx.root.querySelector('#menu-bank').textContent=s?`БАНК: ${s.players[ctx.menuPlayer].balance} МОНЕТ`:'Создайте игроков для обоих режимов';
  ctx.root.querySelector('#launch-tower').textContent=`РЕЖИМ БАШНЯ · ЭТАЖ ${t?.level??1}`;
  ctx.root.querySelector('#menu-tower-progress').textContent=`ПРОЙДЕНО: ${t?.wins??0} · РЕКОРД: ${t?.record??0}`;
  ctx.root.querySelector('#tower-reset').disabled=!s;
  ctx.root.querySelector('#launch-totalizator').hidden=!s;
  ctx.root.querySelector('#launch-setup').textContent=s?'НОВАЯ ИГРА':'СОЗДАТЬ ИГРУ';
}
export function openMenu(){
  ctx.clearTowerInput?.();ctx.paused=true;ctx.audio?.sync();
  ctx.betOverlay.hidden=true;ctx.resultsPanel.hidden=true;
  ctx.root.querySelector('#tower-preparation').hidden=true;
  ctx.root.querySelector('#tower-controls').hidden=true;
  refreshMenu();ctx.root.querySelector('#launch-overlay').hidden=false;
  ctx.root.querySelector('#launch-tower').focus();
}
export function towerPreparation(){
  const t=towerFor(ctx.betting,ctx.towerPlayer),panel=ctx.root.querySelector('#tower-preparation');
  ctx.startup.phase='tower-ready';ctx.resultsPanel.hidden=true;ctx.root.querySelector('#tower-controls').hidden=true;
  panel.hidden=false;ctx.root.querySelector('#tower-prep-title').textContent=`БАШНЯ · ЭТАЖ ${t.level}`;
  ctx.root.querySelector('#tower-prep-name').textContent=ctx.betting.players[ctx.towerPlayer].name;
  ctx.root.querySelector('#tower-floor-preview').innerHTML=`${arenaDiagram(ctx.arenaDefinition)}<div><strong>${ctx.arenaDefinition.name}</strong><span>ПРОТИВНИКОВ: ${towerEnemyCount(t)} · РЕКОРД: ${t.record}</span>${t.preparing?'<b>+1 ОЧКО НАВЫКОВ · ПАЦИЕНТ ВОССТАНОВЛЕН</b>':'<span>10 МОНЕТ ЗА ЛИЧНОЕ ВЫБИВАНИЕ</span>'}</div>`;
  const fields=ctx.root.querySelector('#tower-stats');fields.replaceChildren();
  function renderSkills(){
    fields.innerHTML=`<div class="garage-stat-list"><small>Побед: ${t.wins} · заработано очков: ${9+t.wins}</small>
      ${SKILLS.map((skill,i)=>`<label><span>${skill.icon} ${i===2?'Манёвр.':skill.name}</span><select data-tower-stat="${i}" aria-label="${skill.name}">${[earnedStats(t.wins)[i]-1,earnedStats(t.wins)[i],earnedStats(t.wins)[i]+1].filter(n=>n>=2).map(n=>`<option value="${n}" ${n===t.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div>
      <small class="garage-stat-effects">Скор. ${Math.round(statMultiplier(t.stats[0])*100)}% Мобиль. ${Math.round(statMultiplier(t.stats[2])*100)}% Сила +${Math.round(critChance(t.stats[1])*100)}%крит.</small>
      <button type="button" data-tower-base>ВЕРНУТЬ ИСХОДНЫЕ</button>`;
    fields.querySelectorAll('select').forEach(select=>select.onchange=()=>{
      const index=Number(select.dataset.towerStat);
      t.stats=redistributeStat(t,index,Number(select.value));ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();
      fields.querySelector(`[data-tower-stat="${index}"]`).focus();
    });
    fields.querySelector('[data-tower-base]').onclick=()=>{t.stats=earnedStats(t.wins);ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();};
  }
  renderSkills();
  ctx.root.querySelector('#tower-prep-error').textContent='';
  ctx.root.querySelector('#tower-fight').onclick=()=>{
    const stats=[...fields.querySelectorAll('select')].map(n=>Number(n.value));
    if(!validStats(stats,t.wins)){ctx.root.querySelector('#tower-prep-error').textContent='Можно перенести одно очко между навыками, сохранив их сумму.';return;}
    t.stats=stats;t.preparing=false;ctx.towerGarage[0].stats=[...stats];bettingSave();panel.hidden=true;ctx.paused=false;
    ctx.root.querySelector('#tower-controls').hidden=false;startSpawnSequence();
  };
  ctx.root.querySelector('#tower-fight').focus();
}
export function updateTowerHud(){
  const count=ctx.ROBOT_COUNT-1,remaining=ctx.startup.phase==='running'?ctx.robots.filter(r=>r.id!==0&&r.mobile&&r.visible).length:count;
  ctx.root.querySelector('#tower-wallet').textContent=`ЭТАЖ ${ctx.towerRun.level} · ПРОТИВНИКОВ ${remaining}/${count} · БАНК ${ctx.betting.players[ctx.towerPlayer].balance}`;
}
export function settleTower(winner){
  if(ctx.towerSettled)return;ctx.towerSettled=true;
  const t=towerFor(ctx.betting,ctx.towerPlayer),won=winner===0,cleared=won?t.level:t.wins;
  ctx.towerOutcome={won,floor:t.level,cleared,record:Math.max(t.record,cleared),newRecord:cleared>t.record,
    runKills:t.runKills,runCoins:t.runCoins,floorCoins:ctx.towerFloorCoins??0,time:ctx.round.elapsedSec,
    reason:ctx.robots[0].hasHead?'Потерял сознание':'Погиб'};
  completeTower(ctx.betting,ctx.towerPlayer,won);bettingSave();ctx.clearTowerInput?.();
}
export function towerResults(){
  const won=ctx.combat.winner===0,t=towerFor(ctx.betting,ctx.towerPlayer),o=ctx.towerOutcome??{floor:ctx.towerRun.level,cleared:won?ctx.towerRun.level:ctx.towerRun.level-1,record:t.record};
  ctx.resultsTitle.textContent=won?`ЭТАЖ ${o.floor} ПРОЙДЕН`:`ПРОЙДЕНО ЭТАЖЕЙ: ${o.cleared}`;
  ctx.resultsSummary.textContent=won?`Получено +1 очко навыков. Далее — этаж ${t.level}, противников: ${towerEnemyCount(t)}.`:`${o.reason??'Поражение'} на этаже ${o.floor}. Заработанные монеты сохранены.`;
  const coins=o.runCoins??o.floorCoins??0,coinLabel=o.runCoins==null?'МОНЕТ ЗА ЭТОТ БОЙ':'МОНЕТ ЗА ЗАБЕГ';
  ctx.root.querySelector('#bet-result-summary').innerHTML=`<div class="tower-run-summary${o.newRecord?' is-record':''}">
    ${o.newRecord?'<strong class="tower-record-banner">НОВЫЙ ЛИЧНЫЙ РЕКОРД!</strong>':''}
    ${won&&o.cleared%5===0?`<strong class="tower-milestone">РУБЕЖ: ${o.cleared} ЭТАЖЕЙ</strong>`:''}
    <div class="tower-result-numbers"><div><strong>${o.cleared}</strong><span>ЭТАЖЕЙ ПРОЙДЕНО</span></div><div><strong>${o.record}</strong><span>ЛИЧНЫЙ РЕКОРД</span></div><div><strong>${coins}</strong><span>${coinLabel}</span></div></div>
    <p>БАНК: ${ctx.betting.players[ctx.towerPlayer].balance} МОНЕТ${o.runKills==null?'':` · ЛИЧНЫХ ПОБЕД: ${o.runKills}`}</p>
  </div>`;
  ctx.resultsAgain.textContent=won?`НА ЭТАЖ ${t.level}`:'НОВАЯ ПОПЫТКА · ЭТАЖ 1';
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
  ctx.root.querySelector('#game-menu').onclick=openMenu;
  ctx.root.querySelector('#tower-prep-menu').onclick=openMenu;
  if(ctx.mode!=='tower'){
    ctx.root.querySelector('#tower-controls').hidden=true;ctx.root.querySelector('#tower-preparation').hidden=true;
    ctx.resultsProcedure.textContent='ПРОЦЕДУРНАЯ';ctx.resultsAgain.textContent='К СТАВКАМ СЛЕДУЮЩЕГО РАУНДА';ctx.resultsProcedure.hidden=false;
    return;
  }
  ctx.towerSettled=false;ctx.towerFloorCoins=0;ctx.towerOutcome=null;ctx.towerFeedbackUntil=0;
  const off=onGameEvent(event=>{
    if(event.type==='robot-immobilized'&&!ctx.towerSettled&&rewardTower(ctx.betting,ctx.towerPlayer,event.robot,event.lastAttacker)){
      ctx.towerFloorCoins+=10;bettingSave();
      const toast=ctx.root.querySelector('#tower-reward-toast');toast.textContent='+10 МОНЕТ';toast.hidden=false;ctx.towerFeedbackUntil=ctx.game.time+1.2;
    }
    if(event.type==='robot-immobilized')updateTowerHud();
  });
  const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{off();dispose();};
  updateTowerHud();
  ctx.resetButton.hidden=true;
  ctx.speedButton.disabled=true;ctx.svg.onclick=null;ctx.svg.style.cursor='default';
  ctx.root.querySelector('.arena-pause-help').hidden=true;
  installTowerInput();towerPreparation();
}
