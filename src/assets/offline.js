function waitForActivation(worker){
  if(!worker)throw new Error('Offline worker did not start');
  return new Promise((resolve,reject)=>{
    const check=()=>{
      if(worker.state==='activated'||worker.state==='redundant'){
        worker.removeEventListener('statechange',check);
        if(worker.state==='activated')resolve();
        else reject(new Error('Offline installation did not complete'));
      }
    };
    worker.addEventListener('statechange',check);
    check();
  });
}

export async function prepareOfflineGame(win,{onProgress}={}){
  const serviceWorker=win.navigator.serviceWorker;
  if(!serviceWorker||!win.isSecureContext)return false;
  const scope=new URL('./',win.document.baseURI);

  function progress(event){
    const data=event.data;
    if(data?.type==='biovshi-offline-progress'&&data.scope===scope.href)
      onProgress?.(data.done,data.total);
  }

  serviceWorker.addEventListener('message',progress);
  try{
    const existing=await serviceWorker.getRegistration(scope.href);
    if(existing?.scope===scope.href&&existing.active){
      // Updates download in the background. An installed release boots without network.
      await waitForActivation(existing.active);
      existing.update().catch(()=>{});
      return true;
    }
    const registration=await serviceWorker.register(new URL('offline-worker.js',scope),{updateViaCache:'none'});
    await waitForActivation(registration.active??registration.installing??registration.waiting);
    return true;
  }catch(error){
    if(error.name==='SecurityError'||error.name==='NotAllowedError')return false;
    throw error;
  }finally{serviceWorker.removeEventListener('message',progress);}
}
