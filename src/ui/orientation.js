import { ctx } from '../game/state.js';
import { resetFrameClock } from '../game/clock.js';

export function initializeOrientation() {
  ctx.root.querySelector('#landscape-required')?.remove();
  const overlay=document.createElement('div');
  overlay.id='landscape-required';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-labelledby','landscape-title');
  overlay.innerHTML='<div><h2 id="landscape-title">Поверните устройство</h2><p>Арена работает в горизонтальном положении.</p><button type="button" class="btn">Горизонтальный режим</button></div>';
  ctx.root.appendChild(overlay);
  const win=ctx.root.ownerDocument.defaultView;
  const update=()=>{
    const type=win.screen?.orientation?.type;
    const portrait=type?type.startsWith('portrait'):win.innerHeight>win.innerWidth;
    const blocked=Boolean(ctx.touchDevice&&portrait);
    if(ctx.orientationBlocked!==blocked)resetFrameClock();
    ctx.orientationBlocked=blocked;overlay.hidden=!blocked;
  };
  const lock=async fullscreen=>{
    if(!ctx.touchDevice)return;
    try{
      if(fullscreen&&!document.fullscreenElement)await ctx.root.requestFullscreen?.();
      await win.screen?.orientation?.lock?.('landscape');
    }catch{/* Browsers without orientation locking keep the rotation prompt. */}
    update();
  };
  overlay.querySelector('button').onclick=()=>lock(true);
  const onPointer=()=>lock(false);
  ctx.root.addEventListener('pointerdown',onPointer,{once:true});
  win.addEventListener('resize',update);
  win.screen?.orientation?.addEventListener?.('change',update);
  document.addEventListener('fullscreenchange',update);
  update();
  const dispose=ctx.root.__disposeTag;
  ctx.root.__disposeTag=()=>{
    win.removeEventListener('resize',update);
    win.screen?.orientation?.removeEventListener?.('change',update);
    document.removeEventListener('fullscreenchange',update);
    ctx.root.removeEventListener('pointerdown',onPointer);
    overlay.remove();dispose();
  };
}
