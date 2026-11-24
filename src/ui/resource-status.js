import {markResource,subscribeResources,trackResource} from '../assets/resource-status.js';

export function installResourceStatus(doc){
 const win=doc.defaultView;
 const banner=doc.createElement('div');
 banner.id='resource-status';
 banner.setAttribute('role','status');
 banner.hidden=true;
 doc.body.append(banner);
 let delay;
 const unsubscribe=subscribeResources(({pending,missing})=>{
  if(pending){
   if(delay===undefined&&banner.textContent!=='…идёт загрузка ресурсов'){
    delay=win.setTimeout(()=>{
     delay=undefined;
     banner.textContent='…идёт загрузка ресурсов';
     banner.hidden=false;
    },180);
   }
   return;
  }
  win.clearTimeout(delay);
  delay=undefined;
  banner.textContent=missing.length?(missing.every(key=>key==='offline-copy')
   ?'Автономная копия загружена не полностью':'Часть ресурсов не загрузилась'):'';
  banner.hidden=!missing.length;
 });

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
  trackResource(url,()=>image.decode()).then(()=>{
   checked.set(url,true);
  },()=>{
   // A replaced or detached element can reject a decode even for a good URL.
   checked.delete(url);
   if(!image.isConnected||image.src!==url)markResource(url,true);
  });
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
  if(data?.type!=='biovshi-offline-progress'||data.scope!==scope)return;
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
