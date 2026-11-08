import {ctx} from '../game/state.js';
import {setPaused} from './controls.js';

export function initializeSettings() {
  const root=ctx.root,doc=root.ownerDocument;
  const panel=root.querySelector('#arena-settings'),button=root.querySelector('#arena-settings-button');
  const closeButton=panel.querySelector('#arena-settings-close');
  let wasPaused=false,background=[];
  const close=(restore=true)=>{
    if(!ctx.settingsOpen)return;
    panel.hidden=true;ctx.settingsOpen=false;button.setAttribute('aria-expanded','false');
    for(const [node,inert] of background)node.inert=inert;background=[];
    if(restore){setPaused(wasPaused);button.focus();}
  };
  const open=()=>{
    if(ctx.settingsOpen)return;
    wasPaused=ctx.paused;
    ctx.settingsOpen=true;setPaused(true);panel.hidden=false;button.setAttribute('aria-expanded','true');
    background=[root.querySelector('.atmosphere-controls'),root.querySelector('.tag7hop-layout'),root.querySelector('#bet-overlay')]
      .map(node=>[node,Boolean(node.inert)]);
    for(const [node] of background)node.inert=true;
    closeButton.focus();
  };
  button.onclick=open;closeButton.onclick=()=>close();
  panel.onclick=event=>{if(event.target===panel)close();};
  const onKey=event=>{
    if(!ctx.settingsOpen)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key==='Tab'){
      const nodes=[...panel.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(node=>!node.disabled&&!node.hidden&&!(node.closest('details')?.open===false&&node.tagName!=='SUMMARY'));
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
    }
  };
  doc.addEventListener('keydown',onKey);
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{close(false);panel.hidden=true;button.onclick=closeButton.onclick=panel.onclick=null;doc.removeEventListener('keydown',onKey);dispose();};
}
