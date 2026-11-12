// Approved copy. {fighter} is a short arena letter, never a patient title/name.
export const STREAMER_QUIPS={
 start:['Мясо подъехало!','Кто первый ляжет?','Обнимайтесь покрепче!'],
 hit:['{fighter}, держи сдачу!','Хрустит — значит свежее!','Нежнее, садист!','Ой, прямо больно!'],
 critical:['{fighter}, зубы собери!','Аж хрустнуло!','Вот это массаж!','Минус самооценка!'],
 arm:['{fighter}, ручкой помаши!','Рук больше нет?','Верните {fighter} руку!'],
 leg:['{fighter}, ножку забыл!','Допрыгался, зайчик!','Ползи, красавчик!'],
 detached:['{fighter} теряет запчасти!','Ой, отвалилось!','Это было лишнее?','Сборка без гарантии!'],
 knockout:['{fighter} вышел!','Спи, мой сладкий!','Устал быть целым!'],
 death:['{fighter} окончательно вышел!','В морг!','Больше небольно!','Пакетик нужен?'],
 victory:['Остался один!','Красавчик, почти целый!','Поздравляю, снова сюда!','Главный кусок мяса!'],
 idle:['…скуучно.','Чего такие целые?']
};
export function quipCategory(event){
 if(event.type==='combat-start')return 'start';
 if(event.type==='streamer-idle')return 'idle';
 if(event.type==='combat-end')return event.winner===null?'death':'victory';
 if(event.type==='robot-immobilized')return event.reason==='погиб'?'death':'knockout';
 if(event.type==='segment-broken')return event.segment?.startsWith('arm')?'arm':event.segment?.startsWith('leg')?'leg':'detached';
 if(event.type==='hit')return event.damage===2?'critical':'hit';
 return null;
}
export function quipFor(event,index=0){
 const category=quipCategory(event);if(!category)return '';
 const lines=event.type==='combat-end'&&event.winner===null?STREAMER_QUIPS.death.slice(1):category==='arm'||category==='leg'?[...STREAMER_QUIPS[category],...STREAMER_QUIPS.detached]:STREAMER_QUIPS[category];
 const id=event.robot??event.to??event.winner;
 const fighter=Number.isInteger(id)&&id>=0&&id<26?String.fromCharCode(65+id):'—';
 return lines[index%lines.length].replaceAll('{fighter}',fighter);
}
