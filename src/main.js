import {SESSION_STORAGE} from './build-channel.js';
import {setPaused} from './ui/controls.js';
import {arenaDefinition,loadLocations,suitableArenaId} from './game/arenas.js';
import {installTowerUI,openMenu,towerPreparation} from './tower/ui.js';
import {towerEnemyCount,towerFor} from './tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor} from './tower/floors.js';
import {bettingSetup,bettingCancel} from './betting/ui.js';
import {initializeFloor} from './render/floor-history.js';
import {initializeModalFocus} from './ui/modal-focus.js';
import {initializeGameNavigation} from './ui/game-navigation.js';
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
import {sceneTextureKeys} from './assets/manifest.js';
import {createLoadingScreen} from './ui/loading-screen.js';
import {showStartupIntro} from './ui/startup-intro.js';
import {bettingLoad,bettingSave} from './betting/storage.js';
import {startSpawnSequence} from './game/session.js';
let cancelled=false,initialLoading=null;
// Only a full page load requires the explicit sound/simulation gesture.
let launchAccepted=false;
const musicOffsets=new Map();
async function prepare({textures,session,entry='auto',arenaId='ward',tower=null,enterFight=false,loading=null}){
 if(!textures){
   loading?.update('Загружаем текстуры пациентов и арены…',{done:0,total:6});
   textures=await preloadTextures({keys:sceneTextureKeys(Boolean(tower))});
 }
 if(cancelled)return;
 loading?.update('Создаём пациентов…',{done:1,total:6});
 if(ctx.towerFloorBake)await ctx.towerFloorBake;
 initializeGame({textures,session,entry,arenaId,tower});
 const audio=createAudio({musicOffsets});ctx.audio=audio;
 const dispose=ctx.root.__disposeTag;
 ctx.root.__disposeTag=()=>{audio.dispose();if(ctx.audio===audio)ctx.audio=null;dispose();};
 await applyTextures();if(cancelled||ctx.disposed)return;
 loading?.update('Рисуем портреты пациентов…',{done:2,total:6});
 await preparePatientPortraits();if(cancelled||ctx.disposed)return;
 loading?.update('Подготавливаем поверхность арены…',{done:3,total:6});
 paintTelemetry();await initializeFloor();
 loading?.update('Настраиваем графику арены…',{done:4,total:6});
 await initializePixiArena();
 if(cancelled||ctx.disposed)return;
 if(ctx.startup.phase==='garage')garageOpen();
 initializeDiagnostics();
 const gate=ctx.root.querySelector('#launch-overlay');
 const launchButton=ctx.root.querySelector('#launch-game');
 gate.hidden=launchAccepted;
 installTowerUI({enterFight});
 loading?.update('Подключаем управление и интерфейс…',{done:5,total:6});
 initializeModalFocus();
 initializeGameNavigation();
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
 loading?.update('Арена готова!',{done:6,total:6});
 ctx.platform?.ready();
}
async function boot(){
 const root=document.getElementById('robot-tag-hops-v22');
 const loading=createLoadingScreen({staged:true});initialLoading=loading;
 root.inert=true;
 const [textures]=await Promise.all([
  preloadTextures({keys:sceneTextureKeys(),onProgress:(done,total)=>
   loading.update('Загружаем текстуры пациентов и арены…',{done,total,phase:'textures'})}),
  loadLocations(new URL('./locations/',document.baseURI)),
 ]);
 if(cancelled){loading.close();return;}
 loading.update('Текстуры загружены. Запускаем игру…',{done:0,total:6});
 ctx.BET_STORAGE=SESSION_STORAGE;const session=bettingLoad();
 ctx.switchArena=async arenaId=>{
   if(arenaId===ctx.arenaId)return;
   const session=ctx.betting,expanded=ctx.arenaExpanded;
   session.arenaId=arenaId;bettingSave();root.inert=true;
   const progress=createLoadingScreen();
   ctx.keepArenaRenderer=true;
   let succeeded=false;
   try{await prepare({session,entry:'betting',arenaId,loading:progress});ctx.setArenaExpanded?.(expanded);succeeded=true;}
   catch(error){progress.fail('Ошибка загрузки арены. Повторите действие.');throw error;}
   finally{ctx.keepArenaRenderer=false;root.inert=false;if(succeeded)progress.close();}
 };
 const transition=async options=>{
   const owned=!options.loading,progress=options.loading??createLoadingScreen();
   root.inert=true;ctx.audio?.unlock();launchAccepted=true;ctx.keepArenaRenderer=true;
   let succeeded=false;
   try{await prepare({...options,loading:progress});succeeded=true;}
   catch(error){progress.fail('Не удалось подготовить арену.');throw error;}
   finally{ctx.keepArenaRenderer=false;root.inert=false;if(owned&&succeeded)progress.close();}
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
   ctx.arenaDefinition=arenaDefinition(selectedTowerFloor(run)?.arenaId??suitableArenaId(towerEnemyCount(run)+1));
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
   // The artifact collection is physically inside the Shelter dialog. Hide
   // it before returning it to its parking place in the preparation sheet;
   // otherwise it flashes in the old sheet while the arena loads.
   const artifacts=root.querySelector('#tower-prep-artifacts');
   if(artifacts){
     artifacts.hidden=true;
     root.querySelector('#tower-prep-error')?.before(artifacts);
   }
   const shelter=root.querySelector('#tower-upgrade-window');
   if(shelter?.open&&typeof shelter.close==='function')shelter.close();
   shelter?.remove();root.querySelector('#tower-upgrade-open')?.remove();
   ctx.deferTowerArena=false;
   // initializeGame changes data-game-mode before its async texture/renderer
   // work finishes. Cover the old canvas until the new scene is ready.
   const progress=createLoadingScreen();
   ctx.towerTransition=(async()=>{
     let succeeded=false;
     try{
       await transition({session:current,entry:'tower',tower:structuredClone(run),
         arenaId:selectedTowerFloor(run)?.arenaId??ctx.arenaDefinition.id,enterFight:true,loading:progress});
       succeeded=true;
     }catch(error){progress.fail('Не удалось подготовить арену.');throw error;}
     finally{if(succeeded)progress.close();}
   })();
   return ctx.towerTransition;
 };
 ctx.startTotalizator=()=>{bettingCancel();return transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting.arenaId});};
 ctx.startSetup=async()=>{bettingCancel();await transition({session:ctx.betting,entry:'betting',arenaId:ctx.betting?.arenaId??'ward'});setPaused(true);ctx.afterSetup='menu';bettingSetup();};
 ctx.startDemo=()=>transition({session:ctx.betting,entry:'auto',arenaId:ctx.betting?.arenaId??'ward'});
 await prepare({textures,session,arenaId:session?.arenaId??'ward',loading});
 if(cancelled||ctx.disposed){loading.close();return;}
 root.inert=false;loading.close();
 showStartupIntro(root);
}
boot().catch(error=>{
 console.error('Game startup:',error);
 if(initialLoading)initialLoading.fail('Не удалось подготовить арену. Обновите страницу.');
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
