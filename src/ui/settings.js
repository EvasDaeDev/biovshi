import {ctx} from '../game/state.js';
import {setPaused} from './controls.js';

export function initializeSettings() {
  const root=ctx.root,doc=root.ownerDocument;
  const panel=root.querySelector('#arena-settings'),button=root.querySelector('#arena-settings-button');
  const closeButton=panel.querySelector('#arena-settings-close');
  const creditsOpen=panel.querySelector('#arena-credits-open');
  const creditsView=panel.querySelector('#arena-credits-view');
  const creditsBack=panel.querySelector('#arena-credits-back');
  const settingsHeader=panel.querySelector('header');
  const settingsMain=[...panel.children].filter(node=>node!==settingsHeader&&node!==creditsView);
  const showCredits=visible=>{
    creditsView.hidden=!visible;
    for(const node of settingsMain)node.hidden=visible;
    settingsHeader.querySelector('h2').textContent=visible?'Архив':'Настройки';
    creditsOpen.setAttribute('aria-expanded',String(visible));
    (visible?creditsBack:creditsOpen).focus();
  };
  creditsOpen.onclick=()=>showCredits(true);
  creditsBack.onclick=()=>showCredits(false);
  let wasPaused=false,background=[];
  const close=(restore=true)=>{
    if(!ctx.settingsOpen)return;
    if(!creditsView.hidden)showCredits(false);
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
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!creditsView.hidden)showCredits(false);else close();return;}
    if(event.key==='Tab'){
      const nodes=[...panel.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(node=>!node.disabled&&!node.hidden&&!node.closest('[hidden]')&&!(node.closest('details')?.open===false&&node.tagName!=='SUMMARY'));
      const first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&doc.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&doc.activeElement===last){event.preventDefault();first?.focus();}
    }
  };
  doc.addEventListener('keydown',onKey);
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{close(false);panel.hidden=true;button.onclick=closeButton.onclick=panel.onclick=creditsOpen.onclick=creditsBack.onclick=null;doc.removeEventListener('keydown',onKey);dispose();};
}
