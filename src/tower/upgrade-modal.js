// Dedicated Tower modernization dialog. Reuses the existing mutation and
// surgical control panels so purchases and save validation stay authoritative.
import {towerMutationSnapshot,towerAttackInterval,towerMutationSynergies,towerInstalledItems,TOWER_MUTATIONS,TOWER_MUTATION_LIMIT} from './mutations.js';
import {towerInstalledSegments,towerUnreadSegments} from './segments.js';
import {towerSurgeryAvailableSites,towerSurgerySiteLabel,towerSurgeryCapacity,TOWER_SURGERY_MIN_LEVEL,
 towerSurgeryPrice,towerSurgeryReplacePrice,TOWER_SURGERY_OPERATIONS} from './surgery.js';
import {renderTowerUpgradePatient} from './upgrade-preview.js';
import {towerPatientAnatomy} from './anatomy.js';
import {ctx} from '../game/state.js';
import {formatSkillPoints} from '../ui/patient.js';
import {uiIcon} from '../ui/icons.js';

const create=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text)node.textContent=text;
 return node;
};
const format=n=>(Math.round(n*100)/100).toLocaleString('ru-RU',{maximumFractionDigits:2});
const statNames=['СКОРОСТЬ','СИЛА','МАНЁВРЕННОСТЬ'];

