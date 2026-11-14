import {ctx} from '../game/state.js';
import {setPaused} from './controls.js';
import {TUTORIAL_CHAPTERS} from './tutorial-content.js';
import {freshTutorial,readTutorial,writeTutorial,tutorialChapter,tutorialPlacement} from './tutorial-model.js';

export function initializeTutorial(){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 let storage;try{storage=win.localStorage;}catch{/* Memory-only mode. */}
 let state=root.__tutorialProgress??readTutorial(storage),chapter=null,index=0,wasPaused=false,previous=null,expanded=false,disposed=false,confirming=false,layoutFrame=0;
 root.__tutorialProgress=state;
 const dialog=doc.createElement('dialog');dialog.id='game-tutorial';dialog.hidden=true;
 dialog.setAttribute('aria-labelledby','tutorial-title');dialog.setAttribute('aria-describedby','tutorial-text');
 dialog.innerHTML=`<div class="tutorial-spotlight" aria-hidden="true"></div>
  <svg class="tutorial-pointer" aria-hidden="true"><defs><marker id="tutorial-arrowhead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs><path class="tutorial-arrow" marker-end="url(#tutorial-arrowhead)"/></svg>
  <span class="tutorial-pause" hidden>БОЙ НА ПАУЗЕ</span>
  <div class="tutorial-group"><canvas class="tutorial-mascot" width="280" height="288" aria-hidden="true"></canvas>
  <section class="tutorial-bubble"><p class="tutorial-progress"></p><h2 id="tutorial-title"></h2><p id="tutorial-text"></p>
  <div class="tutorial-actions"><button type="button" data-tutorial-back>Назад</button><button type="button" data-tutorial-next>Далее →</button></div>
  <button type="button" class="tutorial-skip">Пропустить обучение</button></section></div>`;
 doc.body.append(dialog);
 const group=dialog.querySelector('.tutorial-group'),spot=dialog.querySelector('.tutorial-spotlight'),arrow=dialog.querySelector('.tutorial-arrow');
 const progress=dialog.querySelector('.tutorial-progress'),title=dialog.querySelector('h2'),text=dialog.querySelector('#tutorial-text');
 const back=dialog.querySelector('[data-tutorial-back]'),next=dialog.querySelector('[data-tutorial-next]'),skip=dialog.querySelector('.tutorial-skip');
 let target=null;
 const save=()=>{root.__tutorialProgress=state;writeTutorial(storage,state);};
 const resolve=value=>typeof value==='function'?value(ctx):value;
 const visibleRect=node=>{
  if(!node||node.closest('[hidden]'))return null;
  const r=node.getBoundingClientRect();
  return r.width>0&&r.height>0?r:null;
 };
 const viewport=()=>({x:win.visualViewport?.offsetLeft??0,y:win.visualViewport?.offsetTop??0,width:win.visualViewport?.width??win.innerWidth,height:win.visualViewport?.height??win.innerHeight});
 function layout(){
  layoutFrame=0;if(!api.active||disposed)return;
  const view=viewport(),arena=TUTORIAL_CHAPTERS[chapter].arena;
  let bounds=view;
  if(arena){
   const r=visibleRect(ctx.stage);
   if(r){const x=Math.max(view.x,r.left),y=Math.max(view.y,r.top);bounds={x,y,width:Math.max(1,Math.min(view.x+view.width,r.right)-x),height:Math.max(1,Math.min(view.y+view.height,r.bottom)-y)};}
  }
  const pause=dialog.querySelector('.tutorial-pause');
  pause.style.left=bounds.x+bounds.width/2+'px';pause.style.top=bounds.y+10+'px';
  // Keep readable text in screen pixels; do not inherit interface zoom.
  group.style.width=Math.min(view.height<440?500:610,Math.max(1,bounds.width-20))+'px';
  group.style.maxHeight=Math.max(1,bounds.height-20)+'px';
  const rect=visibleRect(target),fallback={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,width:0,height:0};
  const clipped=rect?{x:Math.max(view.x,rect.left),y:Math.max(view.y,rect.top),width:Math.max(0,Math.min(view.x+view.width,rect.right)-Math.max(view.x,rect.left)),height:Math.max(0,Math.min(view.y+view.height,rect.bottom)-Math.max(view.y,rect.top))}:fallback;
  const obstacles=['#tower-stick','#combat-log'].map(s=>visibleRect(root.querySelector(s))).filter(Boolean).map(r=>({x:r.left,y:r.top,width:r.width,height:r.height}));
  const size=group.getBoundingClientRect();
  const box=tutorialPlacement(bounds,size,clipped,obstacles);
  group.dataset.corner=box.corner;group.style.left=box.x+'px';group.style.top=box.y+'px';
  spot.hidden=!rect||!clipped.width||!clipped.height;
  if(!spot.hidden){
   Object.assign(spot.style,{left:clipped.x-4+'px',top:clipped.y-4+'px',width:clipped.width+8+'px',height:clipped.height+8+'px'});
   const tx=clipped.x+clipped.width/2,ty=clipped.y+clipped.height/2;
   const dx=box.x+box.width/2-tx,dy=box.y+box.height/2-ty;
   const scale=1/Math.max(Math.abs(dx)/(clipped.width/2+14),Math.abs(dy)/(clipped.height/2+14),.001);
   const length=Math.hypot(dx,dy)||1,ux=dx/length,uy=dy/length;
   const ex=tx+dx*scale,ey=ty+dy*scale;
   arrow.setAttribute('d',`M ${ex+ux*42} ${ey+uy*42} L ${ex} ${ey}`);
  }else arrow.removeAttribute('d');
  dialog.classList.toggle('tutorial-no-target',spot.hidden);
 }
 const scheduleLayout=()=>{if(!layoutFrame&&!disposed)layoutFrame=win.requestAnimationFrame(layout);};
 const resize=new (win.ResizeObserver??globalThis.ResizeObserver)(scheduleLayout);
 resize.observe(group);
 function renderStep(){
  const data=TUTORIAL_CHAPTERS[chapter],step=data.steps[index];
  confirming=false;skip.hidden=false;back.disabled=index===0;
  progress.textContent=`${data.name} · ${index+1} / ${data.steps.length}`;
  title.textContent=step.title;text.textContent=resolve(step.text);
  back.textContent='Назад';next.textContent=index===data.steps.length-1?'Понятно':'Далее →';
  api.emotion=step.emotion??'neutral';root.classList.toggle('tutorial-echo',Boolean(step.echo));
  if(target)resize.unobserve?.(target);
  target=root.querySelector(resolve(step.target));
  if(target){
   // The game sheet itself owns scrolling. Never scroll the entire game root.
   const panel=target.closest('.bet-panel,.launch-paper,.gladiator-results-card');
   const tr=target.getBoundingClientRect(),pr=panel?.getBoundingClientRect();
   if(pr&&(tr.top<pr.top||tr.bottom>pr.bottom))target.scrollIntoView?.({block:'nearest',inline:'nearest',behavior:'instant'});
   resize.observe(target);
  }
  state.steps[chapter]=index;save();layout();next.focus({preventScroll:true});
 }
 function hide(){
  if(!api.active)return;
  api.active=false;confirming=false;
  if(target)resize.unobserve?.(target);target=null;
  if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}
  dialog.hidden=true;root.classList.remove('tutorial-active','tutorial-echo');
  // These are tutorial-owned changes; do not overwrite a new screen's pause.
  const same=tutorialChapter(ctx,{ignoreBlocked:true})===chapter;
  if(same&&!ctx.settingsOpen)setPaused(wasPaused);
  if(expanded&&same)ctx.setArenaExpanded?.(true);expanded=false;
  if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus({preventScroll:true});
  chapter=null;
 }
 function show(id){
  chapter=id;index=Math.min(state.steps[id]??0,TUTORIAL_CHAPTERS[id].steps.length-1);
  wasPaused=ctx.paused;previous=doc.activeElement;api.active=true;
  expanded=Boolean(TUTORIAL_CHAPTERS[id].arena&&ctx.arenaExpanded);
  if(expanded)ctx.setArenaExpanded?.(false);
  setPaused(true);root.classList.add('tutorial-active');
  dialog.querySelector('.tutorial-pause').hidden=!TUTORIAL_CHAPTERS[id].arena;
  dialog.hidden=false;
  if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');
  renderStep();
 }
 function askSkip(){
  if(confirming)return;confirming=true;
  title.textContent='Пропустить обучение?';
  text.textContent='Его можно снова включить в настройках → «Режим обучения».';
  back.disabled=false;back.textContent='Продолжить обучение';next.textContent='Пропустить';skip.hidden=true;
  layout();back.focus({preventScroll:true});
 }
 back.onclick=()=>{if(confirming)renderStep();else if(index>0){index--;renderStep();}};
 next.onclick=()=>{
  if(confirming){state.enabled=false;save();hide();return;}
  if(index+1<TUTORIAL_CHAPTERS[chapter].steps.length){index++;renderStep();}
  else{if(!state.completed.includes(chapter))state.completed.push(chapter);delete state.steps[chapter];save();hide();}
 };
 skip.onclick=askSkip;dialog.addEventListener('cancel',event=>{event.preventDefault();if(confirming)renderStep();else askSkip();});
 // Let the native dialog own focus. Escape always offers a reversible skip.
 const key=event=>{if(api.active&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(confirming)renderStep();else askSkip();}};
 doc.addEventListener('keydown',key,true);
 const api={active:false,canvas:dialog.querySelector('canvas'),emotion:'neutral',
  sync(){
   if(disposed)return;
   const id=tutorialChapter(ctx);
   if(api.active&&id!==chapter)hide();
   if(!api.active&&id&&state.enabled&&!state.completed.includes(id))show(id);
  },
  restart({newGame=false}={}){
   hide();state=freshTutorial();if(newGame)state.completed.push('setup');save();
   // New-game callers still have the setup form mounted until they navigate.
   if(!newGame)api.sync();
  }
 };
 ctx.tutorial=api;
 win.addEventListener('resize',scheduleLayout);win.addEventListener('scroll',scheduleLayout,true);
 win.visualViewport?.addEventListener('resize',scheduleLayout);win.visualViewport?.addEventListener('scroll',scheduleLayout);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  hide();disposed=true;resize.disconnect();if(layoutFrame)win.cancelAnimationFrame(layoutFrame);
  doc.removeEventListener('keydown',key,true);win.removeEventListener('resize',scheduleLayout);win.removeEventListener('scroll',scheduleLayout,true);
  win.visualViewport?.removeEventListener('resize',scheduleLayout);win.visualViewport?.removeEventListener('scroll',scheduleLayout);
  dialog.remove();if(ctx.tutorial===api)ctx.tutorial=null;dispose();
 };
 return api;
}
