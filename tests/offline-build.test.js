import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {writeOfflineWorker} from '../scripts/offline-build.mjs';
import {prepareOfflineGame} from '../src/assets/offline.js';

const scope='https://game.test/biovshi/';
const assets={
 'index.html':'<script src="assets/game.js"></script>',
 'assets/game.js':'boot()',
 'assets/pixi.js':'export {}',
 'assets/atlas.png':'atlas bytes',
 'assets/sound.ogg':'audio bytes',
 'locations/active.json':'{"active":["ward"]}',
 'locations/ward.json':'{"id":"ward"}',
};
async function workerFixture({release=assets,stores=new Map(),openTabs=[]}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'biovshi-offline-'));
 try{
  await Promise.all(Object.entries(release).map(async([file,content])=>{
   const output=path.join(directory,file);
   await fs.mkdir(path.dirname(output),{recursive:true});
   await fs.writeFile(output,content);
  }));
  await writeOfflineWorker(directory,Object.keys(release));
  const code=await fs.readFile(path.join(directory,'offline-worker.js'),'utf8');
  const listeners=new Map(),requested=[],progress=[],ready=[];
  let network=true,corrupt=null,claimed=false,skippedWaiting=false;
  const caches={
   async keys(){return [...stores.keys()];},
   async delete(key){return stores.delete(key);},
   async match(url,{cacheName}){return stores.get(cacheName)?.get(url)?.clone();},
   async open(key){
    if(!stores.has(key))stores.set(key,new Map());
    const store=stores.get(key);
    return {
     async match(url){return store.get(url)?.clone();},
     async put(url,response){store.set(url,response);},
     async keys(){return [...store.keys()].map(url=>({url}));},
     async delete(request){return store.delete(request.url);},
    };
   },
  };
  vm.runInNewContext(code,{
   URL,Response,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:webcrypto,caches,
   fetch:async url=>{
    if(!network)throw Error('Offline');
    const address=new URL(url);
    const file=address.pathname.slice(new URL(scope).pathname.length);
    requested.push(file);
    return new Response(file===corrupt?'incorrect bytes':release[file],{status:Object.hasOwn(release,file)?200:404});
   },
   self:{
    registration:{scope},
    addEventListener:(name,fn)=>listeners.set(name,fn),
    skipWaiting:async()=>{skippedWaiting=true;},
    clients:{matchAll:async options=>options.includeUncontrolled?[{url:scope,postMessage:data=>progress.push(data)}]:openTabs.map(client=>({url:scope,postMessage:data=>ready.push(data),...client})),
     claim:async()=>{claimed=true;}},
   },
  });
  return {
   caches,requested,progress,ready,get claimed(){return claimed;},get skippedWaiting(){return skippedWaiting;},
   disconnect(){network=false;},corrupt(file){corrupt=file;},
   lifecycle(type){let result;listeners.get(type)({waitUntil(promise){result=promise;}});return result;},
   request(file,mode='same-origin',clientId=''){
    let response;
    listeners.get('fetch')({clientId,request:{url:new URL(file,scope).href,method:'GET',mode},respondWith(promise){response=promise;}});
    return response;
   },
  };
 }finally{await fs.rm(directory,{recursive:true,force:true});}
}

test('an installed web build serves the entire verified release without a network',async()=>{
 const w=await workerFixture();
 const preview='biovshi-offline:'+scope+'test/:older';
 await w.caches.open(preview);
 await w.lifecycle('install');
 assert.equal(w.claimed,false);
 assert.equal(w.skippedWaiting,true);
 assert.equal(w.progress.at(-1).done,Object.keys(assets).length);
 assert.deepEqual([...w.requested].sort(),Object.keys(assets).sort());
 await w.lifecycle('activate');
 assert.equal(w.claimed,true);
 assert.ok((await w.caches.keys()).includes(preview));

 w.disconnect();
 assert.equal(await (await w.request('?renderer=svg','navigate')).text(),assets['index.html']);
 assert.equal(await (await w.request('index.html','navigate')).text(),assets['index.html']);
 for(const [file,content] of Object.entries(assets))
  assert.equal(await (await w.request(file)).text(),content);
 assert.equal(w.request('test/','navigate'),undefined,'the stable worker does not serve the test channel');
 assert.equal(w.request('../other-app/','navigate'),undefined);
 assert.equal(w.request('assets/source.psd'),undefined);
});

