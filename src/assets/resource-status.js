const pending=new Map();
const missing=new Set();
const listeners=new Set();

export function resourceStatus(){
 return {pending:pending.size,missing:[...missing]};
}
function notify(){
 for(const listener of listeners)listener(resourceStatus());
}
export function subscribeResources(listener){
 listeners.add(listener);
 listener(resourceStatus());
 return ()=>listeners.delete(listener);
}
const resourceKey=key=>/^\.\//.test(key)&&globalThis.document?.baseURI?new URL(key,document.baseURI).href:key;
export function markResource(key,available){
 key=resourceKey(key);
 const changed=available?missing.delete(key):!missing.has(key);
 if(!available)missing.add(key);
 if(changed)notify();
}
export function trackResource(key,operation,{ignoreFailure}={}){
 key=resourceKey(key);
 pending.set(key,(pending.get(key)??0)+1);
 notify();
 function finish(available){
  const count=pending.get(key);
  if(count===1)pending.delete(key);
  else pending.set(key,count-1);
  if(available)missing.delete(key);
  else if(!ignoreFailure?.())missing.add(key);
  notify();
 }
 return new Promise(resolve=>resolve(operation())).then(value=>{
  finish(true);
  return value;
 },error=>{
  finish(false);
  throw error;
 });
}
