import {initializeFloor} from './render/floor-history.js';
import {garageOpen} from './garage/ui.js';
import {preparePatientPortraits} from './ui/patient-portrait.js';
import {paintTelemetry} from './ui/paint-telemetry.js';
import {initializeGame} from './game/initialize.js';
import {ctx} from './game/state.js';
import {createAudio} from './audio/audio.js';
import {applyTextures} from './render/textures.js';
import {initializePixiArena} from './render/pixi-scene.js';
import {initializeDiagnostics} from './render/diagnostics.js';
import {preloadTextures} from './assets/preload.js';
import {bettingLoad,bettingSave} from './betting/storage.js';
import {startSpawnSequence} from './game/session.js';
let cancelled=false;
async function prepare({textures,session,entry='auto',arenaId='ward'}){
 initializeGame({textures,session,entry,arenaId});
 await applyTextures();if(cancelled||ctx.disposed)return;
 await preparePatientPortraits();if(cancelled||ctx.disposed)return;
 paintTelemetry();await initializeFloor();await initializePixiArena();
 if(cancelled||ctx.disposed)return;
 if(ctx.startup.phase==='garage')garageOpen();
 initializeDiagnostics();
 const audio=createAudio(),dispose=ctx.root.__disposeTag;
 ctx.root.__disposeTag=()=>{audio.dispose();dispose();};
 if(ctx.startup.phase==='demo')startSpawnSequence();
}
async function boot(){
 const root=document.getElementById('robot-tag-hops-v22');
 let loading=document.getElementById('texture-loading');
 if(!loading){loading=document.createElement('div');loading.id='texture-loading';loading.textContent='Подготовка арены…';loading.setAttribute('role','status');document.body.prepend(loading);}
 root.inert=true;const textures=await preloadTextures();if(cancelled)return;
 ctx.BET_STORAGE='biovshi.local-totalizator.v1';const session=bettingLoad();
 ctx.switchArena=async arenaId=>{
   if(arenaId===ctx.arenaId)return;
   const session=ctx.betting;session.arenaId=arenaId;bettingSave();root.inert=true;
   const progress=document.createElement('div');progress.id='texture-loading';progress.textContent='Подготовка арены…';progress.setAttribute('role','status');document.body.prepend(progress);
   try{await prepare({textures,session,entry:'betting',arenaId});}finally{root.inert=false;progress.remove();}
 };
 await prepare({textures,session,arenaId:session?.arenaId??'ward'});
 if(cancelled||ctx.disposed)return;root.inert=false;loading.remove();
}
boot().catch(error=>{
 console.error('Game startup:',error);
 const loading=document.getElementById('texture-loading');if(loading)loading.textContent='Не удалось подготовить арену. Обновите страницу.';
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
