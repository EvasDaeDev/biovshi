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
 // Cosmetic variation never consumes the simulation's random sequence.
 const pick=lines=>lines[Math.abs(Math.floor((event.time??0)*10)+(event.robot??event.to??0))%lines.length];
 if(event.type==='hit')return `${attacker} → ${target}: ${event.damage===2?'мощный удар':'попадание'} в ${part}. ${event.damage===2?pick(['Вот теперь дошло.','Жалобу можно подать оставшейся рукой.','Бесплатная коррекция личности.']):pick(['Не дёргайся. Это почти медицина.','Страховка такое не покрывает.','Зато без очереди.','Хреновый день для здорового образа жизни.','Доктор сказал: ещё по одной.','Больно? Значит, ещё живой.'])}`;
 if(event.type==='segment-broken')return `${attacker} оторвал ${target} ${part}${event.damage===2?' мощным ударом':''}. ${pick(['Заберите вещи в регистратуре.','Возврату и обмену не подлежит.','Минус деталь, плюс свободное место.','Теперь чеши другой.','Блядь. А это ещё было нужно.'])}`;
 if(event.type==='robot-immobilized')return event.reason==='погиб'?`${target} погиб. ${pick(['Голову потерял. Буквально.','Выписан. Ногами вперёд.','Лечение окончено. Пациент тоже.'])}`:event.reason==='потерял сознание'?`${target} в отключке. ${pick(['Наконец-то тихий час.','Нашёл кнопку «пропустить этот ад».','На сегодня хватит бесплатной терапии.'])}`:`${target} выбыл. На сегодня с него хватит.`;
 if(event.type==='combat-end')return event.winner===null?'Ничья. Все облажались, касса довольна.':`${patientName(event.winner)} победил. ${pick(['Лучший пациент — тот, кто ещё шевелится.','Приз — ещё один день в этом заведении.','Можете забрать выигрыш и остатки знакомых.','Санитар месяца. Без лицензии.'])}`;
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
