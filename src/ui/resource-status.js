import {markResource,resourceStatus,subscribeResources,trackResource} from '../assets/resource-status.js';

export function installResourceStatus(doc){
 const win=doc.defaultView;
 const banner=doc.createElement('div');
 banner.id='resource-status';
 banner.setAttribute('role','status');
 banner.hidden=true;
 doc.body.append(banner);
 let delay,showLoading=false,reloadRecommended=false,previousMissing=[];
 const loadingText='…идёт загрузка ресурсов';
 const reloadText='Обновление загружено, рекомендуется перезагрузить игру';
 const render=({pending,missing}=resourceStatus())=>{
  if(previousMissing.some(key=>key!=='offline-copy'&&!missing.includes(key)))reloadRecommended=true;
  previousMissing=missing;
  if(pending){
   if(!showLoading&&delay===undefined){
    delay=win.setTimeout(()=>{
     delay=undefined;
     showLoading=true;
     render();
    },180);
   }
   if(!showLoading)return;
  }else{
   win.clearTimeout(delay);
   delay=undefined;
   showLoading=false;
  }
  const recommend=!pending&&reloadRecommended;
  const text=pending?loadingText:recommend?reloadText:missing.length?(missing.every(key=>key==='offline-copy')
   ?'Автономная копия загружена не полностью':'Часть ресурсов не загрузилась'):'';
  banner.classList.toggle('resource-reload-recommended',recommend);
  if(banner.textContent!==text)banner.textContent=text;
  banner.hidden=!text;
 };
 const unsubscribe=subscribeResources(render);

 const checked=new Map();
 const inspect=image=>{
  const url=image.src;
  if(!url||/^(data:|blob:)/i.test(url)||typeof image.decode!=='function')return;
  if(checked.get(url)===true)return;
  if(image.complete&&image.naturalWidth){
   checked.set(url,true);
   markResource(url,true);
   return;
  }
  if(checked.has(url))return;
  checked.set(url,false);
  // Replacing or detaching the element can reject a decode for a valid file.
  trackResource(url,()=>image.decode(),{ignoreFailure:()=>!image.isConnected||image.src!==url}).then(()=>{
   checked.set(url,true);
  },()=>checked.delete(url));
 };
 const visit=node=>{
  if(node.namespaceURI!=='http://www.w3.org/1999/xhtml')return;
  if(node.tagName==='IMG')inspect(node);
  else node.querySelectorAll('img[src]').forEach(inspect);
 };
 const observer=new win.MutationObserver(records=>{
  for(const record of records){
   if(record.type==='attributes'){
    if(record.target.tagName==='IMG')inspect(record.target);
   }else record.addedNodes.forEach(visit);
  }
 });
 doc.querySelectorAll('img[src]').forEach(inspect);
 observer.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});

 const svgResult=event=>{
  const image=event.target;
  if(image.namespaceURI!=='http://www.w3.org/2000/svg'||image.localName!=='image')return;
  const href=image.getAttribute('href');
  if(href&&!/^(data:|blob:)/i.test(href))markResource(new URL(href,doc.baseURI).href,event.type==='load');
 };
 doc.addEventListener('load',svgResult,true);
 doc.addEventListener('error',svgResult,true);

 const fonts=doc.fonts;
 let fontsLoaded,offlineUpdated;
 const loadingFonts=()=>{
  if(fontsLoaded)return;
  trackResource('fonts',()=>new Promise(resolve=>{fontsLoaded=resolve;}));
 };
 const finishedFonts=()=>{
  fontsLoaded?.();fontsLoaded=undefined;
  if(fonts)markResource('font-files',![...fonts].some(font=>font.status==='error'));
 };
 const failedFonts=()=>markResource('font-files',false);
 fonts?.addEventListener('loading',loadingFonts);
 fonts?.addEventListener('loadingdone',finishedFonts);
 fonts?.addEventListener('loadingerror',failedFonts);
 if(fonts?.status==='loading')loadingFonts();

 const serviceWorker=win.navigator.serviceWorker;
 const scope=new URL('./',doc.baseURI).href;
 const progress=({data})=>{
  if(data?.scope!==scope)return;
  if(data.type==='biovshi-offline-ready'){
   if(data.update||resourceStatus().missing.some(key=>key!=='offline-copy'))reloadRecommended=true;
   render();
   return;
  }
  if(data.type!=='biovshi-offline-progress')return;
  if(data.done>=data.total||data.failed){offlineUpdated?.();offlineUpdated=undefined;}
  else if(!offlineUpdated)trackResource('offline-update',()=>new Promise(resolve=>{offlineUpdated=resolve;}));
 };
 serviceWorker?.addEventListener('message',progress);
 return ()=>{
  unsubscribe();
  observer.disconnect();
  doc.removeEventListener('load',svgResult,true);
  doc.removeEventListener('error',svgResult,true);
  win.clearTimeout(delay);
  fonts?.removeEventListener('loading',loadingFonts);
  fonts?.removeEventListener('loadingdone',finishedFonts);
  fonts?.removeEventListener('loadingerror',failedFonts);
  serviceWorker?.removeEventListener('message',progress);
  finishedFonts();offlineUpdated?.();
  banner.remove();
 };
}
