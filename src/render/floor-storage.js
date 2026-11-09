// Safari can leave IDB open/transactions pending. Every operation has a deadline.
export function accessFloorStore(key,value,{indexedDB=globalThis.indexedDB,timeoutMs=1500}={}){
  return new Promise((resolve,reject)=>{
    if(!indexedDB){reject(Error('IndexedDB unavailable'));return;}
    let db,tx,done=false;
    const finish=(error,result)=>{
      if(done)return;done=true;clearTimeout(timer);
      if(error&&tx){try{tx.abort();}catch{}}
      db?.close();error?reject(error):resolve(result);
    };
    const timer=setTimeout(()=>finish(Error('Floor storage timed out')),timeoutMs);
    let request;
    try{request=indexedDB.open('biovshi.floor-history',1);}catch(error){finish(error);return;}
    request.onblocked=()=>finish(Error('Floor storage blocked'));
    request.onerror=()=>finish(request.error??Error('Floor storage unavailable'));
    request.onupgradeneeded=()=>{
      if(done){request.transaction?.abort();return;}
      if(!request.result.objectStoreNames.contains('floors'))request.result.createObjectStore('floors');
    };
    request.onsuccess=()=>{
      db=request.result;db.onversionchange=()=>db.close();if(done){db.close();return;}
      try{
        tx=db.transaction('floors',value===undefined?'readonly':'readwrite');
        const store=tx.objectStore('floors'),operation=value===undefined?store.get(key):store.put(value,key);
        tx.oncomplete=()=>finish(null,operation.result);
        tx.onerror=tx.onabort=()=>finish(tx.error??Error('Floor storage failed'));
      }catch(error){finish(error);}
    };
  });
}
export function floorBlob(canvas,{timeoutMs=1500}={}){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Floor encoding timed out')),timeoutMs);
    try{canvas.toBlob(blob=>{clearTimeout(timer);blob?resolve(blob):reject(Error('Floor encoding failed'));},'image/png');}
    catch(error){clearTimeout(timer);reject(error);}
  });
}
