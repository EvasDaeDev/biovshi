// The original preparation panel owns difficulty and arena choices. This
// module only updates the saved floor plan; it never builds a combat scene.
import {arenaDefinition,arenaDiagram} from '../game/arenas.js';
import {selectedTowerFloor,selectTowerFloor,TOWER_DANGER_STYLES} from './floors.js';
import {towerEnemyProfile,towerProfileDifference} from './profiles.js';
import {towerRelationLabel} from './relations.js';
import {purchaseTowerArenaReroll,towerRerollCandidates,towerRerollPrice} from './economy.js';
import {towerEnemyCount} from './model.js';
import {artifactDropChance,bossRepeatDropChance,ARTIFACT_PIECE_COUNT} from './artifacts.js';
import {towerBossRarityOdds,TOWER_RARITIES} from './mutations.js';
import {TOWER_SECOND_SEGMENT_CHANCE} from './segments.js';
import {hasBoss} from '../boss/config.js';
import {formatChips} from '../ui/currency.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';

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
  if(hasBoss(run)){const chance=document.createElement('span');chance.dataset.artifactChance='';
   chance.textContent=run.artifacts.pieces.length===ARTIFACT_PIECE_COUNT?'КОЛЛЕКЦИЯ СОБРАНА':
    'ШАНС ФРАГМЕНТА: '+new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2}).format(artifactDropChance(run.artifacts,run.level)*100)+'%';
   meta.append(chance);}
  overview.append(diagram,meta);
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
   if(option.kind==='boss'){
    const previousWins=run.artifacts.bossWins[run.level]??0;
    const odds=document.createElement('span');odds.className='tower-boss-rarity-odds';
    const label=document.createElement('strong');label.textContent=run.segmentRewardsEnabled===false?'РЕДКОСТЬ НАГРАДЫ':'РЕДКОСТЬ КАЖДОЙ ДЕТАЛИ';
    const ranks=document.createElement('span');
    for(const {rarity,percent} of towerBossRarityOdds(run.level,previousWins)){
     const item=document.createElement('span');item.dataset.rarity=String(rarity);
     const {name,colour}=TOWER_RARITIES[rarity];
     if(colour)item.style.setProperty('--tower-rarity-color',colour);
     item.textContent=name+' '+percent+'%';
     ranks.append(item);
    }
    odds.append(label,ranks);
    if(run.segmentRewardsEnabled!==false){
     const percent=new Intl.NumberFormat('ru-RU',{style:'percent',maximumFractionDigits:2});
     if(previousWins>0){
      const batch=document.createElement('small');batch.textContent='ШАНС ДРОПА: '+percent.format(bossRepeatDropChance(previousWins));
      odds.append(batch);
     }
     const extra=document.createElement('small');extra.textContent='ВТОРАЯ ДЕТАЛЬ: '+percent.format(TOWER_SECOND_SEGMENT_CHANCE);
     odds.append(extra);
    }
    button.append(odds);
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