test('a requested file evicted from the current cache is verified and stored again',async()=>{
 const worker=await workerFixture();
 await worker.lifecycle('install');
 await worker.lifecycle('activate');
 const [name]=await worker.caches.keys();
 const cache=await worker.caches.open(name);
 const url=new URL('assets/atlas.png',scope).href;
 await cache.delete({url});
 assert.equal(await (await worker.request('assets/atlas.png')).text(),assets['assets/atlas.png']);
 worker.disconnect();
 assert.equal(await (await worker.request('assets/atlas.png')).text(),assets['assets/atlas.png']);
});

test('regular reloads use the new release while already open tabs keep their own verified assets',async()=>{
 const stores=new Map();
 const previous=await workerFixture({stores});
 await previous.lifecycle('install');
 await previous.lifecycle('activate');
 const firstCache=(await previous.caches.keys())[0];
 const secondRelease={...assets,'index.html':'<script src="assets/game-v2.js"></script>','assets/game-v2.js':'bootV2()',
  'assets/atlas.png':'second atlas'};
 delete secondRelease['assets/game.js'];
 const next=await workerFixture({release:secondRelease,stores,openTabs:[{id:'old-tab'}]});
 await next.lifecycle('install');
 assert.equal(next.skippedWaiting,true,'activation does not require the last tab to close');
 assert.deepEqual(next.ready,[],'cache completion alone does not announce an update');
 await next.lifecycle('activate');
 assert.equal(next.ready.length,1);
 assert.equal(next.ready[0].type,'biovshi-offline-ready');
 assert.equal(next.ready[0].update,true);
 next.disconnect();
 assert.equal(await (await next.request('', 'navigate')).text(),secondRelease['index.html']);
 assert.equal(await (await next.request('index.html','navigate')).text(),secondRelease['index.html']);
 assert.equal(await (await next.request('assets/game.js','same-origin','old-tab')).text(),assets['assets/game.js']);
 assert.equal(await (await next.request('assets/atlas.png','same-origin','old-tab')).text(),assets['assets/atlas.png']);
 assert.equal(await (await next.request('assets/atlas.png','same-origin','reloaded-tab')).text(),secondRelease['assets/atlas.png']);

 const third=await workerFixture({release:{...secondRelease,'assets/atlas.png':'third atlas'},stores,openTabs:[{id:'reloaded-tab'}]});
 await third.lifecycle('install');
 await third.lifecycle('activate');
 assert.ok(!(await third.caches.keys()).includes(firstCache),'closed tabs no longer retain their release');
 assert.equal(await (await third.request('assets/atlas.png','same-origin','reloaded-tab')).text(),secondRelease['assets/atlas.png']);
});

test('a mixed release retries the mismatched file and never activates a partial cache',async()=>{
 const w=await workerFixture();
 await w.caches.open('biovshi-offline:'+scope+':previous');
 w.corrupt('assets/atlas.png');
 await assert.rejects(w.lifecycle('install'),/File differs from the published build/);
 assert.equal(w.requested.filter(file=>file==='assets/atlas.png').length,2);
 assert.equal(w.claimed,false);
 assert.equal(w.skippedWaiting,false);
 assert.deepEqual(await w.caches.keys(),['biovshi-offline:'+scope+':previous']);
});

test('first startup waits for activation and a later offline boot does not await updates',async()=>{
 const worker=new EventTarget();
 worker.state='installing';
 const sw=new EventTarget();
 const progress=[];
 let registration,resolveRegister,updates=0;
 sw.getRegistration=async()=>registration;
 sw.register=async url=>{
  assert.equal(url.href,scope+'offline-worker.js');
  resolveRegister();
  return {installing:worker};
 };
 const enteredRegister=new Promise(resolve=>{resolveRegister=resolve;});
 const win={navigator:{serviceWorker:sw},isSecureContext:true,document:{baseURI:scope}};
 let ready=false;
 const loading=prepareOfflineGame(win,{onProgress:(...values)=>progress.push(values)}).then(result=>{ready=result;});
 await enteredRegister;
 sw.dispatchEvent(new MessageEvent('message',{data:{type:'biovshi-offline-progress',scope,done:3,total:7}}));
 assert.deepEqual(progress,[[3,7]]);
 assert.equal(ready,false);
 worker.state='activated';
 worker.dispatchEvent(new Event('statechange'));
 await loading;
 assert.equal(ready,true);
 registration={scope,active:worker,async update(){updates++;throw Error('Offline');}};
 assert.equal(await prepareOfflineGame(win),true);
 assert.equal(updates,1);
});
