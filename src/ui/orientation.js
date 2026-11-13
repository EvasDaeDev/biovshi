import {ctx} from '../game/state.js';
import {resetFrameClock} from '../game/clock.js';

export function initializeOrientation(){
  const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
  root.querySelector('#landscape-required')?.remove();
  const overlay=doc.createElement('dialog');
  overlay.id='landscape-required';overlay.hidden=true;
  overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-labelledby','landscape-title');
  overlay.innerHTML='<div><h2 id="landscape-title">Поверните устройство</h2><p>Арена работает в горизонтальном положении.</p><button type="button" class="btn">Проверить ориентацию</button></div>';
  root.append(overlay);
  let previous=null;
  const update=()=>{
    // Window dimensions also cover tablet split view. Screen orientation alone
    // can stay landscape while the browser's actual viewport is portrait.
    const blocked=Boolean(ctx.touchDevice&&win.innerHeight>win.innerWidth);
    if(ctx.orientationBlocked!==blocked){resetFrameClock();ctx.clearTowerInput?.();}
    ctx.orientationBlocked=blocked;
    if(blocked){
      if(overlay.hidden)previous=doc.activeElement;
      overlay.hidden=false;
      // A modal dialog is above launch sheets AND other already open dialogs.
      if(!overlay.open){
        if(typeof overlay.showModal==='function')overlay.showModal();
        else overlay.setAttribute('open','');
        overlay.querySelector('button').focus();
      }
    }else{
      if(overlay.open){if(typeof overlay.close==='function')overlay.close();else overlay.removeAttribute('open');}
      overlay.hidden=true;
      if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus();
      previous=null;
    }
  };
  const guard=event=>{
    if(!ctx.orientationBlocked)return;
    if(overlay.contains(event.target)){if(event.type==='keydown')event.stopImmediatePropagation();return;}
    event.preventDefault();event.stopImmediatePropagation();
    if(event.type==='focusin')overlay.querySelector('button').focus();
  };
  const events=['click','pointerdown','pointerup','keydown','submit','focusin'];
  for(const type of events)doc.addEventListener(type,guard,true);
  overlay.addEventListener('cancel',event=>event.preventDefault());
  overlay.querySelector('button').onclick=update;
  const observer=new win.MutationObserver(records=>{
    // If an asynchronous action opens another native dialog, promote the guard
    // again so that no game form becomes interactive above it.
    if(ctx.orientationBlocked&&records.some(r=>r.target!==overlay&&r.target.tagName==='DIALOG'&&r.target.open)){
      if(overlay.open&&typeof overlay.close==='function')overlay.close();
      else overlay.removeAttribute('open');
      update();
    }
  });
  observer.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
  win.addEventListener('resize',update);win.screen?.orientation?.addEventListener?.('change',update);
  update();
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{
    observer.disconnect();win.removeEventListener('resize',update);win.screen?.orientation?.removeEventListener?.('change',update);
    for(const type of events)doc.removeEventListener(type,guard,true);
    if(overlay.open&&typeof overlay.close==='function')overlay.close();
    overlay.remove();ctx.orientationBlocked=false;dispose();
  };
}
