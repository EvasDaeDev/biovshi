import {artifactDropChance,ARTIFACT_COMPLETION_REWARD,ARTIFACT_PIECE_COUNT} from './artifacts.js';
import {bossName} from '../boss/names.js';
import {setPaused} from '../ui/controls.js';
import {hasBoss} from '../boss/config.js';
import {bossFloorReward} from '../boss/encounter.js';
import {selectedTowerFloor,selectTowerFloor,TOWER_DANGER_STYLES} from './floors.js';
import {towerEnemyProfile,towerProfileDifference} from './profiles.js';
import {towerMutationSnapshot,towerMutationCombatBonus,TOWER_MUTATIONS,TOWER_MUTATION_IDS,TOWER_MUTATION_FAMILIES,TOWER_MUTATION_SYNERGIES,towerMutationSynergies,chooseTowerMutation} from './mutations.js';
import {TOWER_SURGERY_IDS,TOWER_SURGERY_OPERATIONS,TOWER_SURGERY_MIN_LEVEL,towerSurgeryCapacity,towerSurgeryPrice,towerSurgeryAvailableSites,towerSurgerySiteLabel} from './surgery.js';
import {towerAvailableDonors} from './donors.js';
import {ctx} from '../game/state.js';
import {towerFor,resetTower,completeTower,rewardTower,towerEnemyCount,buyTowerInsurance,buyTowerSurgery,towerEnemyReward} from './model.js';
import {bettingSave} from '../betting/storage.js';
import {bettingSetup,bettingCancel,bettingReadDraft} from '../betting/ui.js';
import {patientRecovery,validStats,earnedStats,redistributeStat,statMultiplier,critChance} from '../garage/model.js';
import {recoverTowerGrafts} from './anatomy.js';
import {startSpawnSequence} from '../game/session.js';
import {rebuildRobots} from '../game/arena.js';
import {onGameEvent} from '../game/event-bus.js';
import {installTowerInput} from './input.js';
import {SKILLS,skillHintAttributes} from '../ui/patient.js';
import {arenaDiagram} from '../game/arenas.js';
import {artifactCollectionMarkup} from './artifact-ui.js';
import {formatChips} from '../ui/currency.js';
import {installTowerUpgradeWindow} from './upgrade-modal.js';
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
  const upgrade=ctx.root.querySelector('#tower-upgrade-window');
  if(upgrade){if(upgrade.open&&typeof upgrade.close==='function')upgrade.close();upgrade.removeAttribute('open');upgrade.hidden=true;}
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
  ctx.root.querySelector('#tower-floor-preview').innerHTML=`${arenaDiagram(ctx.arenaDefinition)}<div><strong>${ctx.arenaDefinition.name}</strong><span>ПРОТИВНИКОВ: ${towerEnemyCount(t)} · РЕКОРД: ${t.record}</span>${t.preparing?'<b>+1 ОЧКО НАВЫКОВ · ПАЦИЕНТ ВОССТАНОВЛЕН</b>':''}<span>${hasBoss(t)?bossName(t.level)+' · ':''}${formatChips(towerEnemyReward(t))} ${hasBoss(t)?'ЗА БОССА · '+formatChips(10)+' ЗА ПАЦИЕНТА · ВСЕ ПРОТИВ ВСЕХ':'ЗА ЛИЧНОЕ ВЫБИВАНИЕ'}</span>${hasBoss(t)?`<span data-artifact-chance>${t.artifacts.pieces.length===ARTIFACT_PIECE_COUNT?'КОЛЛЕКЦИЯ СОБРАНА':'ШАНС ФРАГМЕНТА: '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(artifactDropChance(t.artifacts,t.level)*100)+'%'}</span>`:''}</div>`;
  const encounter=t.floorPlan;
  const preview=ctx.root.querySelector('#tower-floor-preview');
  if(encounter?.options.length>1){
    const choices=document.createElement('div');choices.className='tower-challenge-options';
    encounter.options.forEach((option,index)=>{
      const button=document.createElement('button');button.type='button';
      button.className='tower-challenge-option'+(index===encounter.selected?' is-selected':'');
      button.setAttribute('aria-pressed',String(index===encounter.selected));
      const profileCounts=new Map();
      for(const id of option.profiles)profileCounts.set(id,(profileCounts.get(id)??0)+1);
      const heading=document.createElement('strong');
      const style=TOWER_DANGER_STYLES[option.style];
      const challenge=option.kind==='danger'?'ОПАСНО'+(style?' · '+style.name.toUpperCase():'')+' · 15 ЗА ВЫБИВАНИЕ':'СТАНДАРТ · 10 ЗА ВЫБИВАНИЕ';
      heading.textContent=challenge+' · '+option.profiles.length+' ВРАГ.';
      button.appendChild(heading);
      if(style){
        const detail=document.createElement('small');
        detail.className='tower-challenge-detail';
        detail.textContent=style.description;
        button.appendChild(detail);
      }
      for(const [id,count] of profileCounts){
        const line=document.createElement('span');line.className='tower-enemy-line';
        const label=document.createElement('b');label.textContent=towerEnemyProfile(id).name+(count>1?' ×'+count:'');
        line.appendChild(label);
        if(id!=='basic'){
          const effect=document.createElement('small');effect.textContent=towerProfileDifference(id);
          line.appendChild(effect);
        }
        button.appendChild(line);
      }
      button.onclick=()=>{
        if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||index===encounter.selected)return;
        if(selectTowerFloor(t,index)){bettingSave();ctx.startTower(ctx.towerPlayer);}
      };
      choices.appendChild(button);
    });
    preview.appendChild(choices);
  }
  const fields=ctx.root.querySelector('#tower-stats');fields.replaceChildren();
  let upgradeModal=null;
  let lastSurgeryReceipt=null,lastMutationReceipt=null;
  const upgradeMessage=message=>{
    ctx.root.querySelector('#tower-prep-error').textContent=message;
    const output=ctx.root.querySelector('#tower-upgrade-feedback');
    if(output)output.textContent=message;
  };
  function renderSkills(){
    const snapshot=towerMutationSnapshot(t),stats=snapshot.effective;
    const combatBonus=towerMutationCombatBonus(t.mutations);
    fields.innerHTML=`<div class="garage-stat-list"><small>Побед: ${t.wins} · заработано очков: ${9+t.wins}</small>
      ${SKILLS.map((skill,i)=>`<label ${skillHintAttributes(snapshot,i)}><span>${skill.icon} ${i===2?'Манёвр.':skill.name}</span><select data-tower-stat="${i}" aria-label="${skill.name}">${[earnedStats(t.wins)[i]-1,earnedStats(t.wins)[i],earnedStats(t.wins)[i]+1].filter(n=>n>=2).map(n=>`<option value="${n}" ${n===t.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div>
      <small class="garage-stat-effects">Скор. ${Math.round(statMultiplier(stats[0])*100)}% Мобиль. ${Math.round(statMultiplier(stats[2])*100)}% Крит. ${Math.round(Math.min(.75,critChance(stats[1])+combatBonus.crit)*100)}% · откат ударов ${Math.round(combatBonus.cooldownMultiplier*100)}%</small>
      <button type="button" data-tower-base>ВЕРНУТЬ ИСХОДНЫЕ</button>`;
    fields.querySelectorAll('select').forEach(select=>select.onchange=()=>{
      const index=Number(select.dataset.towerStat);
      t.stats=redistributeStat(t,index,Number(select.value));ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();upgradeModal?.refresh();
      fields.querySelector(`[data-tower-stat="${index}"]`).focus();
    });
    fields.querySelector('[data-tower-base]').onclick=()=>{t.stats=earnedStats(t.wins);ctx.towerGarage[0].stats=[...t.stats];bettingSave();renderSkills();upgradeModal?.refresh();};
  }
  renderSkills();
  // Boss milestone rewards must be chosen before entering the next floor.
  // Place the panel next to normal skill controls without rebuilding the HUD.
  let mutationPanel=ctx.root.querySelector('#tower-prep-mutations');
  if(!mutationPanel){
    mutationPanel=document.createElement('section');
    mutationPanel.id='tower-prep-mutations';
    fields.after(mutationPanel);
  }
  const fightButton=ctx.root.querySelector('#tower-fight');
  function renderMutations(){
    mutationPanel.replaceChildren();
    mutationPanel.hidden=false;
    const heading=document.createElement('strong');
    heading.className='tower-mutation-title';
    heading.textContent=t.mutationDraft?'ПОБЕДА НАД БОССОМ · ВЫБЕРИ МОДУЛЬ':'УСТАНОВЛЕННЫЕ МОДУЛИ';
    mutationPanel.append(heading);
    if(!t.mutationDraft&&!t.mutations.length){
      const empty=document.createElement('small');
      empty.textContent='Первый модуль можно получить после победы над боссом пятого этажа.';
      mutationPanel.append(empty);
    }
    const progress=document.createElement('small');
    progress.className='tower-mutation-progress';
    progress.textContent=`КОМПЛЕКТ ${t.mutations.length}/${TOWER_MUTATION_IDS.length} · СИНЕРГИИ ${towerMutationSynergies(t.mutations).length}/${Object.keys(TOWER_MUTATION_SYNERGIES).length}`;
    mutationPanel.append(progress);
    if(lastMutationReceipt){
      const receipt=document.createElement('p');
      receipt.className='tower-operation-receipt';
      receipt.setAttribute('role','status');
      receipt.textContent='✓ '+lastMutationReceipt;
      mutationPanel.append(receipt);
    }
    if(t.mutationDraft){
      const note=document.createElement('small');
      note.textContent='Выбери один из предложенных модулей. Он останется до конца забега; ДМС сохраняет установленные модули.';
      mutationPanel.append(note);
      const choices=document.createElement('div');
      choices.className='tower-mutation-options';
      for(const id of t.mutationDraft.options){
        const module=TOWER_MUTATIONS[id];
        const button=document.createElement('button');
        button.type='button';
        button.className='tower-mutation-option';
        const label=document.createElement('b');label.textContent=module.name;
        const effect=document.createElement('small');effect.textContent=module.description;
        const family=document.createElement('small');
        const installed=t.mutations.filter(other=>TOWER_MUTATIONS[other]?.family===module.family).length;
        const bonus=TOWER_MUTATION_SYNERGIES[module.family];
        family.textContent=TOWER_MUTATION_FAMILIES[module.family]
          +' · КОМПЛЕКТ '+Math.min(2,installed+1)+'/2'
          +(installed===1?' · '+bonus.description:'');
        button.append(label,effect,family);
        button.onclick=()=>{
          if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||!chooseTowerMutation(t,id))return;
          ctx.towerGarage[0].mutations=[...t.mutations];
          lastMutationReceipt='Модуль установлен: '+module.name;
          bettingSave();renderSkills();renderMutations();syncFightLock();renderSurgery();upgradeModal?.refresh();
          upgradeMessage(lastMutationReceipt);
        };
        choices.append(button);
      }
      mutationPanel.append(choices);
    }
    if(t.mutations.length){
      const equipped=document.createElement('div');
      equipped.className='tower-mutation-equipped';
      equipped.textContent='УСТАНОВЛЕНО: '+t.mutations.map(id=>TOWER_MUTATIONS[id].name).join(' · ');
      mutationPanel.append(equipped);
      const perks=towerMutationCombatBonus(t.mutations);
      if(perks.crit||perks.cooldownMultiplier<1){
        const detail=document.createElement('small');
        detail.className='tower-mutation-synergy';
        detail.textContent='БОЕВЫЕ ЭФФЕКТЫ · +'+Math.round(perks.crit*1000)/10+'% крита · откат атак '+Math.round(perks.cooldownMultiplier*100)+'%';
        mutationPanel.append(detail);
      }
      for(const family of towerMutationSynergies(t.mutations)){
        const synergy=document.createElement('small');synergy.className='tower-mutation-synergy';
        synergy.textContent='СИНЕРГИЯ · '+TOWER_MUTATION_SYNERGIES[family].description;
        mutationPanel.append(synergy);
      }
    }
  }
  function syncFightLock(){
    fightButton.disabled=Boolean(t.mutationDraft);
    fightButton.title=t.mutationDraft?'Сначала выбери модификацию после победы над боссом':'';
  }
  renderMutations();syncFightLock();
  // Paid operations are available only during preparation, in new milestone
  // slots. A procedure is implanted in one actual anatomical segment.
  let surgeryPanel=ctx.root.querySelector('#tower-prep-surgery');
  if(!surgeryPanel){
    surgeryPanel=document.createElement('section');
    surgeryPanel.id='tower-prep-surgery';
    mutationPanel.after(surgeryPanel);
  }
  function renderSurgery(){
    surgeryPanel.replaceChildren();
    const slots=towerSurgeryCapacity(t.level);
    surgeryPanel.hidden=false;
    const heading=document.createElement('strong');
    heading.className='tower-surgery-title';
    heading.textContent='ХИРУРГИЯ · '+t.surgeries.length+'/'+slots;
    surgeryPanel.append(heading);
    if(lastSurgeryReceipt){
      const receipt=document.createElement('p');
      receipt.className='tower-operation-receipt';
      receipt.setAttribute('role','status');
      receipt.textContent='✓ '+lastSurgeryReceipt;
      surgeryPanel.append(receipt);
    }
    if(t.level<TOWER_SURGERY_MIN_LEVEL){
      const soon=document.createElement('small');
      soon.textContent='Операции откроются после прохождения пятого этажа и победы над боссом.';
      surgeryPanel.append(soon);return;
    }
    const installed=document.createElement('small');
    installed.textContent=t.surgeries.length
      ?'ИМПЛАНТИРОВАНО: '+t.surgeries.map(op=>TOWER_SURGERY_OPERATIONS[op.procedure].name+
       ' ('+towerSurgerySiteLabel(op.site)+')').join(' · ')
      :'Первый операционный слот открывается после босса пятого этажа.';
    surgeryPanel.append(installed);
    if(t.surgeries.length>=slots){
      const note=document.createElement('small');
      note.textContent='Свободных слотов нет. Новый откроется после следующего босса (максимум три).';
      surgeryPanel.append(note);
      return;
    }
    const note=document.createElement('small');
    note.textContent='Операция оплачивается монетами и остаётся до конца забега. При потере сегмента её эффект отключится до восстановления. ДМС сохранит проведённые операции.';
    surgeryPanel.append(note);
    const controls=document.createElement('div');
    controls.className='tower-surgery-controls';
    const procedureSelect=document.createElement('select');
    procedureSelect.setAttribute('aria-label','Вид операции');
    for(const id of TOWER_SURGERY_IDS){
      const option=document.createElement('option');option.value=id;
      option.textContent=TOWER_SURGERY_OPERATIONS[id].name+' · '+TOWER_SURGERY_OPERATIONS[id].description;
      procedureSelect.append(option);
    }
    const siteSelect=document.createElement('select');
    siteSelect.setAttribute('aria-label','Сегмент для операции');
    const donorSelect=document.createElement('select');
    donorSelect.setAttribute('aria-label','Донор для пересадки');
    const purchase=document.createElement('button');purchase.type='button';
    purchase.className='tower-surgery-purchase';
    const refreshSites=()=>{
      siteSelect.replaceChildren();
      for(const site of towerSurgeryAvailableSites(t,procedureSelect.value)){
        const option=document.createElement('option');option.value=site;
        option.textContent=towerSurgerySiteLabel(site);
        siteSelect.append(option);
      }
      donorSelect.replaceChildren();
      donorSelect.hidden=!TOWER_SURGERY_OPERATIONS[procedureSelect.value]?.donor;
      for(const donor of towerAvailableDonors(t,procedureSelect.value)){
        const option=document.createElement('option');option.value=donor.id;
        option.textContent=donor.profile+' · '+donor.id;
        donorSelect.append(option);
      }
      const price=towerSurgeryPrice(t);
      purchase.textContent='ОПЕРИРОВАТЬ · '+formatChips(price);
      purchase.disabled=Boolean(t.mutationDraft)||!siteSelect.options.length
        ||(!donorSelect.hidden&&!donorSelect.options.length)
        ||ctx.betting.players[ctx.towerPlayer].balance<price;
      purchase.title=t.mutationDraft?'Сначала выбери награду за босса':
        'Операция на выбранном сегменте; отменить покупку нельзя.';
    };
    procedureSelect.onchange=refreshSites;
    purchase.onclick=()=>{
      if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
      try{
        const procedure=procedureSelect.value,site=siteSelect.value;
        const price=buyTowerSurgery(ctx.betting,ctx.towerPlayer,procedure,site,donorSelect.hidden?null:donorSelect.value);
        ctx.towerGarage[0].surgeries=structuredClone(t.surgeries);
        lastSurgeryReceipt='Операция «'+TOWER_SURGERY_OPERATIONS[procedure].name+'» выполнена на '+towerSurgerySiteLabel(site)+' · −'+price+' монет';
        bettingSave();renderSkills();renderSurgery();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
        renderInsurance();updateTowerHud();upgradeModal?.refresh();
        upgradeMessage(lastSurgeryReceipt);
      }catch(error){upgradeMessage(error.message);}
    };
    controls.append(procedureSelect,siteSelect,donorSelect,purchase);
    surgeryPanel.append(controls);
    refreshSites();
  }
  renderSurgery();
  upgradeModal=installTowerUpgradeWindow({root:ctx.root,run:t,statsPanel:fields,mutationPanel,surgeryPanel});
  ctx.root.querySelector('#tower-prep-artifacts').innerHTML=artifactCollectionMarkup(t.artifacts)+`<p class="artifact-bonus-note">ПОЛНЫЙ АРТЕФАКТ: +${formatChips(ARTIFACT_COMPLETION_REWARD)}</p>`;
  ctx.root.querySelector('#tower-prep-error').textContent='';
  const insuranceButton=ctx.root.querySelector('#tower-insurance');
  const renderInsurance=()=>{
    const c=t.insurance.checkpoint,renewal=Boolean(c&&t.level>c.level);
    insuranceButton.classList.toggle('is-active',Boolean(c));
    insuranceButton.innerHTML=renewal?`ПРОДЛИТЬ ДМС · ${formatChips(t.insurance.price)}`:c?`ДМС · ЭТАЖ ${c.level}`:`ДМС · ${formatChips(t.insurance.price)}`;
    insuranceButton.disabled=Boolean(c&&!renewal)||ctx.betting.players[ctx.towerPlayer].balance<t.insurance.price;
    insuranceButton.title=renewal?`Перенести ДМС с этажа ${c.level} на этаж ${t.level} за ${t.insurance.price} монет и сохранить текущие навыки, протезы и модули. Старый полис заменяется. Следующий тариф дороже на 3%, с округлением вверх.`:c?`При поражении вернёт на этаж ${c.level} с сохранёнными навыками и модулями. Страховка одноразовая. На более высоком этаже её можно продлить.`:'Одноразовая страховка этажа, выбранных навыков и модулей. Следующая покупка дороже на 10%, с округлением вверх.';
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
  fightButton.onclick=()=>{
    if(t.mutationDraft){ctx.root.querySelector('#tower-prep-error').textContent='Сначала выбери модификацию после победы над боссом.';return;}
    const stats=[...fields.querySelectorAll('select')].map(n=>Number(n.value));
    if(!validStats(stats,t.wins)){ctx.root.querySelector('#tower-prep-error').textContent='Можно перенести одно очко между навыками, сохранив их сумму.';return;}
    t.stats=stats;t.preparing=false;
    // Preparing the floor edits the canonical saved run, while initializeGame
    // originally created a detached snapshot and its robot BEFORE purchases.
    // Refresh both sources before the first frame of this very floor.
    ctx.towerRun=structuredClone(t);
    Object.assign(ctx.towerGarage[0],{
      stats:[...t.stats],mutations:[...t.mutations],surgeries:structuredClone(t.surgeries),
      prosthetics:[...(t.prosthetics??[]),...(t.graftProsthetics??[])]
    });
    bettingSave();upgradeModal?.close();panel.hidden=true;
    rebuildRobots();
    ctx.telemetryDirty=true;ctx.lastTelemetryAt=-Infinity;
    ctx.root.querySelector('#tower-controls').hidden=false;startSpawnSequence();
  };
  (t.mutationDraft?mutationPanel.querySelector('.tower-mutation-option'):fightButton)?.focus();
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
  if(won){patientRecovery(t,ctx.robots[0]);recoverTowerGrafts(t,ctx.robots[0]);}
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
  ctx.resultsSummary.textContent=won?`Получено +1 очко навыков. ${t.mutationDraft?'Открыт выбор модификации после победы над боссом. ':''}Далее — этаж ${t.level}, противников: ${towerEnemyCount(t)}.`:`${o.reason??'Поражение'} на этаже ${o.floor}. ${o.insuranceFloor?`ДМС сработала: возврат на этаж ${o.insuranceFloor} с застрахованными навыками. Страховка использована.`:'Заработанные монеты сохранены.'}`;
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
    const staleUpgrade=ctx.root.querySelector('#tower-upgrade-window');
    if(staleUpgrade?.open&&typeof staleUpgrade.close==='function')staleUpgrade.close();
    staleUpgrade?.remove();
    ctx.root.querySelector('#tower-upgrade-open')?.remove();
    ctx.root.querySelector('#tower-controls').hidden=true;ctx.root.querySelector('#tower-preparation').hidden=true;
    ctx.resultsProcedure.textContent='ПРОЦЕДУРНАЯ';ctx.resultsAgain.textContent='К СТАВКАМ СЛЕДУЮЩЕГО РАУНДА';ctx.resultsProcedure.hidden=false;
    return;
  }
  ctx.towerSettled=false;ctx.towerFloorCoins=0;ctx.towerOutcome=null;ctx.towerFeedbackUntil=0;
  const off=onGameEvent(event=>{
    if(event.type==='robot-immobilized'&&!ctx.towerSettled&&rewardTower(ctx.betting,ctx.towerPlayer,event.robot,event.lastAttacker)){
      const reward=towerEnemyReward(ctx.towerRun,event.robot);ctx.towerFloorCoins+=reward;bettingSave();
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

