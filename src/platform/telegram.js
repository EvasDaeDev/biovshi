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
export function telegramInsets(app,system={}){
  const area=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,
    Math.max(inset(app?.safeAreaInset?.[side]),inset(system[side]))+inset(app?.contentSafeAreaInset?.[side])]));
  // Some mobile clients report zero content insets even though the fullscreen
  // Close/menu capsules are drawn over the web view. Reserve one control row
  // until a nonzero native content inset arrives; never do this on Desktop.
  if(app?.isFullscreen&&['ios','android'].includes(app.platform)&&!inset(app.contentSafeAreaInset?.top)){
    area.top=Math.max(area.top,Math.max(inset(app.safeAreaInset?.top),inset(system.top))+56);
  }
  return area;
}

export function initializeTelegram(onLayoutChange){
  const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
  let app=null,disposed=false,pageHidden=false,readyRequested=false,fullscreenRequested=false,orientationRequested=false,lastGesture=-Infinity;
  let fullscreenConfirmed=null,fullscreenError=null,fullscreenAttempts=0,readyRetry=0;
  let backAvailable=false;
  const subscriptions=[];
  const launched=()=>Boolean(app||doc.documentElement.classList.contains('telegram-launch'));
  // Read device insets outside the scaled game in both Safari and WKWebView.
  // Telegram may also report the same device insets through its SDK.
  const safeProbe=doc.createElement('div');
  safeProbe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;box-sizing:content-box;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  safeProbe.setAttribute('aria-hidden','true');doc.body.append(safeProbe);
  const edges=()=>{
    const style=win.getComputedStyle(safeProbe);
    const system=Object.fromEntries(['top','right','bottom','left'].map(side=>[side,parseFloat(style.getPropertyValue('padding-'+side))||0]));
    return telegramInsets({platform:app?.platform,isFullscreen:fullscreenConfirmed??app?.isFullscreen,safeAreaInset:app?.safeAreaInset,contentSafeAreaInset:app?.contentSafeAreaInset},system);
  };
  const invoke=(method,version,...args)=>{
    if(!supportsTelegram(app,version)||typeof app?.[method]!=='function')return false;
    try{const result=app[method](...args);result?.catch?.(()=>{});return true;}catch{return false;}
  };
  const activity=()=>{
    const inactive=Boolean(doc.hidden||pageHidden||(supportsTelegram(app,'8.0')&&app.isActive===false));
    resetFrameClock();
    ctx.appInactive=inactive;
    if(!inactive)invoke('disableVerticalSwipes','7.7');
    ctx.clearTowerInput?.();
    ctx.audio?.sync();
  };
  const layout=()=>{
    if(disposed)return;
    if(launched())for(const [side,value] of Object.entries(edges()))doc.documentElement.style.setProperty('--telegram-inset-'+side,value+'px');
    onLayoutChange();
    ctx.updateOrientation?.();
    win.dispatchEvent(new win.Event('telegram-viewport-change'));
  };
  const fullscreen=(gesture=false)=>{
    // SDK isFullscreen can be restored from sessionStorage before the native
    // window has entered fullscreen. Only a fresh native response is proof.
    if(fullscreenConfirmed===true)return;
    // A sent request is not an acknowledgement. In particular, iOS can ignore
    // the initial request without sending fullscreenFailed. Retry on a real
    // gesture, synchronously, and throttle to avoid pointerdown + keydown bursts.
    if(gesture){
      const now=win.performance.now();if(now-lastGesture<1000)return;
      lastGesture=now;
    }else if(fullscreenRequested)return;
    fullscreenRequested=invoke('requestFullscreen','8.0');
    if(fullscreenRequested)fullscreenAttempts++;
  };
  const gesture=()=>{invoke('disableVerticalSwipes','7.7');fullscreen(true);};
  const colors=()=>{
    invoke('setHeaderColor','6.1','#02050d');
    invoke('setBackgroundColor','6.1','#02050d');
    invoke('setBottomBarColor','7.10','#02050d');
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
    for(const event of ['safeAreaChanged','contentSafeAreaChanged'])subscribe(event,layout);
    subscribe('fullscreenChanged',()=>{fullscreenConfirmed=Boolean(app.isFullscreen);fullscreenError=null;fullscreenRequested=fullscreenConfirmed;invoke('disableVerticalSwipes','7.7');layout();});
    subscribe('fullscreenFailed',event=>{
      fullscreenError=event?.error??'UNKNOWN';
      if(fullscreenError==='ALREADY_FULLSCREEN'){fullscreenConfirmed=true;fullscreenRequested=true;}
      else{fullscreenConfirmed=false;fullscreenRequested=false;lastGesture=-Infinity;}
      layout();
    });
    subscribe('backButtonClicked',()=>root.dispatchEvent(new win.Event('telegram-game-back')),'6.1');
    subscribe('themeChanged',colors,'6.0');
    colors();
    invoke('expand','6.0');invoke('disableVerticalSwipes','7.7');
    activity();layout();
    if(backAvailable)app.BackButton?.show?.();
    if(readyRequested)invoke('ready','6.0');
    fullscreen();
  };
  const api={
    get isTelegram(){return launched();},
    setBackAvailable(visible){
      backAvailable=Boolean(visible);
      if(!app||!supportsTelegram(app,'6.1'))return;
      try{if(backAvailable)app.BackButton?.show?.();else app.BackButton?.hide?.();}catch{}
    },
    ready(){
      readyRequested=true;invoke('ready','6.0');fullscreenRequested=false;fullscreen();
      win.clearTimeout(readyRetry);readyRetry=win.setTimeout(()=>{if(!disposed&&fullscreenConfirmed!==true){fullscreenRequested=false;fullscreen();}},700);
    },
    enterFullscreen(){if(!app)win.__loadTelegramSDK?.();fullscreenConfirmed=null;fullscreenRequested=false;lastGesture=-Infinity;fullscreen(true);},
    diagnostics(){
      const style=win.getComputedStyle(doc.body),rect=root.getBoundingClientRect();
      return {build:typeof __BUILD_VERSION__==='string'?__BUILD_VERSION__:'dev',source:typeof __BUILD_SOURCE__==='string'?__BUILD_SOURCE__:'dev',platform:app?.platform??'SDK unavailable',api:app?.version??null,
        sdk:{...win.__telegramSDK,available:Boolean(win.Telegram?.WebApp),rawPlatform:win.Telegram?.WebApp?.platform??null,rawApi:win.Telegram?.WebApp?.version??null},
        fullscreen:{reported:app?.isFullscreen??null,confirmed:fullscreenConfirmed,error:fullscreenError,attempts:fullscreenAttempts},
        window:{width:win.innerWidth,height:win.innerHeight},visual:win.visualViewport?{width:win.visualViewport.width,height:win.visualViewport.height,top:win.visualViewport.offsetTop,left:win.visualViewport.offsetLeft}:null,
        telegramViewport:{current:app?.viewportHeight??null,stable:app?.viewportStableHeight??null},safe:app?.safeAreaInset??null,contentSafe:app?.contentSafeAreaInset??null,effective:edges(),
        padding:{top:style.paddingTop,right:style.paddingRight,bottom:style.paddingBottom,left:style.paddingLeft},game:{left:rect.left,top:rect.top,width:rect.width,height:rect.height,scale:ctx.layoutScale}};
    },
    lockLandscape(size){
      // Telegram locks the CURRENT orientation; it cannot turn a portrait screen.
      if(!app||size.width<=size.height||win.screen?.orientation?.type?.startsWith('portrait'))return;
      if(app.isOrientationLocked||orientationRequested)return;
      orientationRequested=invoke('lockOrientation','8.0');
    },
    rawViewport(size){
      // After native fullscreen acknowledgement the real WebView dimensions
      // are authoritative; stableHeight can still contain the old sheet height.
      if(fullscreenConfirmed===true)return size;
      return app?.viewportStableHeight>0?{...size,height:Math.min(size.height,app.viewportStableHeight)}:size;
    },
    viewport(size){
      const area=edges();
      return {...size,width:Math.max(1,size.width-area.left-area.right),height:Math.max(1,size.height-area.top-area.bottom),...area};
    },
    contentViewport(view){
      const area=edges();
      if(!launched()&&Object.values(area).every(value=>value===0))return view;
      const right=Math.min(view.x+view.width,win.innerWidth-area.right);
      const visibleHeight=fullscreenConfirmed===true?win.innerHeight:app?.viewportHeight>0?Math.min(win.innerHeight,app.viewportHeight):app?.viewportStableHeight>0?Math.min(win.innerHeight,app.viewportStableHeight):win.innerHeight;
      const bottom=Math.min(view.y+view.height,visibleHeight-area.bottom);
      const x=Math.max(view.x,area.left),y=Math.max(view.y,area.top);
      return {x,y,width:Math.max(1,right-x),height:Math.max(1,bottom-y)};
    },
  };
  ctx.platform=api;
  const hide=()=>{pageHidden=true;activity();},show=()=>{pageHidden=false;activity();layout();};
  doc.addEventListener('visibilitychange',activity);win.addEventListener('pagehide',hide);win.addEventListener('pageshow',show);
  win.addEventListener('telegram-sdk-ready',connect);root.addEventListener('pointerdown',gesture);root.addEventListener('keydown',gesture);
  win.addEventListener('resize',layout);win.screen?.orientation?.addEventListener?.('change',layout);
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{
    disposed=true;
    win.clearTimeout(readyRetry);
    try{app?.BackButton?.hide?.();}catch{}
    for(const [owner,event,handler] of subscriptions){try{owner.offEvent?.(event,handler);}catch{}}
    doc.removeEventListener('visibilitychange',activity);win.removeEventListener('pagehide',hide);win.removeEventListener('pageshow',show);
    win.removeEventListener('telegram-sdk-ready',connect);root.removeEventListener('pointerdown',gesture);root.removeEventListener('keydown',gesture);
    win.removeEventListener('resize',layout);win.screen?.orientation?.removeEventListener?.('change',layout);
    safeProbe.remove();
    doc.documentElement.classList.remove('telegram-app');
    for(const side of ['top','right','bottom','left'])doc.documentElement.style.removeProperty('--telegram-inset-'+side);
    if(ctx.platform===api)ctx.platform=null;
    ctx.appInactive=false;dispose();
  };
  activity();connect();if(!app)layout();
  return api;
}
