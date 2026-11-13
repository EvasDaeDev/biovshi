import {STREAMER_LINES} from './streamer-lines.js';
import {ROBOT_COLORS} from '../utils/colors.js';

export function quipCategory(event){
 if(event.type==='combat-start')return 'start';
 if(event.type==='streamer-idle')return 'idle';
 if(event.type==='combat-end')return event.winner===null?'draw':'victory';
 if(event.type==='robot-immobilized')return event.reason==='погиб'?'death':'knockout';
 if(event.type==='segment-broken')return event.segment?.startsWith('arm')?'arm':event.segment?.startsWith('leg')?'leg':'detached';
 if(event.type==='hit')return event.damage===2?'critical':'hit';
 return null;
}
// One selector per mascot; round resets deliberately preserve its shuffled bags.
export function createQuipSelector(catalog=STREAMER_LINES,random=Math.random){
 const bags=new Map();
 return event=>{
  const category=quipCategory(event);if(!category)return '';
  const source=catalog[category];
  // Deduplicate copy so identical entries cannot cause consecutive repeats.
  const lines=Array.isArray(source)?[...new Set(source.filter(line=>typeof line==='string'&&line.trim()))]:[];
  if(!lines.length)return '';
  let state=bags.get(category);
  if(!state){state={remaining:[],last:null};bags.set(category,state);}
  if(!state.remaining.length){
   state.remaining=[...lines];
   for(let i=state.remaining.length-1;i>0;i--){
    const j=Math.floor(random()*(i+1));
    [state.remaining[i],state.remaining[j]]=[state.remaining[j],state.remaining[i]];
   }
   const last=state.remaining.length-1;
   if(last>0&&state.remaining[last]===state.last){
    const j=Math.floor(random()*last);
    [state.remaining[last],state.remaining[j]]=[state.remaining[j],state.remaining[last]];
   }
  }
  state.last=state.remaining.pop();
  return quipFor(event,state.last);
 };
}

export function quipFor(event,template=''){
 const id=event.robot??event.to??event.winner;
 const fighter=Number.isInteger(id)&&id>=0&&id<26?String.fromCharCode(65+id):'—';
 return template.replaceAll('{fighter}',event.fighterName??fighter);
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
