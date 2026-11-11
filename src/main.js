import {randomArenaId} from './game/arenas.js';
import {installTowerUI,openMenu} from './tower/ui.js';
import {towerFor} from './tower/model.js';
import {bettingSetup,bettingCancel} from './betting/ui.js';
import {initializeFloor} from './render/floor-history.js';
import {initializeModalFocus} from './ui/modal-focus.js';
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
// Only a full page load requires the explicit sound/simulation gesture.
let launchAccepted=false;
async function prepare({textures,session,entry='auto',arenaId='ward',tower=null}){
 initializeGame({textures,session,entry,arenaId,tower});
 await applyTextures();if(cancelled||ctx.disposed)return;
 await preparePatientPortraits();if(cancelled||ctx.disposed)return;
 paintTelemetry();await initializeFloor();await initializePixiArena();
 if(cancelled||ctx.disposed)return;
 if(ctx.startup.phase==='garage')garageOpen();
 initializeDiagnostics();
 const audio=createAudio();ctx.audio=audio;
 const dispose=ctx.root.__disposeTag;
 ctx.root.__disposeTag=()=>{audio.dispose();if(ctx.audio===audio)ctx.audio=null;dispose();};
 const gate=ctx.root.querySelector('#launch-overlay');
 const launchButton=ctx.root.querySelector('#launch-game');
 gate.hidden=launchAccepted;
 installTowerUI();
 initializeModalFocus();
 launchButton.onclick=()=>{
   if(launchAccepted){ctx.audio?.unlock();ctx.startDemo();return;}
   // AudioContext.resume() must happen synchronously in this user gesture.
   audio.unlock();
   launchAccepted=true;
   gate.hidden=true;
   if(ctx.startup.phase==='demo')startSpawnSequence();else if(ctx.startup.phase==='running'){ctx.paused=false;}
 };
 ctx.root.querySelector('#launch-setup').onclick=()=>{audio.unlock();launchAccepted=true;ctx.startSetup();};
 if(launchAccepted&&ctx.startup.phase==='demo')startSpawnSequence();
}
async function boot(){
 const root=document.getElementById('robot-tag-hops-v22');
 let loading=document.getElementById('texture-loading');
 if(!loading){loading=document.createElement('div');loading.id='texture-loading';loading.textContent='Подготовка арены…';loading.setAttribute('role','status');document.body.prepend(loading);}
 root.inert=true;const textures=await preloadTextures();if(cancelled)return;
 ctx.BET_STORAGE='biovshi.local-totalizator.v1';const session=bettingLoad();
 ctx.switchArena=async arenaId=>{
   if(arenaId===ctx.arenaId)return;
   const session=ctx.betting,expanded=ctx.arenaExpanded;
   session.arenaId=arenaId;bettingSave();root.inert=true;
   const progress=document.createElement('div');progress.id='texture-loading';progress.textContent='Подготовка арены…';progress.setAttribute('role','status');document.body.prepend(progress);
   ctx.keepArenaRenderer=true;
   try{await prepare({textures,session,entry:'betting',arenaId});ctx.setArenaExpanded?.(expanded);}
   finally{ctx.keepArenaRenderer=false;root.inert=false;progress.remove();}
 };
 const transition=async options=>{
   root.inert=true;ctx.audio?.unlock();launchAccepted=true;ctx.keepArenaRenderer=true;
   try{await prepare({textures,...options});}finally{ctx.keepArenaRenderer=false;root.inert=false;}
 };
 ctx.openMainMenu=openMenu;
 ctx.startTower=async player=>{
   const current=ctx.betting;bettingCancel();ctx.towerPlayer=player;
   const tower=structuredClone(towerFor(current,player));current.towerPlayerId=player;bettingSave();
   await transition({session:current,entry:'tower',tower,arenaId:randomArenaId()});
 };
 ctx.startTotalizator=()=>{bettingCancel();return transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting.arenaId});};
 ctx.startSetup=async()=>{bettingCancel();await transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting?.arenaId??'ward'});ctx.paused=true;ctx.afterSetup='menu';bettingSetup();};
 ctx.startDemo=()=>transition({session:ctx.betting,entry:'auto',arenaId:ctx.betting?.arenaId??'ward'});
 await prepare({textures,session,arenaId:session?.arenaId??'ward'});
 if(cancelled||ctx.disposed)return;root.inert=false;loading.remove();
}
boot().catch(error=>{
 console.error('Game startup:',error);
 const loading=document.getElementById('texture-loading');if(loading)loading.textContent='Не удалось подготовить арену. Обновите страницу.';
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
