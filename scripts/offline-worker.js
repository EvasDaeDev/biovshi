// The build prepends the version and integrity inventory.
const scope=self.registration.scope;
const cachePrefix='biovshi-offline:'+scope+':';
const cacheName=cachePrefix+OFFLINE_VERSION;
const clientCacheName=cachePrefix+'clients';
const entry=new URL('index.html',scope).href;
const files=new Map(OFFLINE_FILES.map(([path,hash])=>[new URL(path,scope).href,hash]));
const clientKey=id=>new URL('__offline_client__/'+encodeURIComponent(id),scope).href;

async function fetchAsset(url,hash){
  for(const retry of [false,true]){
    const source=new URL(url);
    if(retry)source.searchParams.set('offline',OFFLINE_VERSION);
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),90000);
    try{
      const response=await fetch(source,{cache:retry?'reload':'default',signal:controller.signal});
      if(!response.ok||response.status!==200||response.redirected)throw Error('HTTP '+response.status);
      const bytes=await response.clone().arrayBuffer();
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
        value=>value.toString(16).padStart(2,'0')).join('');
      if(digest!==hash)throw Error('File differs from the published build');
      return response;
    }catch(error){
      if(retry)throw new Error(new URL(url).pathname+': '+error.message);
    }finally{clearTimeout(timeout);}
  }
}

async function installOfflineGame(){
  const cache=await caches.open(cacheName);
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const queue=[...files];
  let done=0,failure;
  function report(){
    for(const client of clients)if(client.url.startsWith(scope))
      client.postMessage({type:'biovshi-offline-progress',scope,done,total:files.size,failed:Boolean(failure)});
  }
  report();
  await Promise.all(Array.from({length:6},async()=>{
    while(queue.length&&!failure){
      const [url,hash]=queue.shift();
      try{
        if(!await cache.match(url))await cache.put(url,await fetchAsset(url,hash));
        done++;
        report();
      }catch(error){failure=error;}
    }
  }));
  if(failure){
    report();
    await caches.delete(cacheName);
    throw failure;
  }
}

self.addEventListener('install',event=>event.waitUntil((async()=>{
  await installOfflineGame();
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const ready=(client,update)=>{
      if(client.url.startsWith(scope))client.postMessage({type:'biovshi-offline-ready',scope,update});
    };
    const older=(await caches.keys()).filter(name=>name.startsWith(cachePrefix)&&name!==cacheName&&name!==clientCacheName);
    if(older.length){
      // The previously active release is the last installed cache before ours.
      // Already controlled tabs keep that release (or their existing pin).
      const clients=await self.clients.matchAll({type:'window'});
      const pins=await caches.open(clientCacheName);
      const retained=new Set(),live=new Set();
      for(const client of clients){
        const key=clientKey(client.id);
        live.add(key);
        const saved=await (await pins.match(key))?.text();
        const version=older.includes(saved)?saved:older.at(-1);
        retained.add(version);
        if(saved!==version)await pins.put(key,new Response(version));
      }
      for(const request of await pins.keys())if(!live.has(request.url))await pins.delete(request);
      for(const name of older)if(!retained.has(name))await caches.delete(name);
      for(const client of clients)ready(client,true);
    }else{
      await self.clients.claim();
      const clients=await self.clients.matchAll({type:'window'});
      for(const client of clients)ready(client,false);
    }
  })());
});
self.addEventListener('fetch',event=>{
  const {request}=event;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  const navigation=request.mode==='navigate';
  if(navigation){
    url.search='';url.hash='';
    if(url.href!==scope&&url.href!==entry)return;
  }else if(!files.has(url.href)&&(!event.clientId||!url.href.startsWith(scope)))return;
  event.respondWith((async()=>{
    let version=cacheName;
    if(!navigation&&event.clientId){
      const pin=await caches.match(clientKey(event.clientId),{cacheName:clientCacheName});
      if(pin)version=await pin.text();
    }
    const cache=await caches.open(version);
    const key=navigation?entry:url.href;
    const cached=await cache.match(key);
    if(cached)return cached;
    const hash=version===cacheName&&files.get(key);
    if(!hash)return fetch(request);
    const response=await fetchAsset(key,hash);
    try{await cache.put(key,response.clone());}catch{/* The response is usable even if storage is full. */}
    return response;
  })());
});
