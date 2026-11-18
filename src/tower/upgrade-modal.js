// Dedicated Tower modernization dialog. Reuses the existing mutation and
// surgical control panels so purchases and save validation stay authoritative.
import {towerMutationSnapshot,towerMutationSynergies,TOWER_MUTATIONS} from './mutations.js';
import {towerSurgeryAvailableSites,towerSurgerySiteLabel,towerSurgeryCapacity,
 towerSurgeryPrice,TOWER_SURGERY_OPERATIONS} from './surgery.js';
import {renderTowerUpgradePatient} from './upgrade-preview.js';
import {towerPatientAnatomy} from './anatomy.js';

const create=(tag,className,text)=>{
 const node=document.createElement(tag);
 if(className)node.className=className;
 if(text)node.textContent=text;
 return node;
};
const format=n=>(Math.round(n*100)/100).toLocaleString('ru-RU',{maximumFractionDigits:2});
const statNames=['СКОРОСТЬ','СИЛА','МАНЁВРЕННОСТЬ'];

export function installTowerUpgradeWindow({root,run,statsPanel,mutationPanel,surgeryPanel}){
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
 const paper=create('div','tower-upgrade-paper');
 overlay.append(paper);
 const top=create('div','tower-upgrade-heading');
 const heading=create('h2','', 'МОДЕРНИЗАЦИЯ ПАЦИЕНТА');heading.id='tower-upgrade-title';
 const closeButton=create('button','tower-upgrade-close','×');closeButton.type='button';
 closeButton.setAttribute('aria-label','Закрыть модернизацию');
 top.append(heading,closeButton);paper.append(top);
 const table=create('div','tower-upgrade-table');
 const drawing=create('div','tower-upgrade-drawing');
 drawing.id='tower-upgrade-patient';
 const siteLabel=create('p','tower-upgrade-site','ПАЦИЕНТ · ВИД СВЕРХУ · ГОЛОВА СПРАВА');
 const description=create('p','tower-upgrade-help','Нажми на нужный сегмент пациента или выбери его в списке');
 table.append(drawing,siteLabel,description);paper.append(table);
 const stats=create('section','tower-upgrade-stats');stats.id='tower-upgrade-stats';
 stats.setAttribute('aria-live','polite');paper.append(stats);
 const nav=create('div','tower-upgrade-tabs');nav.setAttribute('role','tablist');
 const mutationTab=create('button','tower-upgrade-tab','МОДИФИКАЦИИ');
 const surgeryTab=create('button','tower-upgrade-tab','ХИРУРГИЯ');
 for(const [tab,id] of [[mutationTab,'mutations'],[surgeryTab,'surgery']]){
  tab.type='button';tab.dataset.upgradeTab=id;tab.setAttribute('role','tab');
  nav.append(tab);
 }
 paper.append(nav);
 const content=create('div','tower-upgrade-content');
 const modsContainer=create('div','tower-upgrade-page');modsContainer.id='tower-upgrade-mutation-page';
 const surgeryContainer=create('div','tower-upgrade-page');surgeryContainer.id='tower-upgrade-surgery-page';
 modsContainer.setAttribute('role','tabpanel');surgeryContainer.setAttribute('role','tabpanel');
 modsContainer.append(mutationPanel);surgeryContainer.append(surgeryPanel);
 content.append(modsContainer,surgeryContainer);paper.append(content);
 const feedback=create('p','tower-upgrade-feedback');feedback.id='tower-upgrade-feedback';
 feedback.setAttribute('role','status');paper.append(feedback);
 root.append(overlay);

 let activeTab='mutations',hoverMutation=null,site=null;
 const control=()=>({
  proc:surgeryPanel.querySelector('[aria-label="Вид операции"]'),
  selected:surgeryPanel.querySelector('[aria-label="Сегмент для операции"]'),
  donor:surgeryPanel.querySelector('[aria-label="Донор для пересадки"]')
 });
 function paint(){
  const {proc,selected,donor}=control();
  const surgeryOptions=proc?.value?towerSurgeryAvailableSites(run,proc.value):[];
  if(selected?.value&&surgeryOptions.includes(selected.value))site=selected.value;
  else if(!surgeryOptions.includes(site))site=surgeryOptions[0]??null;
  if(selected&&site&&surgeryOptions.includes(site))selected.value=site;
  const editingSurgery=activeTab==='surgery';
  const operation=TOWER_SURGERY_OPERATIONS[proc?.value];
  const donorItem=operation?.donor?(run.donorTissues??[]).find(item=>
    item.id===donor?.value&&item.kind===operation.site):null;
  // An empty/stale donor selector is a valid intermediate UI state, not a
  // hypothetical graft. Only preview a transplant backed by real tissue.
  const proposedSurgery=editingSurgery&&operation&&site&&surgeryOptions.includes(site)&&
    (!operation.donor||donorItem)&&
    run.surgeries.length<towerSurgeryCapacity(run.level)&&!run.mutationDraft?
    {procedure:proc.value,site,...(donorItem?{donorId:donorItem.id,donorProfile:donorItem.profile}:{})}:null;
  const proposedMutation=!editingSurgery&&hoverMutation&&
    run.mutationDraft?.options.includes(hoverMutation)?hoverMutation:null;
  const before=towerMutationSnapshot(run).effective;
  const draft=proposedSurgery?{...run,surgeries:[...run.surgeries,proposedSurgery]}:
   proposedMutation?{...run,mutations:[...run.mutations,proposedMutation]}:run;
  const after=towerMutationSnapshot(draft).effective;
  stats.replaceChildren();
  const title=create('div','tower-upgrade-stats-head');
  title.append(create('strong','','СКОРОСТЬ · СИЛА · МАНЁВРЕННОСТЬ'),
   create('small','','СЕЙЧАС / ПОСЛЕ'));
  stats.append(title);
  const values=create('div','tower-upgrade-stat-values');
  for(let i=0;i<3;i++){
   const cell=create('div','tower-upgrade-stat');
   cell.append(create('span','',statNames[i]));
   const value=create('b','',format(before[i])+' → '+format(after[i]));
   if(after[i]>before[i]+.0001)value.classList.add('is-improved');
   cell.append(value);values.append(cell);
  }
  stats.append(values);
  const detail=editingSurgery?
    proposedSurgery?'ПРЕДПРОСМОТР: '+TOWER_SURGERY_OPERATIONS[proposedSurgery.procedure].name:
      operation?.donor&&!donorItem?'Для пересадки нужен доступный донор выбранного типа':
      'Уже установлено: '+run.surgeries.length+' / '+towerSurgeryCapacity(run.level)+' · следующая операция '+towerSurgeryPrice(run)+' монет':
    proposedMutation?'ПРЕДПРОСМОТР: '+TOWER_MUTATIONS[proposedMutation].name:
     'Установлено '+run.mutations.length+' модулей · активных синергий '+towerMutationSynergies(run.mutations).length;
  stats.append(create('small','tower-upgrade-stats-note',detail));
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
  renderTowerUpgradePatient(drawing,run,{
   selectedSite:editingSurgery?site:null,
   availableSites:editingSurgery?surgeryOptions:null,
   previewSurgery:proposedSurgery,previewMutation:proposedMutation,
   onSelect:editingSurgery?chosen=>{
    if(!surgeryOptions.includes(chosen))return;
    site=chosen;if(selected)selected.value=chosen;
    paint();
   }:null
  });
  siteLabel.textContent=editingSurgery&&site?'ВЫБРАНО: '+towerSurgerySiteLabel(site):
   'ПАЦИЕНТ ЛЕЖИТ ГОРИЗОНТАЛЬНО · ГОЛОВА СПРАВА';
  description.textContent=editingSurgery?
   'Выбери часть тела на схеме; её атлас и параметры обновятся до оплаты':
   'Наведи курсор на модуль для предпросмотра его атласа и характеристик';
 }
 function setTab(next){
  activeTab=next==='surgery'?'surgery':'mutations';hoverMutation=null;
  mutationTab.setAttribute('aria-selected',String(activeTab==='mutations'));
  surgeryTab.setAttribute('aria-selected',String(activeTab==='surgery'));
  mutationTab.classList.toggle('is-active',activeTab==='mutations');
  surgeryTab.classList.toggle('is-active',activeTab==='surgery');
  modsContainer.hidden=activeTab!=='mutations';
  surgeryContainer.hidden=activeTab!=='surgery';
  paint();
 }
 function refresh(){
  launch.textContent=run.mutationDraft?'ВЫБРАТЬ МОДИФИКАЦИЮ · МОДЕРНИЗАЦИЯ':
   'МОДЕРНИЗАЦИЯ · МОДУЛИ '+run.mutations.length+
   ' · ОПЕРАЦИИ '+run.surgeries.length+'/'+towerSurgeryCapacity(run.level);
  launch.classList.toggle('has-reward',Boolean(run.mutationDraft));
  for(const [index,button] of [...mutationPanel.querySelectorAll('.tower-mutation-option')].entries()){
   const id=run.mutationDraft?.options[index];
   button.onmouseenter=()=>{hoverMutation=id??null;if(activeTab==='mutations')paint();};
   button.onfocus=()=>{hoverMutation=id??null;if(activeTab==='mutations')paint();};
   button.onmouseleave=()=>{hoverMutation=null;if(activeTab==='mutations')paint();};
  }
  const {proc,selected}=control();
  if(proc&&!proc.dataset.upgradeBound){
   proc.dataset.upgradeBound='true';
   proc.addEventListener('change',()=>{site=selected?.value??null;if(activeTab==='surgery')paint();});
  }
  if(selected&&!selected.dataset.upgradeBound){
   selected.dataset.upgradeBound='true';
   selected.addEventListener('change',()=>{site=selected.value;if(activeTab==='surgery')paint();});
  }
  const {donor}=control();
  if(donor&&!donor.dataset.upgradeBound){
   donor.dataset.upgradeBound='true';
   donor.addEventListener('change',()=>{if(activeTab==='surgery')paint();});
  }
  if(!overlay.hidden)paint();
 }
 function open(tab=run.mutationDraft?'mutations':activeTab){
  if(root.querySelector('#tower-preparation')?.hidden)return;
  if(overlay.open)return;
  refresh();
  overlay.hidden=false;
  if(typeof overlay.showModal==='function')overlay.showModal();
  else overlay.setAttribute('open','');
  setTab(tab);
  (run.mutationDraft?mutationPanel.querySelector('.tower-mutation-option'):null)?.focus();
  if(!run.mutationDraft)(tab==='surgery'?surgeryTab:mutationTab).focus();
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
 closeButton.onclick=close;
 mutationTab.onclick=()=>setTab('mutations');
 surgeryTab.onclick=()=>setTab('surgery');
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
 return {open,close,refresh,setTab,element:overlay};
}
