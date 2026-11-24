import {SESSION_STORAGE} from './build-channel.js';
import {setPaused} from './ui/controls.js';
import {arenaDefinition,loadLocations,suitableArenaId} from './game/arenas.js';
import {installTowerUI,openMenu,refreshMenu,towerPreparation} from './tower/ui.js';
import {towerEnemyCount,towerFor} from './tower/model.js';
import {ensureTowerFloorPlan,selectedTowerFloor} from './tower/floors.js';
import {bettingCancel} from './betting/ui.js';
import {installProfiles} from './ui/profiles.js';
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
import {ASSETS,assetUrl,sceneTextureKeys} from './assets/manifest.js';
import {prepareOfflineGame} from './assets/offline.js';
import {trackResource} from './assets/resource-status.js';
import {installResourceStatus} from './ui/resource-status.js';
import {createLoadingScreen} from './ui/loading-screen.js';
import {createBattleTransition} from './ui/battle-transition.js';
import {showStartupIntro} from './ui/startup-intro.js';
import {installMetalMaterials} from './ui/metal-material.js';
import {bettingLoad,bettingSave} from './betting/storage.js';
import {startSpawnSequence} from './game/session.js';
let cancelled=false,initialLoading=null,disposeResourceStatus;
// Only a full page load requires the explicit sound/simulation gesture.
let launchAccepted=false;
const musicOffsets=new Map();
async function prepare({textures,session,entry='auto',arenaId='ward',tower=null,enterFight=false,loading=null}){
 if(!textures){
   loading?.update('Загружаем текстуры пациентов и арены…',{done:0,total:6});
   textures=await preloadTextures({keys:sceneTextureKeys(Boolean(tower)),onProgress:(done,total)=>
     loading?.update('Загружаем текстуры пациентов и арены…',{done:total?done/total:0,total:6})});
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
 launchButton.onclick=()=>ctx.startDemo(!launchAccepted&&!sceneTexturesMissing()&&ctx.startup.phase==='demo'
  &&(!ctx.betting||ctx.betting.phase==='running'));
 installProfiles(ctx.root,refreshMenu);
 loading?.update('Арена готова!',{done:6,total:6});
 ctx.platform?.ready();
}
const sceneTexturesMissing=()=>Object.values(ctx.textureAssets??{}).some(texture=>!texture.loaded);
async function measureStartup(stage,work){
 const performance=document.defaultView.performance;
 const start=performance.now();
 try{return await work();}
 finally{try{performance.measure?.('biovshi:'+stage,{start,end:performance.now()});}catch{/* Older browsers can omit these timings. */}}
}
async function boot(){
 const root=document.getElementById('robot-tag-hops-v22');
 const loading=createLoadingScreen({staged:true});initialLoading=loading;
 root.inert=true;
 disposeResourceStatus=installResourceStatus(document);
 // Install the complete offline copy on the first visit without waiting for
 // unrelated music, art and later Tower assets before opening the menu.
 if(typeof __OFFLINE_BUILD__!=='undefined'&&__OFFLINE_BUILD__){
   measureStartup('offline-copy',()=>trackResource('offline-copy',()=>
     prepareOfflineGame(document.defaultView))).catch(error=>console.warn('Offline game installation:',error));
 }
 const menuBackground=document.querySelector('#menu-background img');
 menuBackground.src=assetUrl(ASSETS.textures.uiMenuBackground);
 const [textures]=await Promise.all([
  measureStartup('scene-textures',()=>preloadTextures({keys:sceneTextureKeys(),onProgress:(done,total)=>
   loading.update('Загружаем текстуры пациентов и арены…',{done,total,phase:'textures'})})),
  measureStartup('locations',()=>loadLocations(new URL('./locations/',document.baseURI))),
  measureStartup('menu-materials',()=>installMetalMaterials(document)),
  menuBackground.decode?.().catch(()=>{}),
 ]);
 if(cancelled){loading.close();return;}
 loading.update('Текстуры загружены. Запускаем игру…',{done:0,total:6});
 ctx.BET_STORAGE=SESSION_STORAGE;const session=bettingLoad();
 const prepareScene=async(options,loading)=>{
   launchAccepted=true;ctx.keepArenaRenderer=true;
   try{await prepare({...options,loading});}
   finally{ctx.keepArenaRenderer=false;}
 };
 ctx.withBattleTransition=async prepareFight=>{
   if(root.inert)return;
   // Keep the audio gesture synchronous and block inputs while the arena changes.
   ctx.audio?.unlock();
   const cover=createBattleTransition(document);
   root.inert=true;
   try{
     await cover.show();
     if(cancelled)return;
     await prepareFight(cover);
     if(cancelled||ctx.disposed)return;
     await cover.finish();
     if(!cancelled&&!ctx.disposed)startSpawnSequence();
   }finally{cover.close();root.inert=false;}
 };
 ctx.switchArena=async(arenaId,progress)=>{
   if(arenaId===ctx.arenaId&&!sceneTexturesMissing())return;
   const session=ctx.betting,expanded=ctx.arenaExpanded;
   session.arenaId=arenaId;bettingSave();
   await prepareScene({session,entry:'betting',arenaId},progress);
   ctx.setArenaExpanded?.(expanded);
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
   ctx.towerTransition=ctx.withBattleTransition(progress=>
     prepareScene({session:current,entry:'tower',tower:structuredClone(run),
       arenaId:selectedTowerFloor(run)?.arenaId??ctx.arenaDefinition.id,enterFight:true},progress));
   return ctx.towerTransition;
 };
 ctx.startTotalizator=async()=>{
   bettingCancel();
   const loading=createLoadingScreen();
   root.inert=true;
   try{
     await prepareScene({session:ctx.betting,entry:'betting',arenaId:ctx.betting.arenaId},loading);
     loading.close();
   }catch(error){loading.fail('Не удалось подготовить арену.');throw error;}
   finally{root.inert=false;}
 };
 ctx.startDemo=async reuse=>{
   try{
     await ctx.withBattleTransition(progress=>{
       if(!reuse)return prepareScene({session:ctx.betting,entry:'auto',arenaId:ctx.betting?.arenaId??'ward'},progress);
       launchAccepted=true;
       root.querySelector('#launch-overlay').hidden=true;
     });
   }catch(error){
     console.error('Spectator arena loading:',error);
     openMenu();
     root.querySelector('.launch-subtitle').textContent='Не удалось подготовить арену. Повтори попытку.';
   }
 };
 await measureStartup('first-arena',()=>prepare({textures,session,arenaId:session?.arenaId??'ward',loading}));
 if(cancelled||ctx.disposed){loading.close();return;}
 root.inert=false;loading.close();
 showStartupIntro(root);
}
boot().catch(error=>{
 console.error('Game startup:',error);
 if(initialLoading)initialLoading.fail('Не удалось подготовить арену. Обновите страницу.');
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;disposeResourceStatus?.();ctx.root?.__disposeTag?.();});
