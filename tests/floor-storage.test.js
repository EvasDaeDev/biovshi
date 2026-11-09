import test from 'node:test';
import assert from 'node:assert/strict';
import {accessFloorStore,floorBlob} from '../src/render/floor-storage.js';

test('unresponsive or blocked IndexedDB rejects within a deadline and closes a late connection',async()=>{
 const request={};let closed=0;
 await assert.rejects(accessFloorStore('round',undefined,{indexedDB:{open:()=>request},timeoutMs:5}),/timed out/);
 request.result={close(){closed++;}};request.onsuccess();assert.equal(closed,1);
 const blocked={};const promise=accessFloorStore('round',undefined,{indexedDB:{open:()=>blocked},timeoutMs:20});blocked.onblocked();await assert.rejects(promise,/blocked/);
});
test('stalled transactions are aborted; completed Blob writes close their database',async()=>{
 let closed=0,aborted=0,tx,stored;
 const idb={open(){const req={};queueMicrotask(()=>{req.result={close(){closed++;},transaction(){tx={objectStore(){return {put(value){stored=value;return {result:'round'};}};},abort(){aborted++;}};return tx;}};req.onsuccess();});return req;}};
 await assert.rejects(accessFloorStore('round',new Blob(['floor']),{indexedDB:idb,timeoutMs:5}),/timed out/);assert.equal(aborted,1);assert.equal(closed,1);
 const promise=accessFloorStore('round',new Blob(['new']),{indexedDB:idb,timeoutMs:30});await Promise.resolve();tx.oncomplete();await promise;assert.equal(closed,2);assert.equal(await stored.text(),'new');
});
test('PNG encoding times out or rejects instead of preventing the next round',async()=>{
 await assert.rejects(floorBlob({toBlob(){}},{timeoutMs:5}),/timed out/);
 await assert.rejects(floorBlob({toBlob(callback){callback(null);}},{timeoutMs:5}),/failed/);
 const blob=new Blob(['pixels']);assert.equal(await floorBlob({toBlob(callback){callback(blob);}}),blob);
});
