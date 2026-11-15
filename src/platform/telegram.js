import {ctx} from '../game/state.js';
import {resetFrameClock} from '../game/clock.js';

// Loading the SDK alone also creates WebApp in a regular browser. It is not
// evidence of a Telegram launch and must never change the browser layout.
export function telegramWebApp(win){
  const app=win?.Telegram?.WebApp;
  return app&&app.platform&&app.platform!=='unknown'&&typeof app.onEvent==='function'?app:null;
}
export function supportsTelegram(app,version){
  if(!app)return false;
  try{
    if(typeof app.isVersionAtLeast==='function')return app.isVersionAtLeast(version);
    const current=String(app.version??'0').split('.').map(Number),required=version.split('.').map(Number);
    for(let i=0;i<required.length;i++){
      if((current[i]??0)!==required[i])return (current[i]??0)>required[i];
    }
    return true;
  }catch{return false;}
}
const inset=value=>Number.isFinite(value)&&value>0?value:0;
export function telegramInsets(app){
  return Object.fromEntries(['top','right','bottom','left'].map(side=>[side,
    inset(app?.safeAreaInset?.[side])+inset(app?.contentSafeAreaInset?.[side])]));
}

export function initializeTelegram(onLayoutChange){
  const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
  let app=null,disposed=false,pageHidden=false,readyRequested=false,fullscreenRequested=false,orientationRequested=false;
  const subscriptions=[];
  const invoke=(method,version,...args)=>{
    if(!supportsTelegram(app,version)||typeof app?.[method]!=='function')return false;
    try{const result=app[method](...args);result?.catch?.(()=>{});return true;}catch{return false;}
  };
  const activity=()=>{
    const inactive=Boolean(doc.hidden||pageHidden||(supportsTelegram(app,'8.0')&&app.isActive===false));
    resetFrameClock();
    ctx.appInactive=inactive;
    ctx.clearTowerInput?.();
    ctx.audio?.sync();
  };
  const layout=()=>{
    if(disposed)return;
    const edges=telegramInsets(app);
    for(const [side,value] of Object.entries(edges))doc.documentElement.style.setProperty('--telegram-inset-'+side,value+'px');
    onLayoutChange();
    ctx.updateOrientation?.();
    win.dispatchEvent(new win.Event('telegram-viewport-change'));
  };
  const fullscreen=()=>{
    if(app?.isFullscreen||fullscreenRequested)return;
    fullscreenRequested=invoke('requestFullscreen','8.0');
  };
  const subscribe=(event,handler,version='8.0')=>{
    if(!supportsTelegram(app,version)||typeof app.offEvent!=='function')return;
    try{app.onEvent(event,handler);subscriptions.push([app,event,handler]);}catch{/* Older clients may reject new events. */}
  };
  const connect=()=>{
    if(disposed||app)return;
    app=telegramWebApp(win);if(!app)return;
    doc.documentElement.classList.add('telegram-app');
    subscribe('activated',activity);subscribe('deactivated',activity);
    subscribe('viewportChanged',layout,'6.0');
    for(const event of ['safeAreaChanged','contentSafeAreaChanged','fullscreenChanged'])subscribe(event,layout);
    subscribe('fullscreenFailed',()=>{fullscreenRequested=false;layout();});
    invoke('expand','6.0');invoke('disableVerticalSwipes','7.7');
    activity();layout();fullscreen();
    if(readyRequested)invoke('ready','6.0');
  };
  const api={
    get isTelegram(){return Boolean(app);},
    ready(){readyRequested=true;invoke('ready','6.0');},
    lockLandscape(size){
      // Telegram locks the CURRENT orientation; it cannot turn a portrait screen.
      if(!app||size.width<=size.height||win.screen?.orientation?.type?.startsWith('portrait'))return;
      if(app.isOrientationLocked||orientationRequested)return;
      orientationRequested=invoke('lockOrientation','8.0');
    },
    rawViewport(size){
      return app?.viewportStableHeight>0?{...size,height:Math.min(size.height,app.viewportStableHeight)}:size;
    },
    viewport(size){
      if(!app)return size;
      const edges=telegramInsets(app);
      return {...size,width:Math.max(1,size.width-edges.left-edges.right),height:Math.max(1,size.height-edges.top-edges.bottom),...edges};
    },
    contentViewport(view){
      if(!app)return view;
      const edges=telegramInsets(app),right=Math.min(view.x+view.width,win.innerWidth-edges.right);
      const visibleHeight=app.viewportHeight>0?Math.min(win.innerHeight,app.viewportHeight):app.viewportStableHeight>0?Math.min(win.innerHeight,app.viewportStableHeight):win.innerHeight;
      const bottom=Math.min(view.y+view.height,visibleHeight-edges.bottom);
      const x=Math.max(view.x,edges.left),y=Math.max(view.y,edges.top);
      return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
    },
  };
  ctx.platform=api;
  const hide=()=>{pageHidden=true;activity();},show=()=>{pageHidden=false;activity();layout();};
  doc.addEventListener('visibilitychange',activity);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
  win.addEventListener('telegram-sdk-ready',connect);root.addEventListener('pointerdown',fullscreen);root.addEventListener('keydown',fullscreen);
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{
    disposed=true;
    for(const [owner,event,handler] of subscriptions){try{owner.offEvent?.(event,handler);}catch{}}
    doc.removeEventListener('visibilitychange',activity);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);
    win.removeEventListener('telegram-sdk-ready',connect);root.removeEventListener('pointerdown',fullscreen);root.removeEventListener('keydown',fullscreen);
    doc.documentElement.classList.remove('telegram-app');
    for(const side of ['top','right','bottom','left'])doc.documentElement.style.removeProperty('--telegram-inset-'+side);
    if(ctx.platform===api)ctx.platform=null;
    ctx.appInactive=false;dispose();
  };
  activity();connect();
  return api;
}
