import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {resetRound} from '../src/game/session.js';
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://floor.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 initializeGame();document.querySelector('#bet-setup-form').dispatchEvent(new Event('submit',{cancelable:true}));
 ctx.combat.finished=true;ctx.combat.winner=0;
 return dom;
}
test('next round opens the garage while IndexedDB is pending, without PNG data URLs in the Pixi path',async()=>{
 const dom=setup();let encoded=0,installed=0,request;
 const context={drawImage(){},getImageData(){return {data:new Uint8ClampedArray([10,20,30,255])};},putImageData(){}};
 dom.window.HTMLCanvasElement.prototype.getContext=()=>context;
 dom.window.HTMLCanvasElement.prototype.toBlob=callback=>{encoded++;callback(new Blob(['floor']));};
 dom.window.HTMLCanvasElement.prototype.toDataURL=()=>{throw Error('Synchronous PNG encoding should not run');};
 ctx.floorCanvas=document.createElement('canvas');ctx.floorImage=null;
 ctx.arenaRenderer={rasterizeRemains:()=>document.createElement('canvas'),replaceFloor(){installed++;},render(){}};
 globalThis.indexedDB={open(){request={};return request;}};
 await resetRound();assert.equal(ctx.startup.phase,'garage');assert.equal(ctx.floorBaking,false);assert.equal(ctx.resultsAgain.disabled,false);assert.equal(installed,1);
 await Promise.resolve();assert.equal(encoded,1);assert.ok(request);request.onblocked();await ctx.floorSavePromise;assert.equal(ctx.floorStorageAvailable,false);
 ctx.arenaRenderer=null;ctx.floorCanvas=null;delete globalThis.indexedDB;ctx.root.__disposeTag();dom.window.close();
});
test('a failed floor capture preserves the prior floor and does not trap the player on results',async()=>{
 const dom=setup(),previous={};ctx.floorCanvas=previous;
 ctx.arenaRenderer={rasterizeRemains(){throw Error('Readback unavailable');},render(){}};
 const warn=console.warn;console.warn=()=>{};
 try{await resetRound();}finally{console.warn=warn;}
 assert.equal(ctx.startup.phase,'garage');assert.equal(ctx.floorCanvas,previous);assert.match(ctx.lastFloorBakeError,/Предыдущий пол сохранён/);assert.equal(ctx.floorBaking,false);
 ctx.arenaRenderer=null;ctx.floorCanvas=null;ctx.root.__disposeTag();dom.window.close();
});
