import {ctx} from '../game/state.js';
import {onGameEvent} from '../game/event-bus.js';
import {patientName} from './patient.js';
export function segmentName(key){
 if(key==='head')return 'голову';if(key?.startsWith('spine-'))return key==='spine-3'?'таз':'позвоночник';
 const left=key?.includes('--1-');
 if(key?.startsWith('arm')&&key.endsWith('lower'))return (left?'левое ':'правое ')+'предплечье';
 const limb=key?.startsWith('arm')?'руку':key?.endsWith('lower')?'голень':'ногу';return (left?'левую ':'правую ')+limb;
}
export function combatLine(event){
 const target=patientName(event.robot??event.to,{short:true}),attacker=patientName(event.by??event.from,{short:true}),part=segmentName(event.segment);
 const spice=['Больно, но бесплатно.','Анестезия в отпуске.','Чек за ремонт растёт.','Доктор промахнулся профессией.'][Math.abs(Math.floor((event.time??0)*10))%4];
 if(event.type==='hit')return `${attacker} → ${target}: ${event.damage===2?'мощный удар':'попадание'} в ${part}. ${event.damage===2?'Гарантия аннулирована.':spice}`;
 if(event.type==='segment-broken')return `${attacker} оторвал ${target} ${part}${event.damage===2?' мощным ударом':''}. оторвалось!`;
 if(event.type==='robot-immobilized')return event.reason==='погиб'?`${target} потрачено.`:event.reason==='потерял сознание'?`${target} в отключке.`:`${target} выбыл.`;
 if(event.type==='combat-end')return event.winner===null?'Ничья. Морг просит добавку.':`${patientName(event.winner)} победил. Пилюли ему!`;
 return null;
}
export function initializeCombatLog(){
 ctx.root.querySelector('#combat-log')?.remove();
 const log=document.createElement('ol');log.id='combat-log';log.setAttribute('aria-label','Журнал боя');log.setAttribute('role','log');log.setAttribute('aria-live','polite');ctx.stage.append(log);ctx.combatLog=log;
 const unsubscribe=onGameEvent(event=>{
   const line=combatLine(event);if(!line)return;
   const row=document.createElement('li');row.innerHTML=line;log.append(row);
   while(log.children.length>10)log.firstElementChild.remove();
   // Wrapped messages can fill the viewport before ten entries accumulate.
   log.dataset.full=String(log.scrollHeight>log.clientHeight||log.children.length===10);
   log.scrollTop=log.scrollHeight;
 });
 const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{unsubscribe();log.remove();dispose();};
}
export function resetCombatLog(){if(ctx.combatLog){ctx.combatLog.replaceChildren();ctx.combatLog.dataset.full='false';}}
