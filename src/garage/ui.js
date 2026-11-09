import {COIN_ICON,formatChipsText} from '../ui/currency.js';
import {ctx} from '../game/state.js';
import {bettingModal,bettingOpen,bettingHud} from '../betting/ui.js';
import {bettingSave} from '../betting/storage.js';
import {newGarage,validStats,buyHat,nextPrice} from './model.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';
import {paintPatientPortrait,PORTRAIT_BONES} from '../ui/patient-portrait.js';
import {cleanFloor} from '../render/floor-history.js';
export function garageOpen(){
  if(!ctx.betting)return bettingOpen();
  if(ctx.betting.phase==='settled'){ctx.betting.round++;ctx.betting.phase='betting';ctx.betting.bets=[];}
  ctx.betting.garage??=newGarage();
  bettingSave();bettingModal('Гараж · раунд '+ctx.betting.round);ctx.startup.phase='garage';ctx.betOverlay.dataset.view='garage';bettingHud();
  ctx.betContent.innerHTML=`<p class="bet-muted">Перенесите одно очко между навыками. Настройки сохраняются до следующего изменения. Украшения — до поражения или потери головы.</p>
  ${ctx.lastFloorBakeError?`<p class="bet-muted" role="status">${ctx.betEscape(ctx.lastFloorBakeError)}</p>`:''}
  <div class="garage-grid">${ctx.betting.garage.map((g,id)=>`<section class="garage-patient" data-patient="${id}"><h3>Пациент ${'ABCD'[id]}</h3><div class="garage-portrait"></div>
  ${['Скорость','Сила','Маневренность'].map((name,i)=>`<label>${name} <select data-stat="${i}">${[2,3,4].map(n=>`<option ${n===g.stats[i]?'selected':''}>${n}</option>`).join('')}</select></label>`).join('')}
  <small>Скорость / поворот: 80 / 100 / 120%. Мощный удар: 0 / 15 / 30%.</small>
  <button data-base>Вернуть 3 / 3 / 3</button><p>Голова: ${g.head?'шапка '+g.head.hat+' · '+ctx.betFormat(g.head.price):'свободна'}</p>
  <label>Покупатель <select data-buyer>${ctx.betting.players.map(p=>`<option value="${p.id}">${ctx.betEscape(p.name)} · ${formatChipsText(p.balance)}</option>`).join('')}</select></label>
  <div class="garage-hats">${[1,2,3,4].map(h=>`<button data-hat="${h}" aria-label="Установить шапку ${h}"><img src="${assetUrl(ASSETS.textures['hat'+h])}" alt="Шапка ${h}"></button>`).join('')}</div>
  <label>Цена установки <span class="chip-input"><input data-price type="number" min="${nextPrice(g.head)}" step="1" value="${nextPrice(g.head)}">${COIN_ICON}</span></label><small>Следующая замена минимум +10%. Оплата полностью, без возврата.</small><p data-error role="status"></p></section>`).join('')}</div>
  <div class="bet-actions"><button id="garage-clean">Уборка в помещении</button><button id="garage-next" class="bet-primary">ПРОПУСТИТЬ · К СТАВКАМ</button></div>`;
  ctx.betContent.querySelector('#garage-next').onclick=bettingOpen;
  ctx.betContent.querySelector('#garage-clean').onclick=async event=>{await cleanFloor();event.target.textContent='Пол очищен';};
  for(const section of ctx.betContent.querySelectorAll('[data-patient]')){
    const id=Number(section.dataset.patient),g=ctx.betting.garage[id];
    const source=ctx.cardNodes[id],canvas=document.createElement('canvas');canvas.width=520;canvas.height=224;
    const card={portrait:canvas,portraitAtlas:source?.portraitAtlas};
    paintPatientPortrait(card,id,PORTRAIT_BONES.map(b=>({key:b.key,state:'good',opacity:1})));section.querySelector('.garage-portrait').append(canvas);
    section.querySelectorAll('[data-stat]').forEach(select=>select.onchange=()=>{
      const i=Number(select.dataset.stat),value=Number(select.value),old=g.stats[i],stats=[3,3,3];
      if(value!==3){
        const opposite=6-value;
        let other=g.stats.findIndex((n,j)=>j!==i&&n===opposite);
        if(other<0)other=g.stats.findIndex((n,j)=>j!==i&&n===3);
        if(other<0)other=(i+1)%3;
        stats[i]=value;stats[other]=opposite;
      }
      if(validStats(stats)){g.stats=stats;bettingSave();garageOpen();}else{select.value=old;section.querySelector('[data-error]').textContent='Можно перенести только одно очко: 2 / 3 / 4.';}
    });
    section.querySelector('[data-base]').onclick=()=>{g.stats=[3,3,3];bettingSave();garageOpen();};
    section.querySelectorAll('[data-hat]').forEach(button=>button.onclick=()=>{
      try{buyHat(ctx.betting,id,Number(section.querySelector('[data-buyer]').value),Number(button.dataset.hat),Number(section.querySelector('[data-price]').value));bettingSave();garageOpen();}
      catch(error){section.querySelector('[data-error]').textContent=error.message;}
    });
  }
}
