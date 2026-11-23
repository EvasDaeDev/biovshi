import {loadControlMode,setControlMode} from '../tower/control-mode.js';
import {uiIcon} from './icons.js';
import {ctx} from '../game/state.js';
import {setPaused} from './controls.js';
import {openMenu} from '../tower/ui.js';

export function initializeSettings() {
  const root=ctx.root,doc=root.ownerDocument;
  const panel=root.querySelector('#arena-settings'),button=root.querySelector('#arena-settings-button');
  const launchButton=root.querySelector('#launch-settings-button');
  const towerButton=root.querySelector('#tower-prep-settings');
  const globalButton=root.querySelector('#game-nav-settings');
  const buttons=[button,launchButton,towerButton,globalButton].filter(Boolean);
  let opener=button;
  panel.querySelector('#settings-build-version').textContent=typeof __BUILD_VERSION__==='string'?__BUILD_VERSION__:'0.9.0+dev';
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
  const telegram=doc.createElement('details');telegram.className='telegram-diagnostics';
  telegram.innerHTML='<summary>Telegram: экран и отступы</summary><button type="button" data-telegram-fullscreen>На весь экран</button><button type="button" data-telegram-copy>Скопировать диагностику</button><pre></pre>';
  copyright.before(telegram);
  const diagnosticText=telegram.querySelector('pre'),fullButton=telegram.querySelector('[data-telegram-fullscreen]'),copyButton=telegram.querySelector('[data-telegram-copy]');
  const refreshTelegram=()=>{
    telegram.hidden=!ctx.platform?.isTelegram||!creditsView.hidden;
    if(!telegram.hidden&&telegram.open)diagnosticText.textContent=JSON.stringify(ctx.platform?.diagnostics?.()??{},null,2);
  };
  fullButton.onclick=()=>{ctx.platform?.enterFullscreen?.();refreshTelegram();};
  copyButton.onclick=async()=>{
    refreshTelegram();
    try{await doc.defaultView.navigator.clipboard.writeText(diagnosticText.textContent);copyButton.textContent='Скопировано';}
    catch{copyButton.textContent='Выделите текст ниже';const selection=doc.defaultView.getSelection(),range=doc.createRange();range.selectNodeContents(diagnosticText);selection.removeAllRanges();selection.addRange(range);}
  };
  telegram.ontoggle=refreshTelegram;
  doc.defaultView.addEventListener('telegram-viewport-change',refreshTelegram);
  doc.defaultView.addEventListener('telegram-sdk-ready',refreshTelegram);
  doc.defaultView.addEventListener('telegram-sdk-error',refreshTelegram);
  refreshTelegram();
  const settingsMain=[...panel.querySelector('.settings-panel').children].filter(node=>node!==settingsHeader&&node!==creditsView&&node!==copyright);
  const showCredits=visible=>{
    creditsView.hidden=!visible;
    for(const node of settingsMain)node.hidden=visible;
    refreshTelegram();
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
    const resume=ctx.afterSettingsClose;ctx.afterSettingsClose=null;
    if(restore){setPaused(wasPaused);opener.focus();resume?.();}
  };
  const open=event=>{
    if(ctx.settingsOpen)return;
    opener=event.currentTarget;
    wasPaused=ctx.paused;
    ctx.settingsOpen=true;setPaused(true);panel.hidden=false;for(const trigger of buttons)trigger.setAttribute('aria-expanded','true');
    background=[...root.querySelectorAll('.atmosphere-controls,.tag7hop-layout,#bet-overlay,#launch-overlay,#tower-preparation,#gladiator-results')]
      .map(node=>[node,Boolean(node.inert)]);
    for(const [node] of background)node.inert=true;
    closeButton.focus();
    refreshTelegram();
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
  root.__disposeTag=()=>{close(false);ctx.afterSettingsClose=null;telegram.ontoggle=fullButton.onclick=copyButton.onclick=null;telegram.remove();doc.defaultView.removeEventListener('telegram-viewport-change',refreshTelegram);doc.defaultView.removeEventListener('telegram-sdk-ready',refreshTelegram);doc.defaultView.removeEventListener('telegram-sdk-error',refreshTelegram);controlMode.onchange=null;panel.hidden=true;tutorialButton.onclick=menuButton.onclick=null;for(const trigger of buttons)trigger.onclick=null;closeButton.onclick=panel.onclick=creditsOpen.onclick=creditsBack.onclick=null;doc.removeEventListener('keydown',onKey);dispose();};
}

function winStorage(doc){try{return doc.defaultView.localStorage;}catch{return null;}}

