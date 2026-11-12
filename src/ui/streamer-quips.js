import {ROBOT_COLORS} from '../utils/colors.js';

// {fighter} uses the live combat name in tower mode and the arena letter otherwise.
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
 const name=event.fighterName??fighter;
 if(event.type==='combat-end')return event.winner===null?'Бой окончен!':`${name} победил!`;
 if(event.type==='robot-immobilized')return `${name} ${event.reason==='погиб'?'погиб':'вышел'}!`;
 return lines[index%lines.length].replaceAll('{fighter}',name);
}

// A spoken line is followed by an equally long silent interval; animation continues.
export function createSpeechPacer(){
 let time=0,next=0;
 return {
  tick(dt){time+=Math.max(0,dt);},
  take(duration){if(time+1e-9<next)return false;next=time+duration*2;return true;},
  reset(){time=next=0;}
 };
}
export function renderQuip(caption,text,event={}){
 const doc=caption.ownerDocument;
 if(event.fighterName){
  const at=text.indexOf(event.fighterName),id=event.robot??event.to??event.winner;
  if(at<0){caption.textContent=text;return;}
  const name=doc.createElement('span');name.className='streamer-fighter';
  name.style.color=ROBOT_COLORS[id%ROBOT_COLORS.length];name.textContent=event.fighterName;
  caption.replaceChildren(doc.createTextNode(text.slice(0,at)),name,doc.createTextNode(text.slice(at+event.fighterName.length)));return;
 }
 caption.replaceChildren(...text.split(/(\b[A-Z]\b)/).map(part=>{
  if(!/^[A-Z]$/.test(part))return doc.createTextNode(part);
  const name=doc.createElement('span');name.className='streamer-fighter';
  name.style.color=ROBOT_COLORS[(part.charCodeAt(0)-65)%ROBOT_COLORS.length];
  name.textContent=part;return name;
 }));
}
