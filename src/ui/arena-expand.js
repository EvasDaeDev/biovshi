import {ctx} from '../game/state.js';
import {fitField} from './controls.js';
import {paintTelemetry} from './paint-telemetry.js';

export function initializeArenaExpand() {
  const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
  const button=root.querySelector('#arena-expand-button');
  let overflow=[],scroll={x:0,y:0};ctx.arenaExpanded=false;
  const updateButton=()=>{
    const label=ctx.arenaExpanded?'Свернуть':'Развернуть';
    button.setAttribute('aria-pressed',String(ctx.arenaExpanded));
    button.setAttribute('aria-label',label);button.title=label;
  };
  const restoreOverflow=()=>{
    for(const [node,value,priority] of overflow){
      if(value)node.style.setProperty('overflow',value,priority);else node.style.removeProperty('overflow');
    }
    overflow=[];
  };
  const setExpanded=expanded=>{
    if(ctx.settingsOpen||ctx.arenaExpanded===expanded)return;
    ctx.arenaExpanded=expanded;root.classList.toggle('arena-expanded',expanded);
    if(expanded){
      scroll={x:win.scrollX,y:win.scrollY};
      overflow=[doc.documentElement,doc.body].map(node=>[node,node.style.getPropertyValue('overflow'),node.style.getPropertyPriority('overflow')]);
      for(const [node] of overflow)node.style.overflow='hidden';
    }else restoreOverflow();
    updateButton();fitField();
    if(!expanded){
      ctx.telemetryDirty=true;paintTelemetry();
      if(scroll.x||scroll.y)win.scrollTo(scroll.x,scroll.y);
    }
    // Reproject the last pose immediately, including when the fight is paused.
    // No simulation step, time-scale change or second ticker is needed.
    ctx.arenaRenderer?.render();
  };
  button.onclick=event=>{event.stopPropagation();setExpanded(!ctx.arenaExpanded);};
  ctx.setArenaExpanded=setExpanded;
  const onKey=event=>{
    if(event.key==='Escape'&&!event.defaultPrevented&&!ctx.settingsOpen&&ctx.arenaExpanded){
      event.preventDefault();setExpanded(false);button.focus();
    }
  };
  doc.addEventListener('keydown',onKey);updateButton();
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{
    if(ctx.setArenaExpanded===setExpanded)ctx.setArenaExpanded=null;
    restoreOverflow();ctx.arenaExpanded=false;root.classList.remove('arena-expanded');updateButton();
    button.onclick=null;doc.removeEventListener('keydown',onKey);dispose();
  };
}
