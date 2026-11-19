// The original preparation panel owns difficulty and arena choices. This
// module only updates the saved floor plan; it never builds a combat scene.
import {arenaDefinition,arenaDiagram} from '../game/arenas.js';
import {selectedTowerFloor,selectTowerFloor,TOWER_DANGER_STYLES} from './floors.js';
import {towerEnemyProfile,towerProfileDifference} from './profiles.js';
import {towerRelationLabel} from './relations.js';
import {purchaseTowerArenaReroll,towerRerollCandidates,towerRerollPrice} from './economy.js';
import {towerEnemyReward,towerEnemyCount} from './model.js';
import {artifactDropChance,ARTIFACT_PIECE_COUNT} from './artifacts.js';
import {hasBoss} from '../boss/config.js';
import {formatChips} from '../ui/currency.js';

export function renderTowerFloorChoices({container,session,player,run,fallbackArenaId='ward',onSave,onChange=()=>{},onError=()=>{}}){
 function render(){
  const selected=selectedTowerFloor(run);
  const definition=arenaDefinition(selected?.arenaId??fallbackArenaId);
  const map=document.createElement('div');map.className='tower-arena-overview';
  const overview=document.createElement('div');overview.className='tower-arena-map';
  const diagram=document.createElement('span');diagram.className='tower-arena-diagram';diagram.innerHTML=arenaDiagram(definition);
  const meta=document.createElement('div');
  const name=document.createElement('strong');name.textContent=definition.name;
  const count=document.createElement('span');count.textContent=`ПРОТИВНИКОВ: ${selected?.profiles.length??towerEnemyCount(run)} · РЕКОРД: ${run.record}`;
  const reward=document.createElement('span');reward.innerHTML=`${formatChips(towerEnemyReward(run))} ЗА ЛИЧНОЕ ВЫБИВАНИЕ`;
  meta.append(name,count);
  if(run.preparing){const recovered=document.createElement('b');recovered.textContent='+1 ОЧКО НАВЫКОВ за победу';meta.append(recovered);}
  meta.append(reward);
  if(hasBoss(run)){const chance=document.createElement('span');chance.dataset.artifactChance='';
   chance.textContent=run.artifacts.pieces.length===ARTIFACT_PIECE_COUNT?'КОЛЛЕКЦИЯ СОБРАНА':
    'ШАНС ФРАГМЕНТА: '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(artifactDropChance(run.artifacts,run.level)*100)+'%';
   meta.append(chance);}
  overview.append(diagram,meta);
  const dice=document.createElement('div');dice.className='tower-arena-dice';
  const reroll=document.createElement('button');reroll.type='button';reroll.className='tower-reroll-button';
  reroll.setAttribute('aria-label','Другая арена');
  reroll.innerHTML='<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="6" y="6" width="52" height="52" rx="8"/><circle cx="20" cy="20" r="4"/><circle cx="44" cy="20" r="4"/><circle cx="32" cy="32" r="4"/><circle cx="20" cy="44" r="4"/><circle cx="44" cy="44" r="4"/></svg>';
  const price=towerRerollPrice(run.arenaRerolls);
  reroll.disabled=!towerRerollCandidates(run).length||session.players[player].balance<price;
  reroll.title=reroll.disabled?'Недостаточно монет или нет другой подходящей арены':'Сменить арену до загрузки уровня';
  const cost=document.createElement('span');cost.className='tower-reroll-price';cost.innerHTML=Number.isFinite(price)?formatChips(price):'—';
  const caption=document.createElement('small');caption.className='tower-reroll-caption';caption.textContent='ДРУГАЯ АРЕНА';
  dice.append(reroll,cost,caption);map.append(overview,dice);
  if(!selected||!run.floorPlan?.options){container.replaceChildren(map);return;}
  const choices=document.createElement('div');choices.className='tower-challenge-options';
  run.floorPlan.options.forEach((option,index)=>{
   const button=document.createElement('button');button.type='button';
   button.className='tower-challenge-option '+(option.kind==='danger'?'is-danger':'is-standard')+
    (index===run.floorPlan.selected?' is-selected':'');
   button.setAttribute('aria-pressed',String(index===run.floorPlan.selected));
   const style=TOWER_DANGER_STYLES[option.style];
   const counts=new Map();for(const id of option.profiles)counts.set(id,(counts.get(id)??0)+1);
   const difficulty=option.kind==='danger'?'Опасно':option.kind==='boss'?'Босс':'Стандарт';
   const type=option.kind==='danger'?(style?.name??'Испытание'):
    option.kind==='boss'?'Босс':'Обычный';
   const rewardPerHead=option.kind==='danger'?15:10;
   const enemyNames=[...counts].map(([id,n])=>(id==='boss'?'Босс':towerEnemyProfile(id).name)+(n>1?' ×'+n:''));
   const rows=[
    ['Сложность',difficulty],
    ['Тип',type],
    ['Награда за голову',formatChips(rewardPerHead)],
    ['Количество врагов',option.profiles.length+' ('+enemyNames.join(', ')+')']
   ];
   for(const [label,value] of rows){
    const line=document.createElement('span');line.className='tower-challenge-detail-row';
    const name=document.createElement('strong');name.textContent=label+':';
    const info=document.createElement('span');if(label==='Награда за голову')info.innerHTML=value;else info.textContent=value;
    line.append(name,info);button.append(line);
   }
   if(option.relations){const relation=document.createElement('small');relation.className='tower-relation-banner';
    relation.textContent='ОСОБОЕ ИСПЫТАНИЕ · '+towerRelationLabel(option.relations);button.append(relation);}
   const hints=[style?.description,...[...counts].map(([id,n])=>towerEnemyProfile(id)?.name+(n>1?' ×'+n:'')+': '+towerProfileDifference(id))].filter(Boolean);
   if(option.relations){
    hints.push('ОТНОШЕНИЯ: '+towerRelationLabel(option.relations));
    const truces=option.relations.teamUntil?.filter(Number.isInteger)??[];
    if(truces.length)hints.push('ВРЕМЕННЫЕ СОЮЗЫ РАСПАДУТСЯ ЧЕРЕЗ '+truces.join(' И ')+' СЕКУНД БОЯ');
   }
   button.dataset.hint=hints.join(' · ');button.setAttribute('data-hint-tap','');
   button.onclick=()=>{
    if(!button.isConnected||index===run.floorPlan.selected||!selectTowerFloor(run,index))return;
    onSave();onChange();render();container.querySelectorAll('.tower-challenge-option')[index]?.focus();
   };
   choices.append(button);
  });
  reroll.onclick=()=>{
   if(!reroll.isConnected||reroll.disabled)return;
   try{purchaseTowerArenaReroll(session,player,run);onSave();onChange();render();}
   catch(error){onError(error.message);}
  };
  container.replaceChildren(map,choices);
 }
 render();return {render};
}
