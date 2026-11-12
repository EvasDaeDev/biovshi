import {ctx} from '../game/state.js';
import {onGameEvent} from '../game/event-bus.js';
import {quipCategory,quipFor} from './streamer-quips.js';
import {ASSETS,assetUrl} from '../assets/manifest.js';

const STORAGE='biovshi.streamer-hidden.v1';
// Match the chin-to-collar placement in girl_prv.png for every expression.
const HEAD_OFFSET_Y=22;
const SHOULDER_OFFSET_Y=20;
// Rectangles use the original, transparent atlas. Heads and effects stay independent.
const HEADS={
 neutral:[13,10,157,233], admire:[198,9,156,236], fear:[388,10,156,235],
 joy:[592,9,156,248], cheer:[310,265,156,235], annoyed:[527,258,163,249]
};
const EFFECTS={
 admire:[[179,28,29,79],[339,26,29,79]],
 fear:[[373,45,27,110],[542,43,16,109]],
 joy:[[561,54,29,62],[739,50,44,79]],
 cheer:[[268,272,48,89],[451,270,47,92]],
 annoyed:[[679,369,39,42]]
};

export function reactionFor(event){
 if(event.type==='combat-start')return {emotion:'joy',priority:2,duration:2.3};
 if(event.type==='streamer-idle')return {emotion:'annoyed',priority:0,duration:2.3};
 if(event.type==='combat-end')return {emotion:event.winner===null?'annoyed':'cheer',priority:5,duration:2.7};
 if(event.type==='robot-immobilized')return {emotion:event.reason==='погиб'?'fear':'admire',priority:4,duration:2.1};
 if(event.type==='segment-broken')return {emotion:'fear',priority:3,duration:1.9};
 if(event.type==='hit')return {emotion:event.damage===2?'admire':(Math.floor((event.time??0)*10)%3===0?'joy':'annoyed'),priority:event.damage===2?2:1,duration:2};
 return null;
}

// One pending reaction, with expiry: even a very busy fight never builds a backlog.
export function createReactionTrack(){
 let pending=null,current=null,time=0,until=0;
 return {
  offer(event){const next=reactionFor(event);if(!next)return; if(!pending||next.priority>=pending.priority)pending={...next,event,ready:time+.12,expires:time+2.5};},
  tick(dt,accept=true){
   time+=Math.min(Math.max(dt,0),.1);
   if(current&&time>=until)current=null;
   if(pending&&time>pending.expires)pending=null;
   if(accept&&pending&&time>=pending.ready&&(!current||pending.priority>current.priority)){
    current=pending;pending=null;until=time+current.duration;
   }
   return current;
  },
  reset(){pending=current=null;time=until=0;}
 };
}

// Keep the largest connected alpha shape (the head), excluding nearby comic icons.
// This runs once per load; the render loop only draws cached sprites.
function isolateHead(doc,atlas,rect,icons=false){
 const canvas=doc.createElement('canvas');canvas.width=rect[2];canvas.height=rect[3];
 const paint=canvas.getContext('2d');paint.imageSmoothingEnabled=false;
 paint.drawImage(atlas,...rect,0,0,canvas.width,canvas.height);
 const pixels=paint.getImageData(0,0,canvas.width,canvas.height),data=pixels.data;
 const width=canvas.width,length=width*canvas.height,seen=new Uint8Array(length);
 let largest=[],small=[];
 for(let start=0;start<length;start++){
  if(seen[start]||data[start*4+3]<=20)continue;
  const group=[start];seen[start]=1;
  for(let i=0;i<group.length;i++){
   const p=group[i],x=p%width;
   for(const next of [x>0?p-1:-1,x<width-1?p+1:-1,p-width,p+width]){
    if(next<0||next>=length||seen[next]||data[next*4+3]<=20)continue;
    seen[next]=1;group.push(next);
   }
  }
  if(group.length>largest.length)largest=group;
  if(icons&&group.length<=1000)small.push(...group);
 }
 const keep=new Uint8Array(length);
 // Preserve the antialiased fringe authored in the source, without filtering it.
 for(const p of icons?small:largest){keep[p]=1;for(const n of [p-1,p+1,p-width,p+width])if(n>=0&&n<length)keep[n]=1;}
 for(let p=0;p<length;p++)if(!keep[p])data[p*4+3]=0;
 paint.putImageData(pixels,0,0);return canvas;
}

