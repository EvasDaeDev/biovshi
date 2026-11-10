import {COIN_ICON,formatChipsText} from '../ui/currency.js';
import {patientName,SKILLS} from '../ui/patient.js';
import {ctx} from '../game/state.js';
import {bettingModal,bettingOpen,bettingHud} from '../betting/ui.js';
import {bettingSave} from '../betting/storage.js';
import {newGarage,buyHat,nextPrice,normalizePatronage,resolvePatron,setPatientStats,earnedStats,statMultiplier,critChance} from './model.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {paintPatientPortrait,PORTRAIT_BONES} from '../ui/patient-portrait.js';
import {cleanFloor} from '../render/floor-history.js';
export function garageOpen(){
 const priorScroll=ctx.betOverlay?.dataset.view==='garage'?ctx.betOverlay.querySelector('.bet-panel')?.scrollTop??0:0;
 const active=ctx.betOverlay?.dataset.view==='garage'&&ctx.betContent?.contains(document.activeElement)?document.activeElement:null;
 const activeSection=active?.closest('[data-patient]');
 const focusPatient=activeSection?.dataset.patient;
 const focusKey=active?.hasAttribute('data-stat')?'stat':active?.hasAttribute('data-base')?'base':active?.hasAttribute('data-buyer')?'buyer':active?.hasAttribute('data-price')?'price':null;
 const focusStat=active?.getAttribute('data-stat');
 if(!ctx.betting){ctx.afterSetup='procedure';return bettingOpen();}
 if(ctx.betting.phase==='settled'){ctx.betting.round++;ctx.betting.phase='betting';ctx.betting.bets=[];}
 ctx.betting.garage??=newGarage();normalizePatronage(ctx.betting);
 if(!ctx.betting.players[ctx.procedureEditor])ctx.procedureEditor=0;
 bettingSave();bettingModal('Процедурная · раунд '+ctx.betting.round);ctx.startup.phase='garage';ctx.betOverlay.dataset.view='garage';bettingHud();
 ctx.betContent.innerHTML=`<p class="bet-muted garage-intro-note">ПЕРЕРАСПРЕДЕЛЕНИЕ: одно очко между навыками. Изменения доступны покровителю пациента.</p>
 <label class="procedure-editor"><span>НАСТРАИВАЕТ</span> <select id="procedure-editor">${ctx.betting.players.map(p=>`<option value="${p.id}" ${p.id===ctx.procedureEditor?'selected':''}>${ctx.betEscape(p.name)}</option>`).join('')}</select></label>
 ${ctx.lastFloorBakeError?`<p class="bet-muted" role="status">${ctx.betEscape(ctx.lastFloorBakeError)}</p>`:''}
 <div class="garage-grid">${ctx.betting.garage.map((g,id)=>{
 const patron=resolvePatron(g),locked=patron!==null&&patron!==ctx.procedureEditor;
 return `<section class="garage-patient" data-patient="${id}"><h3>${patientName(id)} <button type="button" class="patron-name" aria-expanded="false" aria-controls="patron-${id}">(${patron===null?'без покровителя':ctx.betEscape(ctx.betting.players[patron].name)})</button></h3>
 <div id="patron-${id}" class="patron-popup" hidden><strong>Вложения</strong>${ctx.betting.players.map(p=>`<div>${ctx.betEscape(p.name)}: ${ctx.betFormat(g.investments[p.id]??0)}</div>`).join('')}</div>
 <div class="garage-core"><div class="garage-portrait"></div><div class="garage-stat-list"><small>Побед: ${g.wins??0} · заработано очков: ${9+(g.wins??0)}</small>
 ${SKILLS.map((skill,i)=>`<label><span>${skill.icon} ${skill.name}</span><select aria-label="${skill.name} — ${patientName(id,{short:true})}" data-stat="${i}" ${locked?'disabled':''}>${[...new Set([earnedStats(g.wins)[i]-1,earnedStats(g.wins)[i],earnedStats(g.wins)[i]+1].filter(n=>n>=2))].map(n=>`<option ${n===g.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}
 </div></div><small class="garage-stat-effects">→ / ↻: ${Math.round(statMultiplier(g.stats[0])*100)}% / ${Math.round(statMultiplier(g.stats[2])*100)}%. 💪: ${Math.round(critChance(g.stats[1])*100)}% crt.</small>
 <div class="garage-status-line"><button data-base ${locked?'disabled':''} title="Вернуть исходные характеристики">СБРОС НАВЫКОВ</button><span>ГОЛОВА: ${g.head?'шапка '+g.head.hat+' · '+ctx.betFormat(g.head.price):'свободна'}</span></div>
 <label class="garage-buyer">ПОКУПАТЕЛЬ <select data-buyer>${ctx.betting.players.map(p=>`<option value="${p.id}">${ctx.betEscape(p.name)} · ${formatChipsText(p.balance)}</option>`).join('')}</select></label>
 <div class="garage-hats">${[1,2,3,4].map(h=>`<button data-hat="${h}" aria-label="Установить шапку ${h}"><img src="${assetUrl(ASSETS.textures['hat'+h])}" alt="Шапка ${h}"></button>`).join('')}</div>
 <label class="garage-price">ЦЕНА <span class="chip-input"><input data-price type="number" min="${nextPrice(g.head)}" step="1" value="${nextPrice(g.head)}">${COIN_ICON}</span></label><p data-error role="status"></p></section>`;
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
   const i=Number(select.dataset.stat),value=Number(select.value),base=earnedStats(g.wins),stats=[...base];
   if(value!==base[i]){let other=g.stats.findIndex((n,j)=>j!==i&&n===base[j]+(base[i]-value));if(other<0)other=g.stats.findIndex((n,j)=>j!==i&&n===base[j]);if(other<0)other=(i+1)%3;
    if(base[other]+base[i]-value<2)other=[0,1,2].find(j=>j!==i&&base[j]+base[i]-value>=2)??other;
    stats[i]=value;stats[other]+=base[i]-value;}
   try{setPatientStats(ctx.betting,id,ctx.procedureEditor,stats);bettingSave();garageOpen();}catch(error){select.value=g.stats[i];section.querySelector('[data-error]').textContent=error.message;}
  });
  section.querySelector('[data-base]').onclick=()=>{try{setPatientStats(ctx.betting,id,ctx.procedureEditor,earnedStats(g.wins));bettingSave();garageOpen();}catch(error){section.querySelector('[data-error]').textContent=error.message;}};
  section.querySelectorAll('[data-hat]').forEach(button=>button.onclick=()=>{try{buyHat(ctx.betting,id,Number(section.querySelector('[data-buyer]').value),Number(button.dataset.hat),Number(section.querySelector('[data-price]').value));bettingSave();garageOpen();}catch(error){section.querySelector('[data-error]').textContent=error.message;}});
 }
}
