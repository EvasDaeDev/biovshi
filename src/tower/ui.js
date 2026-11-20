import {artifactDropChance,ARTIFACT_COMPLETION_REWARD,ARTIFACT_PIECE_COUNT} from './artifacts.js';
import {bossName} from '../boss/names.js';
import {setPaused} from '../ui/controls.js';
import {hasBoss,isBossFloor} from '../boss/config.js';
import {bossFloorReward} from '../boss/encounter.js';
import {selectedTowerFloor} from './floors.js';
import {TOWER_RELATION_NAMES} from './relations.js';
import {towerMutationSnapshot,towerMutationCombatBonus,TOWER_MUTATIONS,TOWER_MUTATION_IDS,TOWER_MUTATION_FAMILIES,TOWER_MUTATION_SYNERGIES,towerMutationSynergies,towerMutationEffectText,chooseTowerMutation,
 equipTowerMutation,removeTowerMutation,towerInstalledItems,towerMutationInstallPrice,TOWER_MUTATION_LIMIT,TOWER_RARITIES} from './mutations.js';
import {towerCycleWins,towerCycleInfo,towerCycleTitle,towerFloorLabel} from './cycles.js';
import {TOWER_MUTATION_ATLAS,towerUpgradeApplies} from './upgrade-appearance.js';
import {towerSegmentStacks,towerInstalledSegments,towerUnreadSegments,markTowerSegmentSeen,towerSegmentSellPrice,TOWER_SEGMENT_INSTALL_PRICE,equipTowerSegment,removeTowerSegment,sellTowerSegment} from './segments.js';
import {ROBOT_PARTS} from '../render/robot-skin.js';
import {TOWER_SURGERY_IDS,TOWER_SURGERY_OPERATIONS,TOWER_SURGERY_MIN_LEVEL,towerSurgeryCapacity,towerSurgeryPrice,towerSurgeryReplacePrice,towerSurgeryAvailableSites,towerSurgerySiteLabel} from './surgery.js';
import {towerAvailableDonors} from './donors.js';
import {ctx} from '../game/state.js';
import {towerFor,resetTower,completeTower,rewardTower,towerEnemyCount,buyTowerInsurance,buyTowerSurgery,towerEnemyReward} from './model.js';
import {bettingSave} from '../betting/storage.js';
import {bettingSetup,bettingCancel,bettingReadDraft} from '../betting/ui.js';
import {patientRecovery,validStats,earnedStats,redistributeStat,statMultiplier,critChance} from '../garage/model.js';
import {recoverTowerGrafts,towerPatientAnatomy} from './anatomy.js';
import {startSpawnSequence} from '../game/session.js';
import {rebuildRobots} from '../game/arena.js';
import {onGameEvent} from '../game/event-bus.js';
import {installTowerInput} from './input.js';
import {SKILLS,skillHintAttributes} from '../ui/patient.js';
import {renderTowerFloorChoices} from './floor-selector.js';
import {artifactCollectionMarkup} from './artifact-ui.js';
import {formatChips} from '../ui/currency.js';
import {purchaseTowerStatChange,towerStatChangePrice} from './economy.js';
import {installTowerUpgradeWindow} from './upgrade-modal.js';
import {chooseTowerModuleReplacement} from './replacement-dialog.js';
import {confirmGameAction} from '../ui/confirm-action.js';
import {playerBalanceMarkup} from '../ui/currency-animation.js';

function renderTowerPlayerWallet(target){
  const player=ctx.betting.players[ctx.towerPlayer];
  const name=document.createElement('span');name.className='tower-player-name';name.textContent=player.name;
  if(target.id==='tower-prep-name'){
    const record=document.createElement('span');record.className='tower-record-height';
    record.textContent=' · РЕКОРДНАЯ ВЫСОТА: '+towerFor(ctx.betting,ctx.towerPlayer).record+' ЭТАЖ';
    name.append(record);
  }
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
  ctx.root.querySelector('#launch-tower').textContent=`РЕЖИМ БАШНЯ · ЭТАЖ ${towerFloorLabel(t?.level??1)}`;
  ctx.root.querySelector('#menu-tower-progress').textContent=`ПРОЙДЕНО ЭТАЖЕЙ: ${t?.wins??0} · РЕКОРД: ${t?.record??0}`;
  ctx.root.querySelector('#tower-reset').disabled=!s;
  ctx.root.querySelector('#launch-totalizator').hidden=!s;
  const newGame=ctx.root.querySelector('#launch-setup');
  newGame.textContent=s?'НОВАЯ ИГРА':'СОЗДАТЬ ИГРУ';
  newGame.classList.toggle('is-new-game',Boolean(s));
}
const menuDescriptions = [
  {
    body: 'Здесь ломаются конечности, сгорают ставки и умирают надежды. Ты будешь злиться, проигрывать и клясться больше не возвращаться.',
    ending: 'Но мы-то знаем, что завтра ты снова придёшь на процедуры.'
  },
  {
    body: 'Добро пожаловать в клинику, где пациенты калечат друг друга, ставки не оправдываются, а нервные срывы входят в стоимость лечения.',
    ending: 'Удаление игры не считается выпиской.'
  },
  {
    body: 'Ты будешь ненавидеть эту игру. Проклинать случайность, проигрывать ставки и смотреть, как твоего любимого урода разбирают на запчасти.',
    ending: 'Побочные эффекты? Привыкание, агрессия и повторная госпитализация.'
  }
];
let menuDescriptionQueue = [];
let previousMenuDescription = -1;
function rotateMenuDescription() {
  const target = ctx.root?.querySelector('#launch-overlay .launch-subtitle');
  if (!target) return;
  // Shuffle a complete cycle so all three messages appear before any repeats.
  if (!menuDescriptionQueue.length) {
    menuDescriptionQueue = menuDescriptions.map((_, index) => index);
    for (let i = menuDescriptionQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [menuDescriptionQueue[i], menuDescriptionQueue[j]] = [menuDescriptionQueue[j], menuDescriptionQueue[i]];
    }
    if (menuDescriptionQueue[0] === previousMenuDescription && menuDescriptionQueue.length > 1) {
      [menuDescriptionQueue[0], menuDescriptionQueue[1]] = [menuDescriptionQueue[1], menuDescriptionQueue[0]];
    }
  }
  previousMenuDescription = menuDescriptionQueue.shift();
  const {body, ending} = menuDescriptions[previousMenuDescription];
  const lead = document.createElement('span');
  lead.textContent = body;
  const punchline = document.createElement('strong');
  punchline.textContent = ending;
  target.replaceChildren(lead, punchline);
}

