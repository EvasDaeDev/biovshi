import {ctx} from '../game/state.js';
import {towerFor,resetTower,completeTower,rewardTower} from './model.js';
import {bettingSave} from '../betting/storage.js';
import {bettingSetup} from '../betting/ui.js';
import {validStats,earnedStats,redistributeStat,statMultiplier,critChance} from '../garage/model.js';
import {startSpawnSequence} from '../game/session.js';
import {onGameEvent} from '../game/event-bus.js';
import {installTowerInput} from './input.js';
import {SKILLS} from '../ui/patient.js';

export function refreshMenu(){
  const s=ctx.betting,select=ctx.root.querySelector('#menu-player');
  ctx.menuPlayer=s?.players[s.towerPlayerId]?.id??s?.players[0]?.id??0;
  select.replaceChildren();
  for(const p of s?.players??[]){const option=document.createElement('option');option.value=p.id;option.textContent=p.name;option.selected=p.id===ctx.menuPlayer;select.append(option);}
  select.disabled=!s;
  const t=s?towerFor(s,ctx.menuPlayer):null;
  ctx.root.querySelector('#menu-bank').textContent=s?`БАНК: ${s.players[ctx.menuPlayer].balance} МОНЕТ`:'Создайте игроков для обоих режимов';
  ctx.root.querySelector('#launch-tower').textContent=`РЕЖИМ БАШНЯ · УРОВЕНЬ ${t?.level??1}`;
  ctx.root.querySelector('#tower-reset').disabled=!s;
  const skin=ctx.root.querySelector('#tower-patient');skin.value=t?.patient??0;skin.disabled=!!t&&(t.level>1||t.rewarded.length>0);
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
  panel.hidden=false;ctx.root.querySelector('#tower-prep-title').textContent=`БАШНЯ · УРОВЕНЬ ${t.level}`;
  ctx.root.querySelector('#tower-prep-name').textContent=ctx.betting.players[ctx.towerPlayer].name;
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
export function settleTower(winner){
  if(ctx.towerSettled)return;ctx.towerSettled=true;
  const won=winner===0;completeTower(ctx.betting,ctx.towerPlayer,won);bettingSave();ctx.clearTowerInput?.();
}
export function towerResults(){
  const won=ctx.combat.winner===0;
  ctx.resultsTitle.textContent=won?'УРОВЕНЬ ПРОЙДЕН':'БАШНЯ ЗАВЕРШЕНА';
  ctx.resultsSummary.textContent=won?`Уровень ${ctx.towerRun.level} · получено очко навыков. Дальше: ${ctx.towerRun.level+1} противников.`:'Прогресс сброшен. Заработанные монеты остались в банке.';
  ctx.resultsTotals.replaceChildren();ctx.resultsRows.replaceChildren();
  ctx.root.querySelector('#bet-result-summary').textContent=`БАНК: ${ctx.betting.players[ctx.towerPlayer].balance} МОНЕТ`;
  ctx.resultsAgain.textContent=won?'СЛЕДУЮЩИЙ УРОВЕНЬ':'НОВАЯ ПОПЫТКА';
  ctx.resultsAgain.onclick=()=>ctx.startTower(ctx.towerPlayer);
  ctx.resultsProcedure.hidden=false;ctx.resultsProcedure.textContent='В МЕНЮ';ctx.resultsProcedure.onclick=openMenu;
  ctx.root.querySelector('#tower-controls').hidden=true;ctx.resultsPanel.hidden=false;ctx.resultsAgain.focus();
}
export function installTowerUI(){
  refreshMenu();
  const menu=ctx.root.querySelector('#launch-overlay');
  ctx.root.querySelector('#menu-player').onchange=e=>{ctx.betting.towerPlayerId=Number(e.target.value);bettingSave();refreshMenu();};
  ctx.root.querySelector('#tower-patient').onchange=e=>{if(ctx.betting){towerFor(ctx.betting,ctx.menuPlayer).patient=Number(e.target.value);bettingSave();}};
  ctx.root.querySelector('#tower-reset').onclick=()=>{if(confirm('Сбросить башню выбранного игрока? Банк монет сохранится.')){resetTower(ctx.betting,ctx.menuPlayer);bettingSave();refreshMenu();}};
  ctx.root.querySelector('#launch-tower').onclick=()=>{
    ctx.audio?.unlock();
    if(!ctx.betting){menu.hidden=true;ctx.afterSetup='menu';bettingSetup();return;}
    towerFor(ctx.betting,ctx.menuPlayer).patient=Number(ctx.root.querySelector('#tower-patient').value);
    ctx.startTower(ctx.menuPlayer);
  };
  ctx.root.querySelector('#launch-totalizator').onclick=async()=>{ctx.audio?.unlock();await ctx.startTotalizator();};
  ctx.root.querySelector('#game-menu').onclick=openMenu;
  ctx.root.querySelector('#tower-prep-menu').onclick=openMenu;
  ctx.root.querySelector('#tower-leave').onclick=openMenu;
  if(ctx.mode!=='tower'){
    ctx.root.querySelector('#tower-controls').hidden=true;ctx.root.querySelector('#tower-preparation').hidden=true;
    ctx.resultsProcedure.textContent='ПРОЦЕДУРНАЯ';ctx.resultsAgain.textContent='К СТАВКАМ СЛЕДУЮЩЕГО РАУНДА';ctx.resultsProcedure.hidden=false;
    return;
  }
  ctx.towerSettled=false;
  const off=onGameEvent(event=>{
    if(event.type==='robot-immobilized'&&!ctx.towerSettled&&rewardTower(ctx.betting,ctx.towerPlayer,event.robot,event.lastAttacker)){
      bettingSave();ctx.root.querySelector('#tower-wallet').textContent=`УРОВЕНЬ ${ctx.towerRun.level} · +10 · БАНК ${ctx.betting.players[ctx.towerPlayer].balance}`;
    }
  });
  const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{off();dispose();};
  ctx.root.querySelector('#tower-wallet').textContent=`УРОВЕНЬ ${ctx.towerRun.level} · БАНК ${ctx.betting.players[ctx.towerPlayer].balance}`;
  ctx.resetButton.textContent='В МЕНЮ';ctx.resetButton.onclick=openMenu;
  ctx.speedButton.disabled=true;ctx.svg.onclick=null;ctx.svg.style.cursor='default';
  ctx.root.querySelector('.arena-pause-help').hidden=true;
  installTowerInput();towerPreparation();
}
