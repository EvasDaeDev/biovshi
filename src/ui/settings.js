import {loadControlMode,setControlMode} from '../tower/control-mode.js';
import {uiIcon} from './icons.js';
import {ctx} from '../game/state.js';
import {setPaused} from './controls.js';
import {openMenu} from '../tower/ui.js';

export function initializeSettings() {
  const root=ctx.root,doc=root.ownerDocument;
  const panel=root.querySelector('#arena-settings'),button=root.querySelector('#arena-settings-button');
  const launchButton=root.querySelector('#launch-settings-button');
  const buttons=[button,launchButton];
  let opener=button;
  panel.querySelector('#settings-build-version').textContent=typeof __BUILD_VERSION__==='string'?__BUILD_VERSION__:'0.1.0+dev';
  for(const trigger of buttons)trigger.innerHTML=uiIcon('settings');
  const controlMode=root.querySelector('#tower-control-mode');
  ctx.towerControlMode=loadControlMode(winStorage(doc));
  controlMode.value=ctx.towerControlMode;controlMode.disabled=ctx.mode!=='tower';
  controlMode.onchange=()=>{if(ctx.mode==='tower')setControlMode(controlMode.value);};
  const closeButton=panel.querySelector('#arena-settings-close');
  const tutorialButton=panel.querySelector('#tutorial-start');
  const menuButton=panel.querySelector('#settings-main-menu');
  const creditsOpen=panel.querySelector('#arena-credits-open');
  const creditsView=panel.querySelector('#arena-credits-view');
  const creditsBack=panel.querySelector('#arena-credits-back');
  const settingsHeader=panel.querySelector('header');
  const copyright=panel.querySelector('.settings-copyright');
  const settingsMain=[...panel.querySelector('.settings-panel').children].filter(node=>node!==settingsHeader&&node!==creditsView&&node!==copyright);
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
    panel.hidden=true;ctx.settingsOpen=false;for(const trigger of buttons)trigger.setAttribute('aria-expanded','false');
    for(const [node,inert] of background)node.inert=inert;background=[];
    if(restore){setPaused(wasPaused);opener.focus();}
  };
  const open=event=>{
    if(ctx.settingsOpen)return;
    opener=event.currentTarget;
    wasPaused=ctx.paused;
    ctx.settingsOpen=true;setPaused(true);panel.hidden=false;for(const trigger of buttons)trigger.setAttribute('aria-expanded','true');
    background=[root.querySelector('.atmosphere-controls'),root.querySelector('.tag7hop-layout'),root.querySelector('#bet-overlay'),root.querySelector('#launch-overlay'),root.querySelector('#tower-preparation')]
      .map(node=>[node,Boolean(node.inert)]);
    for(const [node] of background)node.inert=true;
    closeButton.focus();
  };
  for(const trigger of buttons)trigger.onclick=open;closeButton.onclick=()=>close();
  tutorialButton.onclick=()=>{close();ctx.tutorial?.restart();};
  menuButton.onclick=()=>{if(openMenu())close(false);};
  panel.onclick=event=>{if(event.target===panel)close();};
  const onKey=event=>{
    if(ctx.tutorial?.active)return;
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
  root.__disposeTag=()=>{close(false);controlMode.onchange=null;panel.hidden=true;tutorialButton.onclick=menuButton.onclick=null;button.onclick=launchButton.onclick=closeButton.onclick=panel.onclick=creditsOpen.onclick=creditsBack.onclick=null;doc.removeEventListener('keydown',onKey);dispose();};
}

function winStorage(doc){try{return doc.defaultView.localStorage;}catch{return null;}}

