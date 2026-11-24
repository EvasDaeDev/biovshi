import {towerOpponentReward} from '../boss/encounter.js';
// The original preparation panel owns difficulty and arena choices. This
// module only updates the saved floor plan; it never builds a combat scene.
import {arenaDefinition,arenaDiagram} from '../game/arenas.js';
import {selectedTowerFloor,selectTowerFloor,TOWER_DANGER_STYLES} from './floors.js';
import {towerEnemyProfile,towerProfileDifference} from './profiles.js';
import {towerRelationLabel} from './relations.js';
import {purchaseTowerArenaReroll,towerRerollCandidates,towerRerollPrice} from './economy.js';
import {towerEnemyCount} from './model.js';
import {artifactDropChance} from './artifacts.js';
import {towerBossRarityOdds,TOWER_RARITIES} from './mutations.js';
import {towerSegmentDropChance,TOWER_SECOND_SEGMENT_CHANCE} from './segments.js';
import {hasBoss} from '../boss/config.js';
import {formatChips} from '../ui/currency.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';

const dropPercent=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const formatDropChance=chance=>chance>0&&chance<.0001?'<0,01%':dropPercent.format(chance*100)+'%';

function bossDropSummary(run){
 const previousWins=run.artifacts.bossWins[run.level]??0;
 const fragment=artifactDropChance(run.artifacts,run.level);
 const segments=Boolean(run.segmentRewardsEnabled);
 const batch=segments?towerSegmentDropChance(previousWins):1;
 if(!fragment&&!batch)return null;

 const summary=document.createElement('span');summary.className='tower-boss-drop';
 summary.tabIndex=0;
 summary.setAttribute('data-hint-tap','');
 const heading=document.createElement('strong');heading.textContent='ДРОП С БОССА:';
 summary.append(heading,' ');
 const hints=[];
 if(fragment){
  const artifact=document.createElement('span');artifact.dataset.artifactChance='';
  artifact.textContent='артефакт '+formatDropChance(fragment);
  summary.append(artifact);
  hints.push('Фрагмент артефакта: '+formatDropChance(fragment)+'. Его выпадение разыгрывается отдельно от модификации.');
 }
 if(batch){
  if(fragment)summary.append(', ');
  summary.append('модификатор ');
  const ranks=[];
  for(const {rarity,percent} of towerBossRarityOdds(run.level,previousWins)){
   const chance=batch*percent/100;
   const {name,colour}=TOWER_RARITIES[rarity];
   const item=document.createElement('span');item.dataset.rarity=String(rarity);
   if(colour)item.style.setProperty('--tower-rarity-color',colour);
   item.textContent=formatDropChance(chance);
   if(ranks.length)summary.append(', ');
   summary.append(item);
   ranks.push(name.toLowerCase()+' '+item.textContent);
  }
  hints.push((segments?'Шансы получить первую деталь после победы: ':'Шансы ранга предложения после победы: ')+ranks.join(', ')+'.');
  if(segments){
   if(previousWins>0)hints.push('Шанс получить набор деталей при повторной победе: '+formatDropChance(batch)+'.');
   hints.push('Если набор выпал, первая деталь гарантирована. Вторая выпадает с шансом '+formatDropChance(TOWER_SECOND_SEGMENT_CHANCE)+'.');
   hints.push(previousWins?'Обе детали получают ранг текущего цикла.':'Ранг второй детали разыгрывается отдельно.');
  }else{
   hints.push('Варианты выбора получают один общий ранг.');
  }
 }
 summary.dataset.hint=hints.join('\n');
 return summary;
}

export function renderTowerFloorChoices({container,session,player,run,fallbackArenaId='ward',onSave,onChange=()=>{},onError=()=>{}}){
 function render(){
  const selected=selectedTowerFloor(run);
  const definition=arenaDefinition(selected?.arenaId??fallbackArenaId);
  const map=document.createElement('div');map.className='tower-arena-overview';
  const overview=document.createElement('div');overview.className='tower-arena-map';
  const diagram=document.createElement('span');diagram.className='tower-arena-diagram';diagram.innerHTML=arenaDiagram(definition);
  const meta=document.createElement('div');
  const name=document.createElement('strong');name.textContent=definition.name;
  const count=document.createElement('span');count.textContent=`ПРОТИВНИКОВ: ${selected?.profiles.length??towerEnemyCount(run)}`;
  meta.append(name,count);
  if(run.preparing){const recovered=document.createElement('b');recovered.textContent='+1 ОЧКО НАВЫКОВ за победу';meta.append(recovered);}
  overview.append(diagram,meta);
  if(hasBoss(run)){
   const drop=bossDropSummary(run);
   if(drop)overview.append(drop);
  }
  const dice=document.createElement('div');dice.className='tower-arena-dice';
  const reroll=document.createElement('button');reroll.type='button';reroll.className='tower-reroll-button';
  reroll.setAttribute('aria-label','Сменить арену');
  const diceImage=document.createElement('img');diceImage.src=assetUrl(ASSETS.textures.uiDice);diceImage.alt='';diceImage.setAttribute('aria-hidden','true');reroll.append(diceImage);
  const price=towerRerollPrice(run.arenaRerolls);
  reroll.disabled=!towerRerollCandidates(run).length||session.players[player].balance<price;
  reroll.title=reroll.disabled?'Недостаточно монет или нет другой подходящей арены':'Сменить арену до загрузки уровня';
  const cost=document.createElement('span');cost.className='tower-reroll-price';cost.innerHTML=Number.isFinite(price)?formatChips(price):'—';
  const caption=document.createElement('small');caption.className='tower-reroll-caption';caption.textContent='СМЕНИТЬ АРЕНУ ·';
  const priceLine=document.createElement('button');priceLine.type='button';priceLine.className='tower-reroll-line';
  priceLine.setAttribute('aria-label','Сменить арену за '+price+' монет');
  priceLine.disabled=reroll.disabled;
  priceLine.append(caption,cost);
  // Keep currency icons outside the dice button: its image styles must only
  // affect the die, never the chip icon in the price caption.
  priceLine.onclick=()=>reroll.click();
  dice.append(reroll,priceLine);map.append(overview,dice);
  reroll.onclick=()=>{
   if(!reroll.isConnected||reroll.disabled)return;
   try{purchaseTowerArenaReroll(session,player,run);onSave();onChange();render();}
   catch(error){onError(error.message);}
  };
  if(!selected||!run.floorPlan?.options){container.replaceChildren(map);return;}
  const choices=document.createElement('div');choices.className='tower-challenge-options';
  run.floorPlan.options.forEach((option,index)=>{
   const button=document.createElement('button');button.type='button';
   button.className='tower-challenge-option '+(option.kind==='danger'?'is-danger':'is-standard')+
    (index===run.floorPlan.selected?' is-selected':'');
   button.setAttribute('aria-pressed',String(index===run.floorPlan.selected));
   const style=TOWER_DANGER_STYLES[option.style];
   const counts=new Map();for(const id of option.profiles)counts.set(id,(counts.get(id)??0)+1);
   const difficulty=option.kind==='danger'?'ОПАСНО':option.kind==='boss'?'БОСС':'СТАНДАРТ';
   const type=option.kind==='danger'?(style?.name.toUpperCase()??'ИСПЫТАНИЕ'):
    option.kind==='boss'?'БОСС':'ОБЫЧНЫЙ';
   const rewardPerHead=towerOpponentReward(false,option.kind==='danger');
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

  container.replaceChildren(map,choices);
 }
 render();return {render};
}
