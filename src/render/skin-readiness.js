// A partially loaded atlas must never conceal the complete fallback body.
// Used by surgically modified Tower rigs, which may have extra SVG cells.
export function createSkinReadiness(keys,onReady,onFailure){
 const waiting=new Set(keys),failures=new Set();
 return {
  loaded(key){
   if(!waiting.has(key))return;
   waiting.delete(key);
   if(!waiting.size&&!failures.size)onReady();
  },
  failed(key){
   if(!waiting.has(key))return;
   waiting.delete(key);failures.add(key);onFailure();
  },
  get pending(){return waiting.size;},
  get failedCount(){return failures.size;}
 };
}
