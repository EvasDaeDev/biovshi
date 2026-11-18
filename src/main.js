import {SESSION_STORAGE} from './build-channel.js';
import {setPaused} from './ui/controls.js';
import {arenaDefinition,randomArenaId} from './game/arenas.js';
import {installTowerUI,openMenu,towerPreparation} from './tower/ui.js';
import {towerFor} from './tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor} from './tower/floors.js';
import {bettingSetup,bettingCancel} from './betting/ui.js';
import {initializeFloor} from './render/floor-history.js';
import {initializeModalFocus} from './ui/modal-focus.js';
import {initializeTutorial} from './ui/tutorial.js';
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
async function prepare({textures,session,entry='auto',arenaId='ward',tower=null,enterFight=false}){
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
 installTowerUI({enterFight});
 initializeModalFocus();
 initializeTutorial();
 launchButton.onclick=()=>{
   if(launchAccepted){ctx.audio?.unlock();ctx.startDemo();return;}
   // AudioContext.resume() must happen synchronously in this user gesture.
   audio.unlock();
   launchAccepted=true;
   gate.hidden=true;
   if(ctx.startup.phase==='demo')startSpawnSequence();else if(ctx.startup.phase==='running'){setPaused(false);}
 };
 ctx.root.querySelector('#launch-setup').onclick=()=>{audio.unlock();launchAccepted=true;ctx.startSetup();};
 if(launchAccepted&&ctx.startup.phase==='demo')startSpawnSequence();
 if(enterFight)startSpawnSequence();
 ctx.platform?.ready();
}
async function boot(){
 const root=document.getElementById('robot-tag-hops-v22');
 let loading=document.getElementById('texture-loading');
 if(!loading){loading=document.createElement('div');loading.id='texture-loading';loading.textContent='Подготовка арены…';loading.setAttribute('role','status');document.body.prepend(loading);}
 root.inert=true;const textures=await preloadTextures();if(cancelled)return;
 ctx.BET_STORAGE=SESSION_STORAGE;const session=bettingLoad();
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
   const current=ctx.betting;
   bettingCancel();
   const run=towerFor(current,player);
   ensureTowerFloorPlan(run);current.towerPlayerId=player;bettingSave();
   // The original preparation sheet is shown BEFORE any Tower world build.
   // Only lightweight floor metadata is read while the old canvas is hidden.
   ctx.towerPlayer=player;ctx.towerRun=run;ctx.mode='tower';ctx.deferTowerArena=true;
   ctx.root.dataset.gameMode='tower-preparing';
   ctx.arenaDefinition=arenaDefinition(selectedTowerFloor(run)?.arenaId??'ward');
   ctx.towerGarage=[{stats:[...run.stats],mutations:[...run.mutations],
     mutationInventory:structuredClone(run.mutationInventory??[]),
     equippedMutations:[...(run.equippedMutations??[])],
     prosthetics:[...(run.prosthetics??[]),...(run.graftProsthetics??[])],
     surgeries:structuredClone(run.surgeries??[])}];
   setPaused(true);ctx.resultsPanel.hidden=true;
   root.querySelector('#launch-overlay').hidden=true;
   root.querySelector('#tower-controls').hidden=true;
   towerPreparation();
 };
 ctx.enterTowerArena=async()=>{
   if(!ctx.deferTowerArena)return ctx.towerTransition;
   const current=ctx.betting,run=towerFor(current,ctx.towerPlayer);
   // The Shelter moves the artifact collection into its own dialog: return
   // it to preparation before tearing down the old UI.
   const artifacts=root.querySelector('#tower-prep-artifacts');
   if(artifacts)root.querySelector('#tower-prep-error')?.before(artifacts);
   const shelter=root.querySelector('#tower-upgrade-window');
   if(shelter?.open&&typeof shelter.close==='function')shelter.close();
   shelter?.remove();root.querySelector('#tower-upgrade-open')?.remove();
   ctx.deferTowerArena=false;
   ctx.towerTransition=transition({session:current,entry:'tower',tower:structuredClone(run),
     arenaId:selectedTowerFloor(run)?.arenaId??randomArenaId(),enterFight:true});
   return ctx.towerTransition;
 };
 ctx.startTotalizator=()=>{bettingCancel();return transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting.arenaId});};
 ctx.startSetup=async()=>{bettingCancel();await transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting?.arenaId??'ward'});setPaused(true);ctx.afterSetup='menu';bettingSetup();};
 ctx.startDemo=()=>transition({session:ctx.betting,entry:'auto',arenaId:ctx.betting?.arenaId??'ward'});
 await prepare({textures,session,arenaId:session?.arenaId??'ward'});
 if(cancelled||ctx.disposed)return;root.inert=false;loading.remove();
}
boot().catch(error=>{
 console.error('Game startup:',error);
 const loading=document.getElementById('texture-loading');if(loading)loading.textContent='Не удалось подготовить арену. Обновите страницу.';
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
