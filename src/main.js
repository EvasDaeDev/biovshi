import { preparePatientPortraits } from './ui/patient-portrait.js';
import { paintTelemetry } from './ui/paint-telemetry.js';
import { initializeGame } from './game/initialize.js';
import { ctx } from './game/state.js';
import { createAudio } from './audio/audio.js';
import { applyTextures } from './render/textures.js';
import { initializePixiArena } from './render/pixi-scene.js';
import { initializeDiagnostics } from './render/diagnostics.js';
import { preloadTextures } from './assets/preload.js';

let cancelled=false;
async function boot() {
  const root=document.getElementById('robot-tag-hops-v22');
  let loading=document.getElementById('texture-loading');
  if(!loading){loading=document.createElement('div');loading.id='texture-loading';loading.textContent='Подготовка арены…';loading.setAttribute('role','status');document.body.prepend(loading);}
  root.inert=true;
  const textures=await preloadTextures();
  if(cancelled)return;
  initializeGame({textures});
  await applyTextures();
  if(cancelled||ctx.disposed)return;
  await preparePatientPortraits();
  if(cancelled||ctx.disposed)return;
  paintTelemetry();
  await initializePixiArena();
  if(cancelled||ctx.disposed)return;
  initializeDiagnostics();
  root.inert=false;
  loading.remove();
  const audio=createAudio();
  const dispose=ctx.root.__disposeTag;
  ctx.root.__disposeTag=()=>{audio.dispose();dispose();};
}
boot().catch(error=>{
  console.error('Game startup:',error);
  const loading=document.getElementById('texture-loading');
  if(loading)loading.textContent='Не удалось подготовить арену. Обновите страницу.';
});
if(import.meta.hot)import.meta.hot.dispose(()=>{cancelled=true;ctx.root?.__disposeTag?.();});
