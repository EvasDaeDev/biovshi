// Lightweight Tower floor choice: no WebGL scene, fighters or atlas rebuilds.
// The selected floor plan is saved before the arena is initialized.
import {arenaDefinition,arenaDiagram} from '../game/arenas.js';
import {towerFloorLabel} from './cycles.js';
import {selectedTowerFloor,selectTowerFloor,TOWER_DANGER_STYLES} from './floors.js';
import {towerEnemyProfile,towerProfileDifference} from './profiles.js';
import {TOWER_RELATION_NAMES} from './relations.js';
import {purchaseTowerArenaReroll,towerRerollCandidates,towerRerollPrice} from './economy.js';
import {formatChips} from '../ui/currency.js';

export function openTowerFloorSelector({root,session,player,run,onSave,onConfirm,onCancel}){
 root.querySelector('#tower-floor-selector')?.remove();
 const overlay=document.createElement('section');overlay.id='tower-floor-selector';
 overlay.className='tower-floor-selector';overlay.setAttribute('role','dialog');
 overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','tower-floor-selector-title');
 const panel=document.createElement('div');panel.className='tower-floor-selector-panel';
 const heading=document.createElement('h2');heading.id='tower-floor-selector-title';
 heading.textContent=`БАШНЯ · ЭТАЖ ${towerFloorLabel(run.level)}`;
 const description=document.createElement('p');
 description.textContent='Выбери сложность и арену до загрузки уровня. После подтверждения бойцы будут подготовлены один раз.';
 const arena=document.createElement('div');arena.className='tower-floor-selector-arena';
 const choices=document.createElement('div');choices.className='tower-challenge-options';
 const message=document.createElement('p');message.className='tower-floor-selector-message';message.setAttribute('role','status');
 const footer=document.createElement('div');footer.className='tower-floor-selector-actions';
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='В МЕНЮ';
 const confirm=document.createElement('button');confirm.type='button';confirm.className='tower-floor-selector-confirm';
 confirm.id='tower-floor-selector-confirm';confirm.textContent='ПОДГОТОВИТЬ АРЕНУ';
 footer.append(cancel,confirm);panel.append(heading,description,arena,choices,message,footer);overlay.append(panel);root.append(overlay);
 const cleanup=()=>overlay.remove();
 const render=()=>{
  const selected=selectedTowerFloor(run),definition=arenaDefinition(selected.arenaId);
  const count=run.floorPlan.options.length;
  arena.innerHTML=`${arenaDiagram(definition)}<div><strong>${definition.name}</strong><span>ПРОТИВНИКОВ: ${selected.profiles.length}</span><span>БАНК: ${formatChips(session.players[player].balance)}</span></div>`;
  choices.replaceChildren();
  run.floorPlan.options.forEach((option,index)=>{
   const button=document.createElement('button');button.type='button';
   button.className='tower-challenge-option '+(option.kind==='danger'?'is-danger':'is-standard')+(index===run.floorPlan.selected?' is-selected':'');
   button.setAttribute('aria-pressed',String(index===run.floorPlan.selected));
   const style=TOWER_DANGER_STYLES[option.style];
   const heading=document.createElement('strong');
   heading.textContent=option.kind==='boss'?'БОСС · '+option.profiles.length+' ВРАГА':
    (option.kind==='danger'?'ОПАСНО'+(style?' · '+style.name.toUpperCase():'')+' · 15 ЗА ВЫБИВАНИЕ':'СТАНДАРТ · 10 ЗА ВЫБИВАНИЕ')+' · '+option.profiles.length+' ВРАГ.';
   button.append(heading);
   if(option.relations){const relation=document.createElement('strong');relation.className='tower-relation-banner';
    relation.textContent='ОСОБОЕ ИСПЫТАНИЕ · '+TOWER_RELATION_NAMES[option.relations.type];button.append(relation);}
   const counts=new Map();for(const id of option.profiles)counts.set(id,(counts.get(id)??0)+1);
   const hints=[style?.description,...[...counts].map(([id,n])=>towerEnemyProfile(id)?.name+(n>1?' ×'+n:'')+': '+towerProfileDifference(id))].filter(Boolean);
   if(option.relations)hints.push('ОТНОШЕНИЯ: '+TOWER_RELATION_NAMES[option.relations.type]);
   button.dataset.hint=hints.join(' · ');button.setAttribute('data-hint-tap','');
   for(const [id,n] of counts){const label=document.createElement('span');label.className='tower-enemy-line';
    label.textContent=(towerEnemyProfile(id)?.name??'Босс')+(n>1?' ×'+n:'');button.append(label);}
   button.onclick=()=>{
    if(confirm.disabled||!button.isConnected||index===run.floorPlan.selected)return;
    if(selectTowerFloor(run,index)){onSave();render();choices.children[index]?.focus();}
   };
   choices.append(button);
  });
  if(count===1){description.textContent='Этаж босса. Состав фиксирован; арену можно сменить до загрузки уровня.';}
  const candidates=towerRerollCandidates(run),price=towerRerollPrice(run.arenaRerolls);
  const reroll=document.createElement('button');reroll.type='button';reroll.className='tower-floor-selector-reroll';
  reroll.innerHTML=`ДРУГАЯ АРЕНА · ${Number.isFinite(price)?formatChips(price):'—'}`;
  reroll.disabled=!candidates.length||session.players[player].balance<price;
  reroll.title=reroll.disabled?'Недостаточно монет или нет другой подходящей арены':'Сменить только арену, не состав врагов и награды';
  reroll.onclick=()=>{
   if(confirm.disabled||!reroll.isConnected)return;
   try{purchaseTowerArenaReroll(session,player,run);onSave();message.textContent='Арена изменена. Уровень ещё не загружался.';render();}
   catch(error){message.textContent=error.message;}
  };
  arena.querySelector('div').append(reroll);
 };
 cancel.onclick=()=>{if(confirm.disabled)return;cleanup();onCancel();};
 confirm.onclick=async()=>{
  if(confirm.disabled)return;confirm.disabled=true;cancel.disabled=true;
  onSave();cleanup();
  try{await onConfirm();}
  catch(error){console.error('Tower arena loading:',error);root.append(overlay);confirm.disabled=false;cancel.disabled=false;
   message.textContent='Не удалось подготовить арену. Попробуйте ещё раз.';}
 };
 render();confirm.focus();return {element:overlay,close:cleanup,render};
}
