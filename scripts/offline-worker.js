// The build prepends the version and integrity inventory.
const scope=self.registration.scope;
const cachePrefix='biovshi-offline:'+scope+':';
const cacheName=cachePrefix+OFFLINE_VERSION;
const entry=new URL('index.html',scope).href;
const files=new Map(OFFLINE_FILES.map(([path,hash])=>[new URL(path,scope).href,hash]));

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
      client.postMessage({type:'biovshi-offline-progress',scope,done,total:files.size});
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
    await caches.delete(cacheName);
    throw failure;
  }
}

self.addEventListener('install',event=>event.waitUntil(installOfflineGame()));
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    // A new version waits until tabs of the previous version are closed.
    for(const name of await caches.keys()){
      if(name.startsWith(cachePrefix)&&name!==cacheName)await caches.delete(name);
    }
    await self.clients.claim();
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
  }else if(!files.has(url.href))return;
  event.respondWith((async()=>{
    const cached=await (await caches.open(cacheName)).match(navigation?entry:url.href);
    return cached??fetch(request);
  })());
});