export function installTowerUpgradeWindow({root,run,archiveOwner,statsPanel,mutationPanel,surgeryPanel,artifactPanel,renderWallet=()=>{}}){
 const previous=root.querySelector('#tower-upgrade-window');
 if(previous?.open&&typeof previous.close==='function')previous.close();
 previous?.remove();
 root.querySelector('#tower-upgrade-open')?.remove();
 const launch=create('button','tower-upgrade-open');
 launch.id='tower-upgrade-open';
 launch.type='button';
 statsPanel.after(launch);
 // A native modal is promoted into the browser top layer. A z-index-only
 // DIV can appear visible while a transparent top-layer sheet steals taps.
 const overlay=create('dialog','tower-upgrade-overlay');
 overlay.id='tower-upgrade-window';
 overlay.hidden=true;
 overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');
 overlay.setAttribute('aria-labelledby','tower-upgrade-title');
 const backButton=create('button','tower-upgrade-back game-nav-back-control','← НАЗАД');
 backButton.type='button';
 backButton.setAttribute('aria-label','Назад к подготовке');
 // Native modal dialogs occupy the top layer, above global navigation.
 // Mirror the global back control inside the modal instead of letting it dim.
 overlay.append(backButton);
 const paper=create('div','tower-upgrade-paper');
 overlay.append(paper);
 const top=create('div','tower-upgrade-heading');
 const heading=create('h2','', 'УБЕЖИЩЕ');heading.id='tower-upgrade-title';
 const closeButton=create('button','tower-upgrade-close','×');closeButton.type='button';
 closeButton.setAttribute('aria-label','Закрыть убежище');
 const settingsButton=create('button','tower-upgrade-settings');settingsButton.type='button';settingsButton.innerHTML=uiIcon('settings');
 settingsButton.setAttribute('aria-label','Открыть настройки из убежища');
 const headerActions=create('div','tower-upgrade-heading-actions');
 headerActions.append(settingsButton,closeButton);
 top.append(heading,headerActions);paper.append(top);
 const wallet=create('div','tower-upgrade-wallet');paper.append(wallet);
 const patientPanel=create('div','tower-upgrade-patient-panel');
 const table=create('div','tower-upgrade-table');
 const drawing=create('div','tower-upgrade-drawing');
 drawing.id='tower-upgrade-patient';
 const siteLabel=create('p','tower-upgrade-site');siteLabel.hidden=true;
 table.append(drawing,siteLabel);
 const stats=create('section','tower-upgrade-stats');stats.id='tower-upgrade-stats';
 stats.setAttribute('aria-live','polite');
 patientPanel.append(table,stats);paper.append(patientPanel);
 const inventory=create('div','tower-upgrade-inventory');
 const nav=create('div','tower-upgrade-tabs');nav.setAttribute('role','tablist');
 const mutationTab=create('button','tower-upgrade-tab','МОДИФИКАЦИИ');
 const surgeryTab=create('button','tower-upgrade-tab','ХИРУРГИЯ');
 const artifactTab=create('button','tower-upgrade-tab','АРТЕФАКТЫ');
 const tabs=[[mutationTab,'mutations'],[surgeryTab,'surgery'],[artifactTab,'artifacts']];
 for(const [tab,id] of tabs){
  tab.type='button';tab.dataset.upgradeTab=id;tab.setAttribute('role','tab');
  nav.append(tab);
 }
 const content=create('div','tower-upgrade-content');
 const modsContainer=create('div','tower-upgrade-page');modsContainer.id='tower-upgrade-mutation-page';
 const surgeryContainer=create('div','tower-upgrade-page');surgeryContainer.id='tower-upgrade-surgery-page';
 const artifactsContainer=create('div','tower-upgrade-page');artifactsContainer.id='tower-upgrade-artifacts-page';
 for(const container of [modsContainer,surgeryContainer,artifactsContainer])container.setAttribute('role','tabpanel');
 modsContainer.append(mutationPanel);surgeryContainer.append(surgeryPanel);
 // The Shelter moves its artifact collection into the dialog. When switching
 // modes an old dialog may have been removed with that DOM node; recreate
 // the view from persistent run.artifacts rather than leaving the modal broken.
 const collection=artifactPanel??create('div','');
 collection.id='tower-prep-artifacts';collection.hidden=false;
 artifactsContainer.append(collection);
 content.append(modsContainer,surgeryContainer,artifactsContainer);
 inventory.append(nav,content);paper.append(inventory);
 const feedback=create('p','tower-upgrade-feedback');feedback.id='tower-upgrade-feedback';
 feedback.setAttribute('role','status');paper.append(feedback);
 root.append(overlay);

 let activeTab='mutations',hoverMutation=null,site=null,surgeryPreviewEnabled=false;
 const control=()=>({
  proc:surgeryPanel.querySelector('[aria-label="Вид операции"]'),
  selected:surgeryPanel.querySelector('[aria-label="Сегмент для операции"]'),
  donor:surgeryPanel.querySelector('[aria-label="Донор для пересадки"]')
 });
 function paint(){
  const {proc,selected,donor}=control();
  const surgeryReplace=surgeryPanel.querySelector('[aria-label="Заменяемая операция"]')?.value||null;
  const surgeryOptions=proc?.value?towerSurgeryAvailableSites(run,proc.value,surgeryReplace):[];
  if(selected?.value&&surgeryOptions.includes(selected.value))site=selected.value;
  else if(!surgeryOptions.includes(site))site=surgeryOptions[0]??null;
  if(selected&&site&&surgeryOptions.includes(site))selected.value=site;
  const editingSurgery=activeTab==='surgery';
  const operation=TOWER_SURGERY_OPERATIONS[proc?.value];
  const donorItem=operation?.donor?(run.donorTissues??[]).find(item=>
    item.id===donor?.value&&item.kind===operation.site):null;
  // An empty/stale donor selector is a valid intermediate UI state, not a
  // hypothetical graft. Only preview a transplant backed by real tissue.
  const proposedSurgery=editingSurgery&&surgeryPreviewEnabled&&operation&&site&&surgeryOptions.includes(site)&&
    (!operation.donor||donorItem)&&
    (run.surgeries.length<towerSurgeryCapacity(run.level)||surgeryReplace)&&!run.mutationDraft?
    {procedure:proc.value,site,...(donorItem?{donorId:donorItem.id,donorProfile:donorItem.profile}:{})}:null;
  // Both unclaimed rewards and already owned modules preview their *actual*
  // equipped stats.  The inventory item is not an active bonus until paid.
  const selectedCard=mutationPanel.querySelector('.tower-inventory-item.is-selected, .tower-mutation-option.is-selected');
  const candidate=activeTab==='mutations'&&(hoverMutation??(selectedCard?{
    type:selectedCard.dataset.mutationType,
    id:selectedCard.dataset.mutationId??null,
    rarity:Number(selectedCard.dataset.mutationRarity??0)
  }:null));
  const segmentCandidate=run.segmentRewardsEnabled&&candidate?.id?
    run.segmentInventory.find(item=>item.id===candidate.id):null;
  const segmentEquipped=run.equippedSegments?.includes(segmentCandidate?.id);
  const equipped=run.segmentRewardsEnabled?segmentEquipped:run.equippedMutations?.includes(candidate?.id);
  const installed=towerInstalledItems(run);
  const conflict=installed.find(item=>item.type===candidate?.type);
  const canPreview=Boolean(candidate&&!equipped&&(run.segmentRewardsEnabled||installed.length<TOWER_MUTATION_LIMIT||conflict));
  const proposedMutation=canPreview&&!run.segmentRewardsEnabled?candidate.type:null;
  const nextMutations=proposedMutation?[...run.mutations.filter(type=>type!==candidate.type),candidate.type]:run.mutations;
  const initial=towerMutationSnapshot(run);
  const before=initial.effective;
  const proposedSegments=segmentCandidate&&!segmentEquipped?
    [...(run.equippedSegments??[]).filter(id=>run.segmentInventory.find(item=>item.id===id)?.site!==segmentCandidate.site),segmentCandidate.id]:run.equippedSegments;
  const draft=proposedSurgery?{...run,surgeries:[...run.surgeries.filter(op=>op.site!==surgeryReplace),proposedSurgery]}:
   run.segmentRewardsEnabled?{...run,equippedSegments:proposedSegments}:
   proposedMutation?{...run,mutations:nextMutations,
    mutationInventory:[...run.mutationInventory,{id:'preview',type:candidate.type,rarity:candidate.rarity}],
    equippedMutations:[...run.equippedMutations.filter(id=>id!==conflict?.id),'preview']}:run;
  const preview=towerMutationSnapshot(draft);
  const after=preview.effective;
  stats.replaceChildren();
  const title=create('div','tower-upgrade-stats-head');
  title.append(create('strong','','ПАРАМЕТРЫ'));
  stats.append(title);
  const values=create('div','tower-upgrade-stat-values');
  for(let i=0;i<3;i++){
   const cell=create('div','tower-upgrade-stat');
   cell.append(create('span','',statNames[i]));
   const value=create('b','');
   value.append(create('span','tower-stat-before',formatSkillPoints(before[i])));
   const next=create('span','tower-stat-after',formatSkillPoints(after[i]));
   const delta=after[i]-before[i],changed=Math.abs(delta)>.0001;
   next.hidden=!changed;
   if(changed){
    value.append(document.createTextNode(' → '));
    next.classList.add(delta>0?'is-positive':'is-negative');
    next.textContent+=delta>0?' ▲':' ▼';
   }
   value.append(next);cell.append(value);values.append(cell);
  }
  stats.append(values);
  const detail=editingSurgery?
    proposedSurgery?'ПРЕДПРОСМОТР: '+TOWER_SURGERY_OPERATIONS[proposedSurgery.procedure].name:
      operation?.donor&&!donorItem?'Для пересадки нужен доступный донор выбранного типа':
      'Установлено: '+run.surgeries.length+' / '+towerSurgeryCapacity(run.level)+' · цена '+(surgeryReplace?towerSurgeryReplacePrice(run):towerSurgeryPrice(run))+' монет':
    run.segmentRewardsEnabled?(segmentCandidate?(segmentEquipped?'УСТАНОВЛЕНО: ':'ПРЕДПРОСМОТР: ')+TOWER_MUTATIONS[segmentCandidate.type].name+' · '+towerSurgerySiteLabel(segmentCandidate.site):'Установлено '+towerInstalledSegments(run).length+' сегментов'):
    proposedMutation?'ПРЕДПРОСМОТР: '+TOWER_MUTATIONS[proposedMutation].name:
      candidate&&!equipped&&installed.length>=TOWER_MUTATION_LIMIT&&!conflict?
       'Шесть мест заняты: сначала выбери модуль для замены':
       'Установлено '+run.mutations.length+' модулей · активных синергий '+towerMutationSynergies(run.mutations).length;
  stats.append(create('small','tower-upgrade-stats-note',detail));
  const combatLine=create('small','tower-upgrade-stats-note tower-combat-preview');
  const combatValue=(label,before,after,higherIsBetter,unit='%')=>{
   combatLine.append(document.createTextNode(label+format(before)+unit));
   if(Math.abs(after-before)>.0001){
    combatLine.append(document.createTextNode(' → '));
    const changed=create('strong',(after>before)===higherIsBetter?'is-positive':'is-negative',format(after)+unit);
    changed.textContent+=((after>before)===higherIsBetter?' ▲':' ▼');
    combatLine.append(changed);
   }
  };
  combatValue('СКОРОСТЬ: ',initial.effects[0]*100,preview.effects[0]*100,true);
  combatLine.append(document.createTextNode(' · '));
  combatValue('КРИТ: ',initial.effects[1]*100,preview.effects[1]*100,true);
  combatLine.append(document.createTextNode(' · '));
  combatValue('РАЗВОРОТ: ',initial.effects[2]*100,preview.effects[2]*100,true);
  combatLine.append(document.createTextNode(' · '));
  combatValue('ИНТЕРВАЛ АТАК: ',towerAttackInterval(initial.combat)*1000,towerAttackInterval(preview.combat)*1000,false,' мс');
  stats.append(combatLine);
  const anatomySummary=run=>{
   const body=towerPatientAnatomy(run);
   return {segments:body?.segments.length??13,
    arms:body?.limbs.filter(l=>l.kind==='arm').length??2,
    legs:body?.limbs.filter(l=>l.kind==='leg').length??2,
    extended:body?.limbs.filter(l=>(l.lengthScale??1)>1).length??0};
  };
  const baseAnatomy=anatomySummary(run),newAnatomy=anatomySummary(draft);
  const summary=key=>baseAnatomy[key]===newAnatomy[key]?String(baseAnatomy[key]):baseAnatomy[key]+' → '+newAnatomy[key];
  stats.append(create('small','tower-upgrade-stats-note',
   'АНАТОМИЯ · частей '+summary('segments')+' · рук '+summary('arms')+
   ' · ног '+summary('legs')+' · удлинённых '+summary('extended')));
  drawing.replaceChildren();
  renderTowerUpgradePatient(drawing,run.segmentRewardsEnabled&&!editingSurgery?draft:run,{
   selectedSite:editingSurgery?site:null,
   availableSites:editingSurgery?surgeryOptions:null,
   previewSurgery:proposedSurgery,previewReplaceSite:surgeryReplace,previewMutation:proposedMutation,previewRarity:candidate?.rarity??0,
   onSelect:editingSurgery?chosen=>{
    if(!surgeryOptions.includes(chosen))return;
    site=chosen;surgeryPreviewEnabled=true;if(selected)selected.value=chosen;
    paint();
   }:null
  });
  siteLabel.hidden=!editingSurgery||!site;
  siteLabel.textContent=editingSurgery&&site?'ВЫБРАНО: '+towerSurgerySiteLabel(site):'';
 }
 function setTab(next){
  const surgeryUnlocked=run.level>=TOWER_SURGERY_MIN_LEVEL;
  const previous=activeTab;
  activeTab=next==='artifacts'?'artifacts':next==='surgery'&&surgeryUnlocked?'surgery':'mutations';
  hoverMutation=null;surgeryPreviewEnabled=false;
  for(const [button,id] of tabs){
   button.setAttribute('aria-selected',String(activeTab===id));
   button.classList.toggle('is-active',activeTab===id);
  }
  modsContainer.hidden=activeTab!=='mutations';
  surgeryContainer.hidden=activeTab!=='surgery';
  artifactsContainer.hidden=activeTab!=='artifacts';
  // Artifacts use the same right-hand tab panel as the other two views.
  // Keep the patient and current parameters visible in the left column.
  paint();
  if(activeTab!==previous)content.scrollTop=0;
 }
 function refreshNewItems(){
  const hasNotes=Boolean(archiveOwner?.unreadArchiveNoteIds?.length);
  const hasSegments=run.segmentRewardsEnabled&&towerUnreadSegments(run).size>0;
  for(const [button,visible,label] of [[launch,hasNotes||hasSegments,'Новые предметы'],[artifactTab,hasNotes,'Новые записки']]){
   button.querySelector('.tower-new-dot')?.remove();
   button.classList.toggle('has-new-items',Boolean(visible));
   if(!visible)continue;
   const dot=create('span','tower-new-dot');dot.setAttribute('aria-label',label);
   button.append(dot);
  }
 }
 overlay.addEventListener('archive-note-read',refreshNewItems);
 function refresh(){
  renderWallet(wallet);
  surgeryTab.disabled=run.level<TOWER_SURGERY_MIN_LEVEL;
  surgeryTab.textContent=surgeryTab.disabled?'ХИРУРГИЯ 🔒':'ХИРУРГИЯ';
  surgeryTab.title=surgeryTab.disabled?'Откроется после победы над вторым боссом на 10-м этаже':'Операции и пересадки';
  if(hoverMutation&&(![...mutationPanel.querySelectorAll('[data-mutation-type]')].some(button=>button.dataset.mutationType===hoverMutation.type)||(!run.mutationDraft&&!hoverMutation.id)))hoverMutation=null;
  launch.textContent=run.mutationDraft?'УБЕЖИЩЕ · ВЫБРАТЬ НАГРАДУ':'УБЕЖИЩЕ · ИНВЕНТАРЬ';
  launch.classList.toggle('has-reward',Boolean(run.mutationDraft));
  refreshNewItems();
  for(const [index,button] of [...mutationPanel.querySelectorAll('.tower-mutation-option')].entries()){
   const id=run.mutationDraft?.options[index];
   const value=id?{type:id,rarity:run.mutationDraft?.rarity??0}:null;
   button.onmouseenter=()=>{hoverMutation=value;if(activeTab==='mutations')paint();};
   button.onfocus=()=>{hoverMutation=value;if(activeTab==='mutations')paint();};
   button.onmouseleave=()=>{hoverMutation=null;if(activeTab==='mutations')paint();};
  }
  for(const button of mutationPanel.querySelectorAll('.tower-inventory-item')){
   const item=run.mutationInventory?.find(item=>item.id===button.dataset.mutationId);
   const value=item?{type:item.type,id:item.id,rarity:item.rarity}:null;
   button.onmouseenter=()=>{hoverMutation=value;if(activeTab==='mutations')paint();};
   button.onfocus=()=>{hoverMutation=value;if(activeTab==='mutations')paint();};
   button.onmouseleave=()=>{hoverMutation=null;if(activeTab==='mutations')paint();};
  }
  const {proc,selected}=control();
  if(proc&&!proc.dataset.upgradeBound){
   proc.dataset.upgradeBound='true';
   proc.addEventListener('change',()=>{site=selected?.value??null;surgeryPreviewEnabled=true;if(activeTab==='surgery')paint();});
  }
  if(selected&&!selected.dataset.upgradeBound){
   selected.dataset.upgradeBound='true';
   selected.addEventListener('change',()=>{site=selected.value;surgeryPreviewEnabled=true;if(activeTab==='surgery')paint();});
  }
  const replace=surgeryPanel.querySelector('[aria-label="Заменяемая операция"]');
  if(replace&&!replace.dataset.upgradeBound){
   replace.dataset.upgradeBound='true';
   replace.addEventListener('change',()=>{surgeryPreviewEnabled=true;if(activeTab==='surgery')paint();});
  }
  const {donor}=control();
  if(donor&&!donor.dataset.upgradeBound){
   donor.dataset.upgradeBound='true';
   donor.addEventListener('change',()=>{surgeryPreviewEnabled=true;if(activeTab==='surgery')paint();});
  }
  if(!overlay.hidden&&activeTab!=='artifacts')paint();
 }
 function open(tab=run.mutationDraft?'mutations':activeTab){
  if(root.querySelector('#tower-preparation')?.hidden)return;
  if(overlay.open)return;
  refresh();
  overlay.hidden=false;
  if(typeof overlay.showModal==='function')overlay.showModal();
  else overlay.setAttribute('open','');
  setTab(tab);
  paper.scrollTop=0;
  content.scrollTop=0;
  // Do not preview the first reward merely because keyboard focus is moved
  // into a newly opened dialog. Preview starts on an intentional item focus
  // or pointer hover, and installed items otherwise show one value only.
  (activeTab==='artifacts'?artifactTab:activeTab==='surgery'?surgeryTab:mutationTab).focus({preventScroll:true});
  // Some browsers first focus an item when showModal() enters the top layer.
  // Discard that incidental hover/focus preview until the player interacts.
  hoverMutation=null;
  paint();
 }
 function close(){
  if(overlay.hidden&&!overlay.open)return;
  // Closing a native dialog must also remove it from the browser top layer.
  if(overlay.open&&typeof overlay.close==='function')overlay.close();
  else overlay.removeAttribute('open');
  overlay.hidden=true;hoverMutation=null;
  if(launch.isConnected&&!root.querySelector('#tower-preparation')?.hidden)
    launch.focus({preventScroll:true});
 }
 launch.onclick=()=>open();
 settingsButton.onclick=()=>{
  // A native dialog occupies the top layer: release it before opening
  // Settings using the real, fixed upper-right global navigation button.
  const trigger=root.querySelector('#game-nav-settings');
  if(!trigger||ctx.settingsOpen||root.querySelector('#game-action-confirm[open],#tower-module-replacement[open]'))return;
  const rememberedTab=activeTab;
  close();
  trigger.click();
  if(ctx.settingsOpen)ctx.afterSettingsClose=()=>{
   if(!root.querySelector('#tower-preparation')?.hidden)open(rememberedTab);
  };
 };
 backButton.onclick=close;
 closeButton.onclick=close;
 mutationTab.onclick=()=>setTab('mutations');
 surgeryTab.onclick=()=>setTab('surgery');
 artifactTab.onclick=()=>setTab('artifacts');
 overlay.addEventListener('click',event=>{if(event.target===overlay)close();});
 overlay.addEventListener('cancel',event=>{event.preventDefault();close();});
 overlay.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();return;}
  if(event.key!=='Tab')return;
  const items=[...overlay.querySelectorAll('button:not([disabled]),select:not([disabled]),[tabindex="0"]')]
   .filter(item=>!item.closest('[hidden]')&&item.getAttribute('aria-disabled')!=='true');
  if(!items.length)return;
  const first=items[0],last=items[items.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 refresh();
 if(run.mutationDraft)open('mutations');
 return {open,close,refresh,setTab,resetSurgeryPreview(){surgeryPreviewEnabled=false;site=null;},element:overlay};
}