export function openMenu(){
  const active=['spawning','running'].includes(ctx.startup.phase)&&!ctx.combat.finished;
  if(active&&!confirm('Вернуться в главное меню? Текущий бой будет отменён.'))return false;
  if(active)bettingCancel();
  if(!ctx.betOverlay.hidden&&ctx.betContent.querySelector('#bet-stakes-form')){
    ctx.betDraft={session:ctx.betting,round:ctx.betting.round,bets:bettingReadDraft(),arenaId:ctx.selectedArenaId};
  }
  const replacementDialog=ctx.root.querySelector('#tower-module-replacement');
  if(replacementDialog?.open&&typeof replacementDialog.close==='function')replacementDialog.close();
  replacementDialog?.remove();
  ctx.root.querySelector('#tower-start-countdown')?.setAttribute('hidden','');
  ctx.startup.phase='menu';
  ctx.clearTowerInput?.();ctx.clearTowerDestination?.();setPaused(true);
  ctx.betOverlay.hidden=true;ctx.resultsPanel.hidden=true;
  ctx.root.querySelector('#tower-preparation').hidden=true;
  const upgrade=ctx.root.querySelector('#tower-upgrade-window');
  if(upgrade){if(upgrade.open&&typeof upgrade.close==='function')upgrade.close();upgrade.removeAttribute('open');upgrade.hidden=true;}
  ctx.root.querySelector('#tower-controls').hidden=true;
  ctx.root.dataset.gameMode='menu';ctx.deferTowerArena=false;
  refreshMenu();rotateMenuDescription();ctx.root.querySelector('#launch-overlay').hidden=false;
  ctx.root.querySelector('#launch-tower').focus();
  return true;
}
export function towerPreparation(){
  const t=towerFor(ctx.betting,ctx.towerPlayer),panel=ctx.root.querySelector('#tower-preparation');
  // Start the new equipment system for clean runs. Existing Tower saves
  // with whole-kit rewards keep their legacy UI until the next fresh run.
  if(t.segmentRewardsEnabled===undefined&&!t.mutationDraft&&
     !(t.mutations?.length||t.mutationInventory?.length))t.segmentRewardsEnabled=true;
  // This is a screen transition, not a popup dismissal. All paid state is already saved.
  const back=ctx.root.querySelector('#tower-prep-back');
  back.onclick=()=>{
    if(ctx.settingsOpen)return;
    const upgrade=ctx.root.querySelector('#tower-upgrade-window');
    if(upgrade?.open)return;
    if(ctx.root.querySelector('#tower-cycle-notice[open]'))return;
    openMenu();
  };
  ctx.startup.phase='tower-ready';ctx.resultsPanel.hidden=true;ctx.root.querySelector('#tower-controls').hidden=true;
  panel.hidden=false;const title=ctx.root.querySelector('#tower-prep-title');
  title.classList.toggle('boss-floor-title',hasBoss(t));
  const bossFloor=hasBoss(t);
  const headingText=bossFloor?`${bossName(t.level)} · ЭТАЖ №${towerFloorLabel(t.level)}`:`ПОДГОТОВКА · ЭТАЖ ${towerFloorLabel(t.level)}`;
  const headingLine=document.createElement('span');
  headingLine.className='tower-prep-title-line';
  headingLine.textContent=headingText;
  if(bossFloor){
    const bossLabel=document.createElement('span');
    bossLabel.className='tower-prep-boss-label';
    bossLabel.textContent='БОСС';
    title.replaceChildren(bossLabel,headingLine);
  }else title.replaceChildren(headingLine);
  renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
  renderTowerFloorChoices({container:ctx.root.querySelector('#tower-floor-preview'),
    session:ctx.betting,player:ctx.towerPlayer,run:t,onSave:bettingSave,
    fallbackArenaId:ctx.arenaDefinition?.id??'ward',
    onChange:()=>{renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));renderSkills();renderInsurance();upgradeModal?.refresh();},
    onError:message=>{ctx.root.querySelector('#tower-prep-error').textContent=message;}});
  const fields=ctx.root.querySelector('#tower-stats');fields.replaceChildren();
  let upgradeModal=null;
  let lastSurgeryReceipt=null,lastMutationReceipt=null,lastStatReceipt=null;
  let draftStats=[...t.stats];
  const upgradeMessage=message=>{
    ctx.root.querySelector('#tower-prep-error').textContent=message;
    const output=ctx.root.querySelector('#tower-upgrade-feedback');
    if(output)output.textContent=message;
  };
  function renderSkills(){
    const snapshot=towerMutationSnapshot({...t,stats:draftStats}),stats=snapshot.effective;
    const initial=towerMutationSnapshot(t).effective;
    const combatBonus=towerMutationCombatBonus([...t.mutations,...towerInstalledSegments(t).map(item=>item.type)]);
    const comparison=(label,value,base)=>{
      const diff=value-base;
      const cls=diff>0?'is-positive':diff<0?'is-negative':'';
      return '<span class="tower-stat-preview"><span>'+label+'</span> <strong class="'+cls+'">'+value+'%'+(diff>0?' ▲':diff<0?' ▼':'')+'</strong></span>';
    };
    const current=[Math.round(statMultiplier(stats[0])*100),Math.round(statMultiplier(stats[2])*100),
      Math.round(Math.min(.75,critChance(stats[1])+combatBonus.crit)*100)];
    const original=[Math.round(statMultiplier(initial[0])*100),Math.round(statMultiplier(initial[2])*100),
      Math.round(Math.min(.75,critChance(initial[1])+combatBonus.crit)*100)];
    const changePrice=towerStatChangePrice(t);
    fields.innerHTML=`<div class="garage-stat-list"><small>Побед: ${t.wins} · очков в текущем цикле: ${9+towerCycleWins(t.level)}</small>
      ${SKILLS.map((skill,i)=>`<label ${skillHintAttributes(snapshot,i)} aria-label="${skill.name}"><span class="tower-skill-icon" aria-hidden="true">${skill.icon}</span><select data-tower-stat="${i}" class="${draftStats[i]>earnedStats(towerCycleWins(t.level))[i]?'tower-stat-boosted':draftStats[i]<earnedStats(towerCycleWins(t.level))[i]?'tower-stat-reduced':''}" aria-label="${skill.name}">${[earnedStats(towerCycleWins(t.level))[i]-1,earnedStats(towerCycleWins(t.level))[i],earnedStats(towerCycleWins(t.level))[i]+1].filter(n=>n>=2).map(n=>`<option value="${n}" ${n===draftStats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="garage-stat-effects tower-stat-previews"><span class="tower-preview-label ${draftStats.some((v,i)=>v!==t.stats[i])?'is-active':''}">ПРЕДПРОСМОТР</span>${comparison('СКОРОСТЬ',current[0],original[0])}${comparison('МОБИЛЬНОСТЬ',current[1],original[1])}${comparison('КРИТ',current[2],original[2])}<span class="tower-stat-preview"><span>ОТКАТ УДАРОВ</span> <strong>${Math.round(combatBonus.cooldownMultiplier*100)}%</strong></span></div>
      <div class="tower-stat-confirm"><button type="button" data-tower-base>ВЕРНУТЬ ИСХОДНЫЕ</button><button type="button" data-tower-apply>ПРИМЕНИТЬ · ${changePrice?formatChips(changePrice):'БЕСПЛАТНО'}</button></div><small class="tower-stat-message" role="status"></small>`;
    const changed=draftStats.some((v,i)=>v!==t.stats[i]);
    const transfer=draftStats.reduce((sum,v,i)=>sum+Math.max(0,v-t.stats[i]),0);
    const apply=fields.querySelector('[data-tower-apply]');
    apply.disabled=!changed||transfer!==1||!validStats(draftStats,towerCycleWins(t.level))
      ||t.arenaRerollLocked||Boolean(t.rewarded?.length)
      ||ctx.betting.players[ctx.towerPlayer].balance<changePrice;
    fields.querySelector('.tower-stat-message').textContent=lastStatReceipt?'✓ '+lastStatReceipt:'';
    fields.querySelectorAll('select').forEach(select=>select.onchange=()=>{
      const index=Number(select.dataset.towerStat);
      try{draftStats=redistributeStat({...t,wins:towerCycleWins(t.level),stats:draftStats},index,Number(select.value));lastStatReceipt=null;}
      catch(error){upgradeMessage(error.message);}
      renderSkills();
      fields.querySelector(`[data-tower-stat="${index}"]`)?.focus();
    });
    fields.querySelector('[data-tower-base]').onclick=()=>{
      draftStats=earnedStats(towerCycleWins(t.level));lastStatReceipt=null;renderSkills();
    };
    apply.onclick=()=>{
      if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||apply.disabled)return;
      const proposed=[...draftStats],prior=[...t.stats];
      const changed=SKILLS.map((skill,i)=>proposed[i]===prior[i]?null:
        skill.name+': '+prior[i]+' → '+proposed[i]).filter(Boolean);
      confirmGameAction({
        root:ctx.root,
        title:'ПЕРЕРАСПРЕДЕЛЕНИЕ НАВЫКОВ',
        details:[...changed,changePrice?'Изменения вступят в силу после списания монет.':'Первое перераспределение навыков бесплатно.'],
        ...(changePrice?{cost:changePrice}:{}),
        confirmLabel:'ПРИМЕНИТЬ',
        onConfirm:()=>{
          if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
          try{
            const spent=purchaseTowerStatChange(ctx.betting,ctx.towerPlayer,t,proposed);
            ctx.towerGarage[0].stats=[...t.stats];
            lastStatReceipt=spent?'Перераспределение подтверждено · −'+spent+' монет':'Первое перераспределение подтверждено бесплатно';
            bettingSave();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
            renderInsurance();renderSkills();upgradeModal?.refresh();upgradeMessage(lastStatReceipt);
          }catch(error){upgradeMessage(error.message);renderSkills();}
        }
      });
    };
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
  let selectedReward=null,selectedOwned=null;
  function mutationIcon(type,site=null){
    const node=document.createElement('span');node.className='tower-mod-icon';
    const candidate=site?[site,towerPatientAnatomy(t)?.skinParts?.[site]??ROBOT_PARTS[site]]:Object.entries(ROBOT_PARTS).find(([partSite])=>towerUpgradeApplies(type,partSite));
    if(candidate?.[1]){const [,part]=candidate;
      node.style.backgroundImage=`url("${TOWER_MUTATION_ATLAS[type]}")`;
      node.style.backgroundSize='400% 400%';
      node.style.backgroundPosition=`${part.col/3*100}% ${part.row/3*100}%`;
    }
    return node;
  }
  function syncSegments(){
    if(ctx.towerGarage?.[0]){
      ctx.towerGarage[0].segmentInventory=structuredClone(t.segmentInventory);
      ctx.towerGarage[0].equippedSegments=[...t.equippedSegments];
    }
    bettingSave();renderMutations();renderSkills();renderInsurance();
    renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
    updateTowerHud();upgradeModal?.refresh();upgradeMessage('');
  }
  function renderSegmentInventory(){
    mutationPanel.replaceChildren();mutationPanel.hidden=false;
    const title=document.createElement('strong');title.className='tower-mutation-title';
    title.textContent='СЕГМЕНТНЫЕ МОДИФИКАЦИИ';mutationPanel.append(title);
    const equipped=towerInstalledSegments(t),stacks=towerSegmentStacks(t);
    const unread=towerUnreadSegments(t);
    const summary=document.createElement('small');summary.className='tower-mutation-progress';
    summary.textContent='УСТАНОВЛЕНО '+equipped.length+' · НА СКЛАДЕ '+stacks.reduce((n,x)=>n+x.count,0);
    mutationPanel.append(summary);
    if(lastMutationReceipt){
      const receipt=document.createElement('p');receipt.className='tower-operation-receipt';
      receipt.setAttribute('role','status');receipt.textContent='✓ '+lastMutationReceipt;mutationPanel.append(receipt);
    }
    const entries=[...equipped.map(item=>({...item,count:1,representativeId:item.id,installed:true})),
      ...stacks.map(item=>({...item,installed:false}))];
    if(!entries.length){
      const note=document.createElement('small');
      note.textContent='Склад пуст. Первые части появятся после победы над боссом.';
      mutationPanel.append(note);return;
    }
    const grid=document.createElement('div');grid.className='tower-inventory-grid';
    for(const item of entries){
      const selected=selectedOwned===item.representativeId;
      const button=document.createElement('button');button.type='button';
      const isNew=!item.installed&&t.segmentInventory.some(entry=>entry.type===item.type&&entry.site===item.site&&entry.rarity===item.rarity&&unread.has(entry.id));
      button.className='tower-inventory-item'+(item.installed?' is-equipped':'')+(selected?' is-selected':'')+(isNew?' is-new':'');
      button.dataset.mutationType=item.type;button.dataset.mutationId=item.representativeId;
      button.dataset.mutationSite=item.site;
      button.dataset.mutationRarity=String(item.rarity);
      button.setAttribute('aria-pressed',String(selected));
      const icon=mutationIcon(item.type,item.site);button.append(icon);
      const label=document.createElement('strong');label.textContent=TOWER_MUTATIONS[item.type].name;
      const status=document.createElement('small');
      status.textContent=towerSurgerySiteLabel(item.site)+' · '+TOWER_RARITIES[item.rarity].name+(item.installed?' · УСТАНОВЛЕНО':'');
      button.append(label,status);
      if(isNew){const dot=document.createElement('span');dot.className='tower-new-dot';dot.setAttribute('aria-label','Новый предмет');button.append(dot);}
      if(item.count>1){
        const count=document.createElement('span');count.className='tower-segment-count';
        count.textContent=String(item.count);button.append(count);
      }
      button.onclick=()=>{
        selectedOwned=item.representativeId;
        if(markTowerSegmentSeen(t,item))bettingSave();
        renderMutations();upgradeModal?.refresh();
      };
      grid.append(button);
    }
    mutationPanel.append(grid);
    const chosen=entries.find(item=>item.representativeId===selectedOwned);
    if(!chosen)return;
    const description=document.createElement('small');description.className='tower-mutation-detail';
    description.textContent=TOWER_MUTATIONS[chosen.type].name+' · '+towerSurgerySiteLabel(chosen.site)+
      ' · '+TOWER_RARITIES[chosen.rarity].name+' · '+towerMutationEffectText(chosen.type);
    mutationPanel.append(description);
    const actions=document.createElement('div');actions.className='tower-mutation-action-area';
    const install=document.createElement('button');install.type='button';install.className='tower-mutation-install';
    install.innerHTML=chosen.installed?'СНЯТЬ · БЕСПЛАТНО':'УСТАНОВИТЬ · '+formatChips(TOWER_SEGMENT_INSTALL_PRICE);
    install.disabled=!chosen.installed&&ctx.betting.players[ctx.towerPlayer].balance<TOWER_SEGMENT_INSTALL_PRICE;
    install.onclick=()=>{
      if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||install.disabled)return;
      const previous=equipped.find(item=>item.site===chosen.site);
      confirmGameAction({
        root:ctx.root,title:chosen.installed?'СНЯТЬ СЕГМЕНТ':previous?'ЗАМЕНИТЬ СЕГМЕНТ':'УСТАНОВИТЬ СЕГМЕНТ',
        details:[TOWER_MUTATIONS[chosen.type].name+' · '+towerSurgerySiteLabel(chosen.site),
          chosen.installed?'Предмет вернётся на склад':
          previous?'Прежний установленный сегмент бесплатно вернётся на склад':'Бонус: '+towerMutationEffectText(chosen.type)],
        ...(chosen.installed?{}:{cost:TOWER_SEGMENT_INSTALL_PRICE}),
        confirmLabel:chosen.installed?'СНЯТЬ':previous?'ЗАМЕНИТЬ':'УСТАНОВИТЬ',
        onConfirm:()=>{
          try{
            if(chosen.installed){
              if(!removeTowerSegment(t,chosen.representativeId))return;
              lastMutationReceipt='Часть снята и возвращена на склад';
            }else{
              equipTowerSegment(ctx.betting,ctx.towerPlayer,t,chosen.representativeId);
              lastMutationReceipt='Часть установлена · −75 монет';
            }
            selectedOwned=null;syncSegments();
          }catch(error){upgradeMessage(error.message);}
        }
      });
    };
    const sell=document.createElement('button');sell.type='button';sell.className='tower-mutation-install tower-segment-sell';
    const price=towerSegmentSellPrice(chosen.rarity);
    sell.innerHTML='ПРОДАТЬ · +'+formatChips(price);sell.disabled=chosen.installed;
    sell.onclick=()=>{
      if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||sell.disabled)return;
      confirmGameAction({root:ctx.root,title:'ПРОДАЖА СЕГМЕНТА',
        details:[TOWER_MUTATIONS[chosen.type].name+' · '+towerSurgerySiteLabel(chosen.site),
          'Продан будет один экземпляр. Продажу нельзя отменить.'],
        confirmLabel:'ПРОДАТЬ',onConfirm:()=>{
          try{
            sellTowerSegment(ctx.betting,ctx.towerPlayer,t,chosen.representativeId);
            selectedOwned=null;lastMutationReceipt='Продано · +'+price+' монет';syncSegments();
          }catch(error){upgradeMessage(error.message);}
        }});
    };
    actions.append(install,sell);mutationPanel.append(actions);
  }
  function renderMutations(){
    if(t.segmentRewardsEnabled){renderSegmentInventory();return;}
    mutationPanel.replaceChildren();mutationPanel.hidden=false;
    const heading=document.createElement('strong');heading.className='tower-mutation-title';
    heading.textContent=t.mutationDraft?'БОСС СПИСАН · ВЫБЕРИ ИМУЩЕСТВО':'ЛИЧНОЕ ИМУЩЕСТВО ПАЦИЕНТА';
    mutationPanel.append(heading);
    const progress=document.createElement('small');progress.className='tower-mutation-progress';
    progress.textContent=`УСТАНОВЛЕНО ${t.equippedMutations.length}/${TOWER_MUTATION_LIMIT} · НА СКЛАДЕ ${t.mutationInventory.length-t.equippedMutations.length} · СИНЕРГИИ ${towerMutationSynergies(t.mutations).length}`;
    mutationPanel.append(progress);
    if(lastMutationReceipt){const receipt=document.createElement('p');receipt.className='tower-operation-receipt';receipt.setAttribute('role','status');receipt.textContent='✓ '+lastMutationReceipt;mutationPanel.append(receipt);}
    if(t.mutationDraft){
      const note=document.createElement('small');
      note.textContent='Один из трёх предметов — бесплатно. Монеты потребуются только для последующей установки.';
      mutationPanel.append(note);
      const choices=document.createElement('div');choices.className='tower-mutation-options tower-reward-options';
      for(const id of t.mutationDraft.options){
        const mod=TOWER_MUTATIONS[id],button=document.createElement('button');button.type='button';
        button.className='tower-mutation-option'+(selectedReward===id?' is-selected':'');
        button.dataset.mutationType=id;button.dataset.mutationRarity=String(t.mutationDraft.rarity??0);
        button.setAttribute('aria-pressed',String(selectedReward===id));
        button.append(mutationIcon(id));
        const label=document.createElement('b');label.textContent=mod.name;
        const effect=document.createElement('small');effect.textContent=mod.description+' · '+towerMutationEffectText(id);
        const family=document.createElement('small');family.textContent=TOWER_MUTATION_FAMILIES[mod.family]+' · '+TOWER_RARITIES[t.mutationDraft.rarity??0].name;
        button.append(label,effect,family);
        button.onclick=()=>{selectedReward=id;renderMutations();upgradeModal?.refresh();};
        choices.append(button);
      }
      mutationPanel.append(choices);
      const claim=document.createElement('button');claim.type='button';claim.className='tower-mutation-claim';
      claim.textContent=selectedReward?'ЗАБРАТЬ В СВОЮ СОБСТВЕННОСТЬ · '+TOWER_MUTATIONS[selectedReward].name:'СНАЧАЛА ВЫБЕРИ ДЕТАЛЬ';
      claim.disabled=!selectedReward;
      claim.onclick=()=>{
        if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||!selectedReward)return;
        const item=chooseTowerMutation(t,selectedReward);if(!item)return;
        selectedOwned=item.id;lastMutationReceipt='ПОЛУЧЕНО: '+TOWER_MUTATIONS[item.type].name+'. УСТАНОВКА ОПЛАЧИВАЕТСЯ ОТДЕЛЬНО.';
        selectedReward=null;bettingSave();renderMutations();renderSkills();syncFightLock();renderSurgery();upgradeModal?.refresh();
        upgradeMessage('');showCycleNotice();
      };
      mutationPanel.append(claim);
    }
    const owned=t.mutationInventory;
    if(!owned.length&&!t.mutationDraft){const note=document.createElement('small');note.textContent='Склад пуст. Первый предмет появится после пятого этажа.';mutationPanel.append(note);}
    if(owned.length){
      const grid=document.createElement('div');grid.className='tower-inventory-grid';
      for(const item of owned){
        const equipped=t.equippedMutations.includes(item.id),mod=TOWER_MUTATIONS[item.type];
        const button=document.createElement('button');button.type='button';
        button.className='tower-inventory-item'+(equipped?' is-equipped':'')+(selectedOwned===item.id?' is-selected':'');
        button.dataset.mutationType=item.type;button.dataset.mutationId=item.id;button.dataset.mutationRarity=String(item.rarity);
        button.setAttribute('aria-pressed',String(selectedOwned===item.id));
        button.title=[mod.name,mod.description,towerMutationEffectText(item.type),TOWER_RARITIES[item.rarity].name,
          equipped?'Установлен · снять бесплатно':'На складе · установка '+towerMutationInstallPrice(t)+' монет'].join(' · ');
        button.append(mutationIcon(item.type));
        const label=document.createElement('strong');label.textContent=mod.name;
        const status=document.createElement('small');status.textContent=TOWER_RARITIES[item.rarity].name+(equipped?' · УСТАНОВЛЕНО':' · СКЛАД');
        button.append(label,status);
        button.onclick=()=>{selectedOwned=item.id;renderMutations();upgradeModal?.refresh();};
        grid.append(button);
      }
      mutationPanel.append(grid);
      const selected=owned.find(item=>item.id===selectedOwned)??owned.at(-1);
      if(selected){
        const mod=TOWER_MUTATIONS[selected.type],equipped=t.equippedMutations.includes(selected.id);
        const details=document.createElement('small');details.className='tower-mutation-detail';
         details.textContent=mod.name+' · '+mod.description+' · '+TOWER_MUTATION_FAMILIES[mod.family]+' · '+
           towerMutationEffectText(selected.type);
        mutationPanel.append(details);
        const action=document.createElement('button');action.type='button';action.className='tower-mutation-install';
        const replacement=towerInstalledItems(t).find(item=>item.type===selected.type&&item.id!==selected.id);
        const full=t.equippedMutations.length>=TOWER_MUTATION_LIMIT;
        action.innerHTML=equipped?'СНЯТЬ · БЕСПЛАТНО':'УСТАНОВИТЬ · '+formatChips(towerMutationInstallPrice(t));
        action.disabled=Boolean(t.mutationDraft)||(!equipped&&ctx.betting.players[ctx.towerPlayer].balance<towerMutationInstallPrice(t));
        action.onclick=()=>{
          if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||action.disabled)return;
          const finish=(replaceId=null)=>{
            if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
            try{
              if(equipped){
                if(!removeTowerMutation(t,selected.id))return;
                lastMutationReceipt=mod.name+' снят и возвращён на склад';
              }else{
                const charged=equipTowerMutation(ctx.betting,ctx.towerPlayer,t,selected.id,replaceId);
                lastMutationReceipt=mod.name+' установлен · −'+charged+' монет · '+towerMutationEffectText(selected.type);
              }
              ctx.towerGarage[0].mutations=[...t.mutations];
              ctx.towerGarage[0].mutationInventory=structuredClone(t.mutationInventory);
              ctx.towerGarage[0].equippedMutations=[...t.equippedMutations];
              bettingSave();renderMutations();renderSkills();renderInsurance();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
              updateTowerHud();upgradeModal?.refresh();upgradeMessage('');
            }catch(error){upgradeMessage(error.message);}
          };
          if(!equipped&&full&&!replacement){
            chooseTowerModuleReplacement({
              root:ctx.root,
              installed:towerInstalledItems(t),
              installName:mod.name,
              price:towerMutationInstallPrice(t),
              onConfirm:id=>finish(id)
            });
            return;
          }
          const replaceId=replacement?.id??null;
          const displaced=replaceId?towerInstalledItems(t).find(item=>item.id===replaceId):null;
          confirmGameAction({
            root:ctx.root,
            title:equipped?'СНЯТИЕ МОДУЛЯ':replaceId?'ЗАМЕНА МОДУЛЯ':'УСТАНОВКА МОДУЛЯ',
            details:[
              'Модуль: '+mod.name+' · '+TOWER_RARITIES[selected.rarity].name,
              equipped?'Модуль вернётся на склад. Повторная установка будет платной.':
                'Эффект: '+towerMutationEffectText(selected.type),
              displaced?'Снимаем «'+TOWER_MUTATIONS[displaced.type].name+'». Модуль останется на складе.':''
            ],
            ...(equipped?{}:{cost:towerMutationInstallPrice(t)}),
            confirmLabel:equipped?'СНЯТЬ':replaceId?'ЗАМЕНИТЬ':'УСТАНОВИТЬ',
            onConfirm:()=>finish(replaceId)
          });
        };
        // Keep the paid install / free removal action in the bottom zone,
        // detached from the selected module's icon and description.
        const actionArea=document.createElement('div');actionArea.className='tower-mutation-action-area';
        actionArea.append(action);mutationPanel.append(actionArea);
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
      soon.textContent='ХИРУРГИЯ ЗАКРЫТА. Победи второго босса на 10-м этаже первого восхождения.';
      surgeryPanel.append(soon);return;
    }
    const installed=document.createElement('small');
    installed.textContent=t.surgeries.length
      ?'ИМПЛАНТИРОВАНО: '+t.surgeries.map(op=>TOWER_SURGERY_OPERATIONS[op.procedure].name+
       ' ('+towerSurgerySiteLabel(op.site)+')').join(' · ')
      :'Первый операционный слот открывается после победы над боссом десятого этажа.';
    surgeryPanel.append(installed);
    const stock=t.surgicalStock??[];
    const stockSummary=document.createElement('small');
    stockSummary.className='tower-surgical-stock-summary';
    stockSummary.textContent='СКЛАД ИМПЛАНТОВ · '+stock.length+(stock.length?
      ' · '+stock.map(item=>TOWER_SURGERY_OPERATIONS[item.procedure].name).join(', '):
      ' · снятые обычные импланты появятся здесь');
    surgeryPanel.append(stockSummary);
    if(t.surgeries.length>=slots){
      const note=document.createElement('small');
      note.textContent='Все операционные места заняты. Можно платно заменить ранее проведённую операцию.';
      surgeryPanel.append(note);
    }
    const note=document.createElement('small');
    note.textContent='Операция оплачивается монетами и остаётся до конца забега. При потере сегмента её эффект отключится до восстановления. ДМС сохранит проведённые операции.';
    surgeryPanel.append(note);
    const controls=document.createElement('div');
    controls.className='tower-surgery-controls';
    const replaceSelect=document.createElement('select');replaceSelect.setAttribute('aria-label','Заменяемая операция');
    let replacement=document.createElement('option');replacement.value='';replacement.textContent='НОВАЯ ОПЕРАЦИЯ';replaceSelect.append(replacement);
    for(const operation of t.surgeries){replacement=document.createElement('option');replacement.value=operation.site;
      replacement.textContent='ЗАМЕНИТЬ: '+TOWER_SURGERY_OPERATIONS[operation.procedure].name+' ('+towerSurgerySiteLabel(operation.site)+')';replaceSelect.append(replacement);}
    if(t.surgeries.length>=slots)replaceSelect.value=t.surgeries[0]?.site??'';
    const procedureSelect=document.createElement('select');
    procedureSelect.setAttribute('aria-label','Вид операции');
    for(const id of TOWER_SURGERY_IDS){
      const option=document.createElement('option');option.value=id;
      option.textContent=TOWER_SURGERY_OPERATIONS[id].name+' · '+TOWER_SURGERY_OPERATIONS[id].description;
      procedureSelect.append(option);
    }
    const stockSelect=document.createElement('select');
    stockSelect.setAttribute('aria-label','Имплант со склада');
    const fresh=document.createElement('option');fresh.value='';fresh.textContent='НОВЫЙ ИМПЛАНТ';
    stockSelect.append(fresh);
    for(const item of stock){
      const option=document.createElement('option');option.value=item.id;
      option.textContent='СО СКЛАДА: '+TOWER_SURGERY_OPERATIONS[item.procedure].name+
        ' · снят с '+towerSurgerySiteLabel(item.fromSite);
      stockSelect.append(option);
    }
    stockSelect.hidden=stock.length===0;
    const siteSelect=document.createElement('select');
    siteSelect.setAttribute('aria-label','Сегмент для операции');
    const donorSelect=document.createElement('select');
    donorSelect.setAttribute('aria-label','Донор для пересадки');
    const purchase=document.createElement('button');purchase.type='button';
    purchase.className='tower-surgery-purchase';
    const refreshSites=()=>{
      const stored=stock.find(item=>item.id===stockSelect.value);
      if(stored)procedureSelect.value=stored.procedure;
      procedureSelect.disabled=Boolean(stored);
      siteSelect.replaceChildren();
      for(const site of towerSurgeryAvailableSites(t,procedureSelect.value,replaceSelect.value||null)){
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
      const price=replaceSelect.value?towerSurgeryReplacePrice(t):towerSurgeryPrice(t);
      purchase.innerHTML=(stored?'УСТАНОВИТЬ СО СКЛАДА':replaceSelect.value?'ЗАМЕНИТЬ ОПЕРАЦИЮ':'ПРОВЕСТИ ОПЕРАЦИЮ')+' · '+formatChips(price);
      purchase.disabled=Boolean(t.mutationDraft)||!siteSelect.options.length
        ||(!donorSelect.hidden&&!donorSelect.options.length)
        ||ctx.betting.players[ctx.towerPlayer].balance<price;
      purchase.title=t.mutationDraft?'Сначала выбери награду за босса':
        stored?'Повторная установка собственного импланта платная. Сам предмет со склада не покупается.':
        'Операция на выбранном сегменте; отменить покупку нельзя.';
    };
    procedureSelect.onchange=refreshSites;replaceSelect.onchange=refreshSites;
    // Route source selection through the same preview handler as an operation change.
    stockSelect.onchange=()=>procedureSelect.dispatchEvent(new Event('change'));
    purchase.onclick=()=>{
      if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
      const procedure=procedureSelect.value,site=siteSelect.value;
      const replaceSite=replaceSelect.value||null;
      const old=t.surgeries.find(op=>op.site===replaceSite);
      const price=replaceSite?towerSurgeryReplacePrice(t):towerSurgeryPrice(t);
      const stockItem=stock.find(item=>item.id===stockSelect.value);
      const donorId=donorSelect.hidden?null:donorSelect.value;
      confirmGameAction({
        root:ctx.root,
        title:old?'ЗАМЕНА ОПЕРАЦИИ':'ХИРУРГИЧЕСКАЯ ОПЕРАЦИЯ',
        details:[
          (old?'Снимаем «'+TOWER_SURGERY_OPERATIONS[old.procedure].name+'». ':'')+
          'Устанавливаем «'+TOWER_SURGERY_OPERATIONS[procedure].name+'».',
          'Участок: '+towerSurgerySiteLabel(site),
          stockItem?'Имплант из собственного склада.':'',
          donorId?'Будет использован выбранный донор.':'',
          'После подтверждения отменить операцию без новой покупки нельзя.'
        ],
        cost:price,
        confirmLabel:old?'ЗАМЕНИТЬ':'ПРОВЕСТИ',
        onConfirm:()=>{
          if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
          try{
            const charged=buyTowerSurgery(ctx.betting,ctx.towerPlayer,procedure,site,
              donorId,replaceSite,stockItem?.id??null);
            ctx.towerGarage[0].surgeries=structuredClone(t.surgeries);
            lastSurgeryReceipt='Операция «'+TOWER_SURGERY_OPERATIONS[procedure].name+'» выполнена на '+towerSurgerySiteLabel(site)+' · −'+charged+' монет';
            bettingSave();renderSkills();renderSurgery();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));
            renderInsurance();updateTowerHud();upgradeModal?.resetSurgeryPreview();upgradeModal?.refresh();
            upgradeMessage('');
          }catch(error){upgradeMessage(error.message);}
        }
      });
    };
    controls.append(replaceSelect,stockSelect,procedureSelect,siteSelect,donorSelect,purchase);
    surgeryPanel.append(controls);
    refreshSites();
  }
  renderSurgery();
  upgradeModal=installTowerUpgradeWindow({root:ctx.root,run:t,statsPanel:fields,mutationPanel,surgeryPanel,
    artifactPanel:ctx.root.querySelector('#tower-prep-artifacts'),renderWallet:target=>renderTowerPlayerWallet(target)});
  // Put Shelter among the bottom primary controls, between insurance and fight.
  const footer=panel.querySelector('.bet-actions');
  footer.insertBefore(ctx.root.querySelector('#tower-upgrade-open'),fightButton);
  function showCycleNotice(){
    if(!t.cycleNotice||t.mutationDraft)return;
    let dialog=ctx.root.querySelector('#tower-cycle-notice');
    if(dialog?.open)return;
    dialog?.remove();dialog=document.createElement('dialog');dialog.id='tower-cycle-notice';
    dialog.className='tower-cycle-dialog';
    const index=towerCycleInfo(t.level).index;
    const heading=document.createElement('h2');heading.textContent='ЛЕЧЕНИЕ НЕ УВЕНЧАЛОСЬ ВЫПИСКОЙ';
    const summary=document.createElement('p');summary.textContent='30 этажей пройдены. Навыки возвращены к 3/3/3, всё имущество и проведённые операции остаются у пациента. ДМС аннулирована, следующий полис снова стоит 50 монет.';
    const next=document.createElement('p');next.textContent='НОВОЕ НАЗНАЧЕНИЕ: '+towerCycleTitle(index)+' · '+towerFloorLabel(t.level);
    const proceed=document.createElement('button');proceed.type='button';proceed.textContent='ПРОДОЛЖИТЬ ЛЕЧЕНИЕ';
    proceed.onclick=()=>{delete t.cycleNotice;bettingSave();dialog.close?.();dialog.remove();};
    dialog.append(heading,summary,next,proceed);ctx.root.append(dialog);
    upgradeModal?.close();if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
    proceed.focus();
  }
  if(!t.mutationDraft)showCycleNotice();
  ctx.root.querySelector('#tower-prep-artifacts').innerHTML=`<h3 class="tower-artifact-title">КОЛЛЕКЦИЯ АРТЕФАКТОВ · ${t.artifacts.pieces.length}/${ARTIFACT_PIECE_COUNT}</h3>`+artifactCollectionMarkup(t.artifacts)+`<p class="artifact-bonus-note">ПОЛНЫЙ АРТЕФАКТ: +${formatChips(ARTIFACT_COMPLETION_REWARD)}</p>`;
  ctx.root.querySelector('#tower-prep-error').textContent='';
  const insuranceButton=ctx.root.querySelector('#tower-insurance');
  const insuranceStatus=ctx.root.querySelector('#tower-insurance-status');
  const renderInsurance=()=>{
    const c=t.insurance.checkpoint,renewal=Boolean(c&&t.level>c.level);
    insuranceButton.classList.toggle('is-active',Boolean(c));
    insuranceButton.innerHTML=renewal?`ПРОДЛИТЬ ДМС · ${formatChips(t.insurance.price)}`:c?`ДМС · ЭТАЖ ${c.level}`:`ДМС · ${formatChips(t.insurance.price)}`;
    insuranceButton.disabled=Boolean(c&&!renewal)||ctx.betting.players[ctx.towerPlayer].balance<t.insurance.price;
    insuranceButton.title=renewal?`ПРОДЛЕНИЕ ВРУЧНУЮ: перенести ДМС с этажа ${c.level} на этаж ${t.level} за ${t.insurance.price} монет. Новый полис заменяет прежнюю точку. Следующий тариф +3%.`:c?`Полис уже оплачен. Вернёт на этаж ${c.level}; автоматически не продлевается.`:'Одноразовая страховка. После покупки следующий тариф +10%; продление действующего полиса +3%.';
    // The paid checkpoint is already displayed on the DMS button itself.
    insuranceStatus.hidden=true;
    insuranceStatus.textContent='';
  };
  renderInsurance();
  insuranceButton.onclick=()=>{
    if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen||insuranceButton.disabled)return;
    const checkpoint=t.insurance.checkpoint,renewal=Boolean(checkpoint);
    const price=t.insurance.price;
    confirmGameAction({
      root:ctx.root,
      title:renewal?'ПРОДЛЕНИЕ ДМС':'ОФОРМЛЕНИЕ ДМС',
      details:[
        renewal?'Перенос страховки с этажа '+towerFloorLabel(checkpoint.level)+' на этаж '+towerFloorLabel(t.level)+'.':
          'Страховка текущего этажа '+towerFloorLabel(t.level)+' и навыков пациента.',
        renewal?'Прежняя точка возврата будет заменена. Следующий тариф +3%.':
          'После использования полис прекращает действие. Следующий тариф +10%.'
      ],
      cost:price,
      confirmLabel:renewal?'ПРОДЛИТЬ ДМС':'ОФОРМИТЬ ДМС',
      onConfirm:()=>{
        if(ctx.startup.phase!=='tower-ready'||ctx.settingsOpen)return;
        try{
          buyTowerInsurance(ctx.betting,ctx.towerPlayer);bettingSave();renderInsurance();renderTowerPlayerWallet(ctx.root.querySelector('#tower-prep-name'));updateTowerHud();
          ctx.root.querySelector('#tower-prep-error').textContent=renewal?`ДМС продлена: этаж ${t.level} и текущие навыки застрахованы.`:'ДМС оформлена: этаж и навыки застрахованы.';
        }catch(error){ctx.root.querySelector('#tower-prep-error').textContent=error.message;}
      }
    });
  };
  fightButton.onclick=async()=>{
    if(fightButton.disabled||t.mutationDraft){ctx.root.querySelector('#tower-prep-error').textContent='Сначала выбери модификацию после победы над боссом.';return;}
    if(ctx.startup.phase!=='tower-ready')return;
    // An unpaid preview never changes the saved fighter.
    draftStats=[...t.stats];
    const wasPreparing=t.preparing;
    t.preparing=false;t.arenaRerollLocked=true;
    if(ctx.deferTowerArena){
      fightButton.disabled=true;bettingSave();upgradeModal?.close();
      // Hide the sheet immediately, before moving its artifacts back from
      // the Shelter and before the asynchronous world initialization.
      panel.hidden=true;
      try{await ctx.enterTowerArena();}
      catch(error){
        console.error('Tower arena loading:',error);
        t.preparing=wasPreparing;t.arenaRerollLocked=false;
        ctx.deferTowerArena=true;ctx.startup.phase='tower-ready';
        ctx.root.dataset.gameMode='tower-preparing';panel.hidden=false;
        fightButton.disabled=false;
        ctx.root.querySelector('#tower-prep-error').textContent='Не удалось открыть арену. Повтори попытку.';
        bettingSave();
      }
      return;
    }
    // Preparing the floor edits the canonical saved run, while initializeGame
    // originally created a detached snapshot and its robot BEFORE purchases.
    // Refresh both sources before the first frame of this very floor.
    ctx.towerRun=structuredClone(t);
    Object.assign(ctx.towerGarage[0],{
      segmentInventory:structuredClone(t.segmentInventory),equippedSegments:[...t.equippedSegments],
      stats:[...t.stats],mutations:[...t.mutations],
      mutationInventory:structuredClone(t.mutationInventory),equippedMutations:[...t.equippedMutations],
      surgeries:structuredClone(t.surgeries),
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
  ctx.root.querySelector('#tower-wallet').innerHTML=`${hasBoss(ctx.towerRun)?'':`ЭТАЖ ${towerFloorLabel(floor)} · ПРОТИВНИКОВ ${remaining}/${count} · `}БАНК ${playerBalanceMarkup(ctx.towerPlayer,ctx.betting.players[ctx.towerPlayer].balance)}`;
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
  ctx.resultsTitle.textContent=won?`ЭТАЖ ${towerFloorLabel(o.floor)} ПРОЙДЕН`:`ПРОЙДЕНО ЭТАЖЕЙ: ${o.cleared}`;
  ctx.resultsSummary.textContent=won?(t.segmentRewardsEnabled&&t.lastBossSegments?.length?'БОСС ПОБЕЖДЁН · НОВЫЕ ЧАСТИ ДОБАВЛЕНЫ НА СКЛАД.':t.mutationDraft?'БОСС ПОБЕЖДЁН · ВЫБЕРИ НАГРАДУ.':''):`${o.reason??'Поражение'} на этаже ${o.floor}. ${o.insuranceFloor?`ДМС сработала: возврат на этаж ${o.insuranceFloor} с застрахованными навыками. Страховка использована.`:'Заработанные монеты сохранены.'}`;
  const coins=o.floorCoins??0;
  const resultWallet=ctx.root.querySelector('#tower-results-player');
  renderTowerPlayerWallet(resultWallet);resultWallet.hidden=false;
  ctx.root.querySelector('#bet-result-summary').innerHTML=`<div class="tower-run-summary${o.newRecord?' is-record':''}">
    ${o.newRecord?'<strong class="tower-record-banner">НОВЫЙ ЛИЧНЫЙ РЕКОРД!</strong>':''}
    ${won&&o.cleared%5===0?`<strong class="tower-milestone">РУБЕЖ: ${o.cleared} ЭТАЖЕЙ</strong>`:''}
    <div class="tower-result-numbers${won?' has-skill-reward':''}"><div><strong>${o.cleared}</strong><span>ЭТАЖЕЙ ПРОЙДЕНО</span></div><div><strong>${o.record}</strong><span>ЛИЧНЫЙ РЕКОРД</span></div><div><strong>${formatChips(coins)}</strong><span>МОНЕТ ЗА ЭТАЖ</span></div>${won?'<div class="tower-skill-reward"><strong>+1</strong><span>ПОЛУЧЕНО ОЧКО НАВЫКОВ</span></div>':''}</div>
    ${won&&o.artifact!=null?artifactCollectionMarkup(t.artifacts,o.artifact,o.artifactBonus):''}
    ${o.runKills==null?'':`<p>ЛИЧНЫХ ПОБЕД: ${o.runKills}</p>`}
  </div>`;
  if(won&&t.segmentRewardsEnabled&&t.lastBossSegments?.length&&isBossFloor(o.floor)){
    const rewards=document.createElement('div');rewards.className='tower-segment-rewards';
    const title=document.createElement('strong');title.textContent='ПОЛУЧЕНЫ ЧАСТИ МОДИФИКАЦИЙ';rewards.append(title);
    const items=document.createElement('div');items.className='tower-inventory-grid';
    for(const id of t.lastBossSegments){
      const item=t.segmentInventory.find(candidate=>candidate.id===id);
      if(!item)continue;
      const card=document.createElement('button');card.type='button';
      card.className='tower-inventory-item tower-segment-reward';
      // Shared hint system supports hover, keyboard focus and touch tap.
      const mutation=TOWER_MUTATIONS[item.type];
      const hint=[mutation.name,towerSurgerySiteLabel(item.site)+' · '+TOWER_RARITIES[item.rarity].name,
        mutation.description,towerMutationEffectText(item.type)].filter(Boolean).join('\n');
      card.dataset.hint=hint;
      card.setAttribute('data-hint-tap','');
      card.setAttribute('aria-label',mutation.name+'. '+towerSurgerySiteLabel(item.site)+'. '+towerMutationEffectText(item.type));
      const part=towerPatientAnatomy(t)?.skinParts?.[item.site]??ROBOT_PARTS[item.site];
      const icon=document.createElement('span');
      icon.className='tower-mod-icon';
      if(part){
        icon.style.backgroundImage='url("'+TOWER_MUTATION_ATLAS[item.type]+'")';
        icon.style.backgroundSize='400% 400%';
        icon.style.backgroundPosition=(part.col/3*100)+'% '+(part.row/3*100)+'%';
      }
      const label=document.createElement('strong');label.textContent=TOWER_MUTATIONS[item.type].name;
      const site=document.createElement('small');
      site.textContent=towerSurgerySiteLabel(item.site)+' · '+TOWER_RARITIES[item.rarity].name;
      card.append(icon,label,site);items.append(card);
    }
    rewards.append(items);ctx.root.querySelector('#bet-result-summary').append(rewards);
  }
  ctx.resultsAgain.textContent=won?'ДАЛЕЕ':o.insuranceFloor?`ДМС · НА ЭТАЖ ${t.level}`:'НОВАЯ ПОПЫТКА · ЭТАЖ 1';
  ctx.resultsAgain.onclick=()=>ctx.startTower(ctx.towerPlayer);
  ctx.resultsProcedure.hidden=true;ctx.resultsProcedure.onclick=null;
  ctx.root.querySelector('#tower-controls').hidden=true;ctx.resultsPanel.hidden=false;ctx.resultsAgain.focus();
}
export function installTowerUI({enterFight=false}={}){
  refreshMenu();
  rotateMenuDescription();
  ctx.resetButton.hidden=false;
  ctx.root.querySelector('#tower-wallet').hidden=ctx.mode!=='tower';
  const menu=ctx.root.querySelector('#launch-overlay');
  ctx.root.querySelector('#menu-player').onchange=e=>{ctx.betting.towerPlayerId=Number(e.target.value);bettingSave();refreshMenu();};
  ctx.root.querySelector('#tower-reset').onclick=()=>{if(confirm('Сбросить башню выбранного игрока? Действующая ДМС будет аннулирована без возврата монет. Банк, личный рекорд и артефакты сохранятся. Тариф следующей ДМС не изменится.')){resetTower(ctx.betting,ctx.menuPlayer);bettingSave();refreshMenu();}};
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
  installTowerInput();
  if(enterFight){
    // The pre-arena preparation intentionally hides touch controls. After the
    // deferred world build, reveal the container before spawning fighters.
    // installTowerInput already hides the stick for the 'direction' mode.
    ctx.root.querySelector('#tower-preparation').hidden=true;
    ctx.root.querySelector('#tower-controls').hidden=false;
  }else towerPreparation();
}

