import {ctx} from '../game/state.js';
import {betAddPlayer,betNewSession,betRefund,profileName} from '../betting/ledger.js';
import {removeProfile} from '../betting/profiles.js';
import {bettingSave} from '../betting/storage.js';
import {towerFloorLabel} from '../tower/cycles.js';
import {confirmGameAction} from './confirm-action.js';
import {formatChips} from './currency.js';
import {listenForBackdropDismissal} from './dialog-backdrop.js';

export function installProfiles(root,refreshMenu){
 const dialog=root.querySelector('#player-profiles');
 const openButton=root.querySelector('#launch-setup');
 const dismissButton=dialog.querySelector('[data-paper-dismiss]');
 const cards=dialog.querySelector('.profile-cards');
 const add=dialog.querySelector('.profile-add');
 const addInput=add.elements.name;
 const status=dialog.querySelector('[role="status"]');
 const doc=root.ownerDocument;
 const close=()=>{
  if(!dialog.open)return;
  if(typeof dialog.close==='function')dialog.close();
  dialog.removeAttribute('open');
  openButton.focus({preventScroll:true});
 };
 const show=()=>{
  status.textContent='';
  add.reset();
  render();
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  (ctx.betting?.players.length?dialog.querySelector('h2'):addInput).focus();
  dialog.scrollTop=0;
 };
 const report=error=>{status.textContent=error.message;};
 function prepareRosterChange(){
  const session=ctx.betting;
  // The menu can already have an exhibition staged with zero-value stakes.
  if(session.phase==='running')betRefund(session);
  if(session.phase==='settled'){
   session.round++;
   session.phase='betting';
   session.bets=[];
  }
 }
 function save({rosterChanged=false}={}){
  if(rosterChanged){
   ctx.betDraft=null;
   ctx.procedureEditor=0;
   if(ctx.startup.phase==='demo')ctx.startup.phase='menu';
  }
  bettingSave({animateBalances:false});
  refreshMenu();
 }
 function render(expandedId){
  const players=ctx.betting?.players??[];
  add.hidden=players.length>=16;
  cards.replaceChildren();
  for(const player of players){
   const tower=ctx.betting.towers[player.id];
   const card=doc.createElement('details');
   card.className='profile-card';
   card.open=player.id===expandedId;
   card.innerHTML=`<summary></summary><div class="profile-card-body">
    <dl class="profile-stats"></dl>
    <form class="profile-edit">
     <label>Имя<input name="name" type="text" maxlength="32" required autocomplete="off"></label>
     <button type="submit">СОХРАНИТЬ ИМЯ</button>
     <button type="button" class="profile-delete">УДАЛИТЬ</button>
    </form></div>`;
   const summary=card.querySelector('summary');
   summary.textContent=player.name;
   const stats=[
    ['Баланс',formatChips(player.balance)],
    ['Боёв в Башне',player.towerBattles??0],
    ['Вырублено пациентов',player.towerKnockouts??0],
    ['Текущий этаж',towerFloorLabel(tower?.level??1)],
    ['Максимальный этаж',towerFloorLabel(Math.max(tower?.level??1,(tower?.record??0)+1))]
   ];
   const statsList=card.querySelector('dl');
   for(const [label,value] of stats){
    const stat=doc.createElement('div'),term=doc.createElement('dt'),amount=doc.createElement('dd');
    term.textContent=label;
    if(label==='Баланс')amount.innerHTML=value;
    else amount.textContent=value;
    stat.append(term,amount);statsList.append(stat);
   }
   const edit=card.querySelector('form'),name=edit.elements.name;
   name.value=player.name;
   edit.onsubmit=event=>{
    event.preventDefault();
    try{
     player.name=profileName(name.value);
     name.value=summary.textContent=player.name;
     save();
     status.textContent='Имя изменено.';
    }catch(error){report(error);}
   };
   card.querySelector('.profile-delete').onclick=()=>confirmGameAction({
    root,title:'УДАЛИТЬ ПРОФИЛЬ?',
    details:[`Прогресс и монеты игрока «${player.name}» будут удалены.`,
     players.length===1?'При удалении последнего профиля общая сессия тотализатора будет сброшена.':''],
    confirmLabel:'УДАЛИТЬ ПРОФИЛЬ',
    onConfirm:()=>{
     try{
      prepareRosterChange();
      const id=player.id;
      if(players.length===1)ctx.betting=null;
      else removeProfile(ctx.betting,id);
      save({rosterChanged:true});
      render();
      status.textContent='Профиль удалён.';
      (cards.children[Math.min(id,cards.children.length-1)]?.querySelector('summary')??addInput).focus();
     }catch(error){report(error);}
    }
   });
   cards.append(card);
  }
 }
 add.onsubmit=event=>{
  event.preventDefault();
  try{
   const name=profileName(addInput.value);
   let player;
   if(ctx.betting){
    prepareRosterChange();
    player=betAddPlayer(ctx.betting,name);
   }else{
    ctx.betting=betNewSession([name]);
    player=ctx.betting.players[0];
    ctx.betNotice='';
   }
   save({rosterChanged:true});
   add.reset();
   render(player.id);
   status.textContent='Профиль добавлен.';
   cards.children[player.id].querySelector('summary').focus();
  }catch(error){report(error);}
 };
 openButton.onclick=()=>{
  ctx.audio?.unlock();
  show();
 };
 dismissButton.onclick=close;
 dialog.oncancel=event=>{event.preventDefault();close();};
 const removeBackdrop=listenForBackdropDismissal(dialog,close);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  if(dialog.open){
   if(typeof dialog.close==='function')dialog.close();
   dialog.removeAttribute('open');
  }
  removeBackdrop();
  openButton.onclick=dismissButton.onclick=dialog.oncancel=add.onsubmit=null;
  cards.replaceChildren();
  dispose();
 };
}