export function initializeStreamerMascot(){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 const box=doc.createElement('div');box.id='streamer-mascot';box.setAttribute('aria-hidden','true');
 const canvas=doc.createElement('canvas');canvas.width=280;canvas.height=288;box.append(canvas);
 const caption=doc.createElement('p');caption.className='streamer-quip';caption.hidden=true;box.append(caption);
 const toggle=doc.createElement('button');toggle.id='streamer-mascot-toggle';toggle.type='button';toggle.setAttribute('aria-controls',box.id);
 ctx.stage.append(box,toggle);
 let hidden=false,disposed=false,painter=null,iconAtlas=null,loaded=false,elapsed=0,lastPaint=-Infinity;
 try{hidden=win.localStorage.getItem(STORAGE)==='true';}catch{/* Storage may be disabled. */}
 const track=createReactionTrack(),heads={},quipCounts=new Map();
 let spoken=null,quietFor=0;
 const clearSpeech=()=>{spoken=null;quietFor=0;caption.hidden=true;caption.textContent='';};
 const updateToggle=()=>{
  box.hidden=hidden;toggle.textContent=hidden?'▴':'▾';toggle.setAttribute('aria-expanded',String(!hidden));
  toggle.dataset.hint=hidden?'Показать маскота':'Скрыть маскота';toggle.setAttribute('aria-label',toggle.dataset.hint);
  toggle.classList.toggle('is-collapsed',hidden);
 };
 toggle.onclick=event=>{
  event.stopPropagation();hidden=!hidden;track.reset();clearSpeech();updateToggle();
  try{win.localStorage.setItem(STORAGE,String(hidden));}catch{/* Keep working without persistence. */}
 };
 updateToggle();
 const atlas=new win.Image();
 atlas.onload=()=>{
  if(disposed)return;
  painter=canvas.getContext('2d');if(!painter)return;
  painter.imageSmoothingEnabled=false;
  for(const [name,rect] of Object.entries(HEADS))heads[name]=isolateHead(doc,atlas,rect);
  iconAtlas=isolateHead(doc,atlas,[0,0,atlas.naturalWidth,atlas.naturalHeight],true);
  loaded=true;
 };
 atlas.onerror=()=>{if(!disposed){box.hidden=true;toggle.hidden=true;}};
 atlas.src=assetUrl(ASSETS.textures.streamer);
 const unsubscribe=onGameEvent(event=>{
  if(hidden)return;
  if(quipCategory(event)&&event.type!=='streamer-idle')quietFor=0;
  track.offer(event);
 });
 function drawPart(rect,x,y,w=rect[2],h=rect[3],source=atlas){painter.drawImage(source,...rect,Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
 function arm(rect,pivotX,pivotY,x,y,angle){
  painter.save();painter.translate(pivotX,pivotY);painter.rotate(angle);drawPart(rect,x-pivotX,y-pivotY);painter.restore();
 }
 const sync=(dt,now)=>{
  if(disposed||hidden||doc.hidden||ctx.orientationBlocked||!loaded)return;
  if(now-lastPaint<1000/30-1)return;
  const delta=Number.isFinite(lastPaint)?Math.min((now-lastPaint)/1000,.1):Math.min(dt,.1);lastPaint=now;elapsed+=delta;
  const active=!ctx.paused&&!ctx.settingsOpen&&ctx.startup.phase==='running';
  if(active&&!ctx.combat?.finished){
   quietFor+=delta;
   if(quietFor>=10){track.offer({type:'streamer-idle'});quietFor=0;}
  }
  const reaction=track.tick(delta,active),emotion=reaction?.emotion??'neutral';
  if(reaction!==spoken){
   spoken=reaction;
   if(reaction){
    const category=quipCategory(reaction.event),index=quipCounts.get(category)??0;
    caption.textContent=quipFor(reaction.event,index);quipCounts.set(category,index+1);
   }
   caption.hidden=!reaction||!caption.textContent;
  }
  const energy=reaction?1:.16,t=elapsed;
  const bob=Math.sin(t*(reaction?9:2.7))*(reaction?2:1);
  // The torso ends at y=277; align it with the 288px canvas bottom.
  // Only the head bobs, so the lower edge never floats above the arena.
  painter.clearRect(0,0,canvas.width,canvas.height);painter.save();painter.translate(0,11);
  drawPart([10,377,245,135],12,142);
  // Idle sleeves rest another 12 degrees down; reactions retain their full swings.
  const restAngle=reaction ? .12 : .33;
  // The straight sleeves deliberately rotate as whole pieces around the shoulders.
  arm([0,319,104,58],99,165+SHOULDER_OFFSET_Y,4,140+SHOULDER_OFFSET_Y,-restAngle-energy*(.3+Math.sin(t*11)*.35));
  arm([150,319,105,58],165,165+SHOULDER_OFFSET_Y,157,140+SHOULDER_OFFSET_Y,restAngle+energy*(.3+Math.sin(t*10+.8)*.35));
  painter.save();painter.translate(135,153+HEAD_OFFSET_Y+Math.round(bob));painter.rotate(Math.sin(t*(reaction?6:2))*(reaction?.045:.012));
  const head=heads[emotion];painter.drawImage(head,-83,-149,165,235);painter.restore();
  if(reaction){
   const effects=EFFECTS[emotion]??[];
   for(let i=0;i<effects.length;i++){
    const effect=effects[i],x=i===0?22:222,y=42+HEAD_OFFSET_Y+Math.sin(t*13+i*2)*5;
    painter.save();painter.translate(x+effect[2]/2,y+effect[3]/2);painter.rotate(Math.sin(t*9+i)*.12);
    const pulse=1+Math.sin(t*14+i)*.09;painter.scale(pulse,pulse);
    drawPart(effect,-effect[2]/2,-effect[3]/2,effect[2],effect[3],iconAtlas);painter.restore();
   }
  }
  painter.restore();box.dataset.emotion=emotion;
 };
 const reset=()=>{track.reset();clearSpeech();lastPaint=-Infinity;};
 ctx.streamerMascot={sync,reset};
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  disposed=true;unsubscribe();atlas.onload=atlas.onerror=null;toggle.onclick=null;box.remove();toggle.remove();
  if(ctx.streamerMascot?.sync===sync)ctx.streamerMascot=null;
  dispose();
 };
}
