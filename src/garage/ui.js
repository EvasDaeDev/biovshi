import {COIN_ICON,formatChipsText} from '../ui/currency.js';
import {patientName,SKILLS} from '../ui/patient.js';
import {ctx} from '../game/state.js';
import {bettingModal,bettingOpen,bettingHud} from '../betting/ui.js';
import {bettingSave} from '../betting/storage.js';
import {newGarage,buyHat,nextPrice,normalizePatronage,resolvePatron,setPatientStats,redistributeStat,earnedStats,statMultiplier,critChance} from './model.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {paintPatientPortrait,PORTRAIT_BONES} from '../ui/patient-portrait.js';
import {cleanFloor} from '../render/floor-history.js';
export function garageOpen(){
 const drafts=ctx.betOverlay?.dataset.view==='garage'?[...ctx.betContent.querySelectorAll('[data-patient]')].map(section=>({buyer:section.querySelector('[data-buyer]').value,price:section.querySelector('[data-price]').value,hat:section.querySelector('[data-hat][aria-pressed="true"]')?.dataset.hat})):[];
 const priorScroll=ctx.betOverlay?.dataset.view==='garage'?ctx.betOverlay.querySelector('.bet-panel')?.scrollTop??0:0;
 const active=ctx.betOverlay?.dataset.view==='garage'&&ctx.betContent?.contains(document.activeElement)?document.activeElement:null;
 const activeSection=active?.closest('[data-patient]');
 const focusPatient=activeSection?.dataset.patient;
 const focusKey=active?.hasAttribute('data-stat')?'stat':active?.hasAttribute('data-base')?'base':active?.hasAttribute('data-buyer')?'buyer':active?.hasAttribute('data-price')?'price':null;
 const focusStat=active?.getAttribute('data-stat');
 if(!ctx.betting){ctx.afterSetup='procedure';return bettingOpen();}
 if(ctx.betting.phase==='settled'){ctx.betting.round++;ctx.betting.phase='betting';ctx.betting.bets=[];}
 ctx.betting.garage??=newGarage();normalizePatronage(ctx.betting);
 if(ctx.garageDraftSession!==ctx.betting){ctx.garageDrafts=[];ctx.garageNotices=[];ctx.garageDraftSession=ctx.betting;}
 if(drafts.length)ctx.garageDrafts=drafts;
 if(!ctx.betting.players[ctx.procedureEditor])ctx.procedureEditor=0;
 bettingSave();bettingModal('Процедурная · раунд '+ctx.betting.round);ctx.startup.phase='garage';ctx.betOverlay.dataset.view='garage';bettingHud();
 ctx.betContent.innerHTML=`<p class="bet-muted garage-intro-note">ПЕРЕРАСПРЕДЕЛЕНИЕ: одно очко между навыками. Изменения доступны покровителю пациента.</p>
 <label class="procedure-editor"><span>НАСТРАИВАЕТ</span> <select id="procedure-editor">${ctx.betting.players.map(p=>`<option value="${p.id}" ${p.id===ctx.procedureEditor?'selected':''}>${ctx.betEscape(p.name)}</option>`).join('')}</select></label>
 ${ctx.lastFloorBakeError?`<p class="bet-muted" role="status">${ctx.betEscape(ctx.lastFloorBakeError)}</p>`:''}
 <div class="garage-grid">${ctx.betting.garage.map((g,id)=>{
 const patron=resolvePatron(g),locked=patron!==null&&patron!==ctx.procedureEditor;
 return `<section class="garage-patient" data-patient="${id}"><h3>${patientName(id)} <button type="button" class="patron-name" aria-expanded="false" aria-controls="patron-${id}">(${patron===null?'без покровителя':ctx.betEscape(ctx.betting.players[patron].name)})</button></h3>
 <div id="patron-${id}" class="patron-popup" hidden><strong>Вложения</strong>${ctx.betting.players.map(p=>`<div>${ctx.betEscape(p.name)}: ${ctx.betFormat(g.investments[p.id]??0)}</div>`).join('')}</div>
 ${locked?`<p class="garage-lock-note">Изменяет только покровитель — ${ctx.betEscape(ctx.betting.players[patron].name)}</p>`:''}
 <div class="garage-core"><div class="garage-portrait"></div><div class="garage-stat-list"><small>Побед: ${g.wins??0} · заработано очков: ${9+(g.wins??0)}</small>
 ${SKILLS.map((skill,i)=>`<label><span>${skill.icon} ${i===2?'Манёвр.':skill.name}</span><select aria-label="${ctx.betEscape(skill.name)} — пациент ${String.fromCharCode(65+id)}" data-stat="${i}" ${locked?'disabled':''}>${[...new Set([earnedStats(g.wins)[i]-1,earnedStats(g.wins)[i],earnedStats(g.wins)[i]+1].filter(n=>n>=2))].map(n=>`<option ${n===g.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}
 </div></div><small class="garage-stat-effects">Скор. ${Math.round(statMultiplier(g.stats[0])*100)}% Мобиль. ${Math.round(statMultiplier(g.stats[2])*100)}% Сила +${Math.round(critChance(g.stats[1])*100)}%крит.</small>
 <div class="garage-status-line"><button data-base ${locked?'disabled':''} title="Вернуть исходные характеристики">ВЕРНУТЬ ИСХОДНЫЕ</button><span>ГОЛОВА: ${g.head?'шапка '+g.head.hat+' · '+ctx.betFormat(g.head.price):'свободна'}</span></div>
 <label class="garage-buyer">ПОКУПАТЕЛЬ <select data-buyer>${ctx.betting.players.map(p=>`<option value="${p.id}">${ctx.betEscape(p.name)} · ${formatChipsText(p.balance)}</option>`).join('')}</select></label>
 <div class="garage-hats">${[1,2,3,4].map(h=>`<button data-hat="${h}" aria-label="Выбрать шапку ${h}" aria-pressed="false"><img src="${assetUrl(ASSETS.textures['hat'+h])}" alt="Шапка ${h}"></button>`).join('')}</div>
 <label class="garage-price">ЦЕНА <span class="chip-input"><input data-price type="number" min="${nextPrice(g.head)}" step="1" value="${nextPrice(g.head)}">${COIN_ICON}</span></label><button type="button" data-buy disabled>ВЫБЕРИТЕ ШАПКУ</button><p data-error role="status">${ctx.betEscape(ctx.garageNotices?.[id]??'')}</p></section>`;
 }).join('')}</div>
 <p class="bet-muted garage-purchase-note">Покупка определяет покровительство пациента. Замена экипировки — минимум +10% к предыдущей цене, вложения сохраняются даже после потери вещи.</p>
 <div class="bet-actions garage-actions"><button id="garage-clean">УБОРКА В ПОМЕЩЕНИИ</button><button id="garage-next" class="bet-primary">К СТАВКАМ</button></div>`;
 const panel=ctx.betOverlay.querySelector('.bet-panel');
 if(panel)panel.scrollTop=priorScroll;
 if(focusPatient!==undefined&&focusKey){const target=ctx.betContent.querySelector(`[data-patient="${focusPatient}"] ${focusKey==='stat'?`[data-stat="${focusStat}"]`:`[data-${focusKey}]`}`);target?.focus({preventScroll:true});}
 ctx.betContent.querySelector('#procedure-editor').onchange=event=>{ctx.procedureEditor=Number(event.target.value);garageOpen();};
 ctx.betContent.querySelector('#garage-next').onclick=bettingOpen;
 ctx.betContent.querySelector('#garage-clean').onclick=async event=>{await cleanFloor();event.target.textContent='Пол очищен';};
 for(const section of ctx.betContent.querySelectorAll('[data-patient]')){
  const id=Number(section.dataset.patient),g=ctx.betting.garage[id];
  const patronButton=section.querySelector('.patron-name'),popup=section.querySelector('.patron-popup');
  const show=on=>{popup.hidden=!on;patronButton.setAttribute('aria-expanded',String(on));};
  patronButton.onclick=()=>show(popup.hidden);patronButton.onpointerenter=event=>{if(event.pointerType!=='touch')show(true);};section.onpointerleave=()=>show(false);
  section.onkeydown=event=>{if(event.key==='Escape'){patronButton.focus();show(false);}};
  const source=ctx.cardNodes[id],canvas=document.createElement('canvas');canvas.width=520;canvas.height=224;
  paintPatientPortrait({portrait:canvas,portraitAtlas:source?.portraitAtlas},id,PORTRAIT_BONES.map(b=>({key:b.key,state:'good',opacity:1})));section.querySelector('.garage-portrait').append(canvas);
  section.querySelectorAll('[data-stat]').forEach(select=>select.onchange=()=>{
   const i=Number(select.dataset.stat),value=Number(select.value);
   try{const stats=redistributeStat(g,i,value),before=[...g.stats];setPatientStats(ctx.betting,id,ctx.procedureEditor,stats);ctx.garageNotices[id]=SKILLS.map((skill,j)=>{const delta=g.stats[j]-before[j];return delta?skill.name+' '+(delta>0?'+':'')+delta:null;}).filter(Boolean).join(' · ');bettingSave();garageOpen();}catch(error){select.value=g.stats[i];section.querySelector('[data-error]').textContent=error.message;}
  });
  section.querySelector('[data-base]').onclick=()=>{try{setPatientStats(ctx.betting,id,ctx.procedureEditor,earnedStats(g.wins));ctx.garageNotices[id]='Исходные навыки восстановлены.';bettingSave();garageOpen();}catch(error){section.querySelector('[data-error]').textContent=error.message;}};
  const buyer=section.querySelector('[data-buyer]'),price=section.querySelector('[data-price]'),buy=section.querySelector('[data-buy]');
  const saved=ctx.garageDrafts?.[id];let hat=saved?.hat??null;
  if(saved){buyer.value=saved.buyer;price.value=saved.price;}
  function updatePurchase(){
   section.querySelectorAll('[data-hat]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.hat===hat)));
   buy.disabled=!hat;
   buy.textContent=hat?`КУПИТЬ ШАПКУ ${hat} ЗА ${price.value} · ${ctx.betting.players[Number(buyer.value)].name}`:'ВЫБЕРИТЕ ШАПКУ';
  }
  section.querySelectorAll('[data-hat]').forEach(button=>button.onclick=()=>{hat=button.dataset.hat;updatePurchase();});
  buyer.onchange=price.oninput=updatePurchase;
  buy.onclick=()=>{try{
   const buyerId=Number(buyer.value),amount=Number(price.value);
   buyHat(ctx.betting,id,buyerId,Number(hat),amount);
   ctx.garageNotices[id]=`${ctx.betting.players[buyerId].name}: шапка ${hat}, ${formatChipsText(amount)}. Покровитель — ${ctx.betting.players[resolvePatron(g)].name}.`;
   price.value=nextPrice(g.head);hat=null;updatePurchase();bettingSave();bettingHud();garageOpen();
  }catch(error){section.querySelector('[data-error]').textContent=error.message;}};
  updatePurchase();
 }
}
