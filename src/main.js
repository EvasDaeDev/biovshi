import {SESSION_STORAGE,TEST_BUILD} from './build-channel.js';
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
import {ASSETS,assetUrl,sceneTextureKeys} from './assets/manifest.js';
import {prepareOfflineGame} from './assets/offline.js';
import {createLoadingScreen} from './ui/loading-screen.js';
import {showStartupIntro} from './ui/startup-intro.js';
import {installMetalMaterials} from './ui/metal-material.js';
import {bettingLoad,bettingSave} from './betting/storage.js';
import {startSpawnSequence} from './game/session.js';
let cancelled=false,initialLoading=null;
// Only a full page load requires the explicit sound/simulation gesture.
let launchAccepted=false;
const musicOffsets=new Map();
async function prepare({textures,session,entry='auto',arenaId='ward',tower=null,multiplayer=null,enterFight=false,loading=null}){
 if(!textures){
   loading?.update('Загружаем текстуры пациентов и арены…',{done:0,total:6});
   textures=await preloadTextures({keys:sceneTextureKeys(Boolean(tower||multiplayer))});
 }
 if(cancelled)return;
 loading?.update('Создаём пациентов…',{done:1,total:6});
 if(ctx.towerFloorBake)await ctx.towerFloorBake;
 initializeGame({textures,session,entry,arenaId,tower,multiplayer});
 const audio=createAudio({musicOffsets});ctx.audio=audio;
 const dispose=ctx.root.__disposeTag;
 ctx.root.__disposeTag=()=>{audio.dispose();if(ctx.audio===audio)ctx.audio=null;dispose();};
 await applyTextures();if(cancelled||ctx.disposed)return;
 loading?.update('Рисуем портреты пациентов…',{done:2,total:6});
 await preparePatientPortraits();if(cancelled||ctx.disposed)return;
 loading?.update('Подготавливаем поверхность арены…',{done:3,total:6});
 paintTelemetry();await initializeFloor({ephemeral:entry==='lan-menu'});
 loading?.update('Настраиваем графику арены…',{done:4,total:6});
 await initializePixiArena();
 if(cancelled||ctx.disposed)return;
 if(ctx.startup.phase==='garage')garageOpen();
 initializeDiagnostics();
 const gate=ctx.root.querySelector('#launch-overlay');
 const launchButton=ctx.root.querySelector('#launch-game');
 gate.hidden=launchAccepted;
 if(!multiplayer)installTowerUI({enterFight});
 loading?.update('Подключаем управление и интерфейс…',{done:5,total:6});
 initializeModalFocus();
 initializeGameNavigation();
 if(!multiplayer)initializeTutorial();
 launchButton.onclick=()=>{
   // The preloaded demo is reusable only while the opening menu still owns it.
   if(launchAccepted||ctx.startup.phase!=='demo')return ctx.startDemo();
   // AudioContext.resume() must happen synchronously in this user gesture.
   audio.unlock();
   launchAccepted=true;
   gate.hidden=true;
   startSpawnSequence();
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
 const lanServed=document.querySelector('meta[name="biovshi-lan"][content="1"]')!==null;
 const preparingOffline=!lanServed&&typeof __OFFLINE_BUILD__!=='undefined'&&__OFFLINE_BUILD__;
 if(preparingOffline)try{
   loading.update('Проверяем автономную копию игры…');
   await prepareOfflineGame(document.defaultView,{onProgress:(done,total)=>
     loading.update('Скачиваем игру для работы без интернета…',{done,total,phase:'textures'})});
 }catch(error){
   console.error('Offline game installation:',error);
   loading.fail('Не удалось скачать всю игру. Проверьте подключение и обновите страницу.');
   return;
 }
 const menuBackground=document.querySelector('#menu-background img');
 menuBackground.src=assetUrl(ASSETS.textures.uiMenuBackground);
 const [textures]=await Promise.all([
  preloadTextures({keys:sceneTextureKeys(),onProgress:(done,total)=>
   loading.update('Загружаем текстуры пациентов и арены…',{done,total,phase:'textures'})}),
  loadLocations(new URL('./locations/',document.baseURI)),
  installMetalMaterials(document),
  menuBackground.decode?.().catch(()=>{}),
 ]);
 if(cancelled){loading.close();return;}
 loading.update('Текстуры загружены. Запускаем игру…',{done:0,total:6});
 ctx.BET_STORAGE=SESSION_STORAGE;const session=bettingLoad({persistMigrations:!lanServed});
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
   catch(error){if(!options.recoverable)progress.fail('Не удалось подготовить арену.');throw error;}
   finally{ctx.keepArenaRenderer=false;root.inert=false;if(owned&&(succeeded||options.recoverable))progress.close();}
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
 await prepare({textures,session,entry:lanServed?'lan-menu':'auto',arenaId:session?.arenaId??'ward',loading});
 if(cancelled||ctx.disposed){loading.close();return;}
 root.inert=false;loading.close();
 if(lanServed){
   const [{installLanLobby},{createLanRoster},{installLanHostArena},{installLanGuestArena}]=await Promise.all([
     import('./lan/lobby.js'),import('./lan/characters.js'),import('./lan/host-arena.js'),import('./lan/guest-arena.js'),
   ]);
   let previousSession=null;
   const towerFrom=s=>s?.towers?.[s.towerPlayerId??0];
   if(installLanLobby(root,{
     unlock:()=>ctx.audio?.unlock(),
     tower:()=>towerFrom(previousSession??ctx.betting),
     async prepareMatch(room,memberId,actions,{replica=false}={}){
       if(replica){
         previousSession=ctx.betting;
         const {view}=room;
         const fighters=createLanRoster({members:view.players,ai:view.ai},memberId,null,{towerLoadout:view.tower});
         const multiplayer={fighters,replica:true,starts:view.starts,...actions};
         await transition({entry:'lan',arenaId:room.arenaId,multiplayer,recoverable:true});
         return installLanGuestArena(multiplayer);
       }
       previousSession=ctx.betting;
       const fighters=createLanRoster(room,memberId,towerFrom(previousSession));
       const multiplayer={fighters,...actions};
       await transition({entry:'lan',arenaId:room.arenaId,multiplayer,recoverable:true});
       return installLanHostArena(multiplayer);
     },
     async leaveMatch(){
       const previous=previousSession;
       previousSession=null;
       await transition({entry:'lan-menu',session:previous,arenaId:previous?.arenaId??'ward',recoverable:true});
       openMenu();
     },
   }))return;
 }else if(TEST_BUILD&&['http:','https:'].includes(location.protocol)){
   const button=root.querySelector('#launch-lan');
   button.hidden=false;
   button.onclick=()=>location.assign(new URL('./lan/',document.baseURI));
 }
 showStartupIntro(root);
}
boot().catch(error=>{
 console.error('Game startup:',error);
 if(initialLoading)initialLoading.fail('Не удалось подготовить арену. Обновите страницу.');
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
