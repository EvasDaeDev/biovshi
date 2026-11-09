import { ASSETS, assetUrl } from '../assets/manifest.js';
import { onGameEvent } from '../game/event-bus.js';
import { ctx } from '../game/state.js';

const STORAGE='biovshi.audio.v1';
const DEFAULTS={sounds:70,music:10};
const rawFiles=new Map(),decodedFiles=new WeakMap();
let sharedContext;
function browserContext(){
  const AudioContext=globalThis.AudioContext||globalThis.webkitAudioContext;
  return sharedContext??=AudioContext?new AudioContext():null;
}
const clamp=value=>Math.max(0,Math.min(100,Number(value)||0));
export function loadAudioSettings(storage=globalThis.localStorage){
  try{
    const saved=JSON.parse(storage?.getItem(STORAGE)||'null');
    return Object.fromEntries(Object.entries(DEFAULTS).map(([key,value])=>[key,Number.isFinite(saved?.[key])?clamp(saved[key]):value]));
  }catch{return {...DEFAULTS};}
}
// Web Audio changes pitch together with playback speed. This is intentional for
// these short effects; the music and victory cue always keep their original rate.
export function playbackRate(id,variation=0){return 2**((([-1.5,-.5,.5,1.5][id]??0)+variation)/12);}
function fetchSound(file){
  const url=assetUrl(file);
  if(!rawFiles.has(url))rawFiles.set(url,fetch(url).then(response=>{
    if(!response.ok)throw Error('Audio HTTP '+response.status);
    return response.arrayBuffer();
  }).catch(error=>{rawFiles.delete(url);throw error;}));
  return rawFiles.get(url);
}
async function decodeSound(context,file){
  let cache=decodedFiles.get(context);
  if(!cache){cache=new Map();decodedFiles.set(context,cache);}
  if(!cache.has(file))cache.set(file,fetchSound(file).then(data=>context.decodeAudioData(data.slice(0))).catch(error=>{cache.delete(file);throw error;}));
  return cache.get(file);
}

export function createAudio({state=ctx,eventTarget=globalThis,storage=globalThis.localStorage,
  contextFactory=browserContext,
  bufferLoader=decodeSound,maxVoices=12}={}){
  const settings=loadAudioSettings(storage),voices=new Set(),loops=new Map(),warnings=new Set();
  let context,soundBus,musicBus,disposed=false,unlocked=false,effectsPaused=false,lastPhase;
  const warn=(key,error)=>{if(!warnings.has(key)){warnings.add(key);console.warn('Audio unavailable:',key,error);}};
  // Fetch ahead without requiring a running audio device. Decode only once a
  // context has been unlocked, and reuse it across arena replacements on iOS.
  if(bufferLoader===decodeSound)for(const [key,file] of Object.entries(ASSETS.sounds))fetchSound(file).catch(error=>warn(key,error));
  function stop(voice){
    voice.cancelled=true;
    try{voice.source?.stop();}catch{}
    voice.source?.disconnect();voice.gain?.disconnect();voices.delete(voice);
    if(voice.slot&&loops.get(voice.slot)===voice)loops.delete(voice.slot);
  }
  function stopAll(){for(const voice of [...voices])stop(voice);}
  function gainFor(key){return key==='step' ? .7 : key==='drag' ? 1 : key==='crawl' ? .55 : 1;}
  function play(key,{patient,slot,priority=2}={}){
    if(disposed||!unlocked||!context||context.state!=='running'||!ASSETS.sounds[key]||warnings.has(key))return;
    if(slot&&loops.has(slot))return;
    if((key!=='music'&&settings.sounds===0)||(key==='music'&&settings.music===0))return;
    const effects=[...voices].filter(v=>v.key!=='music');
    if(key!=='music'&&effects.length>=maxVoices){
      const replace=effects.find(v=>!v.slot&&v.priority<priority);
      if(replace)stop(replace);else return;
    }
    const voice={key,slot,priority,cancelled:false};voices.add(voice);if(slot)loops.set(slot,voice);
    bufferLoader(context,ASSETS.sounds[key]).then(buffer=>{
      if(disposed||voice.cancelled)return;
      const source=context.createBufferSource(),gain=context.createGain();voice.source=source;voice.gain=gain;
      source.buffer=buffer;source.loop=Boolean(slot);
      source.playbackRate.value=key==='music'||key==='victory'?1:playbackRate(patient,slot?0:(Math.random()-.5)*.4);
      gain.gain.value=gainFor(key);source.connect(gain);gain.connect(key==='music'?musicBus:soundBus);
      source.onended=()=>stop(voice);source.start();
    }).catch(error=>{stop(voice);warn(key,error);});
  }
  function sync(){
    if(disposed)return;
    const active=state.startup?.phase==='running'&&!state.combat?.finished;
    const paused=Boolean(state.paused||state.settingsOpen||state.orientationBlocked);
    if(lastPhase==='running'&&state.startup?.phase!=='running')stopAll();
    lastPhase=state.startup?.phase;
    if(paused&&!effectsPaused)for(const v of [...voices])if(v.key!=='music')stop(v);
    effectsPaused=paused;
    const music=active&&settings.music>0;
    if(music)play('music',{slot:'music'});else if(loops.has('music'))stop(loops.get('music'));
    const movementLoops=new Set();
    if(active&&!paused&&settings.sounds>0)for(const robot of state.robots??[]){
      if(robot.visible&&robot.mobile&&state.combat.unarmedDeadline?.[robot.id]!=null){
        const slot='crawl-'+robot.id;movementLoops.add(slot);play('crawl',{patient:robot.id,slot,priority:3});
      }
      const moving=Math.hypot(robot.velocity?.x??0,robot.velocity?.y??0)>1;
      if(robot.visible&&robot.mobile&&moving&&!(robot.limbs??[]).some(l=>l.kind==='leg')){
        const slot='drag-'+robot.id;movementLoops.add(slot);play('drag',{patient:robot.id,slot,priority:1});
      }
    }
    for(const [slot,voice] of loops)if(slot!=='music'&&!movementLoops.has(slot))stop(voice);
  }
  function unlock(){
    if(disposed)return;
    try{
      context??=contextFactory();if(!context)return;
      if(!soundBus){soundBus=context.createGain();musicBus=context.createGain();soundBus.connect(context.destination);musicBus.connect(context.destination);applyVolumes();}
      unlocked=true;
      // resume() must be invoked inside the gesture, before any asynchronous work.
      Promise.resolve(context.resume()).then(sync).catch(error=>warn('unlock',error));
      sync();
    }catch(error){warn('device',error);}
  }
  function applyVolumes(){if(soundBus)soundBus.gain.value=settings.sounds/100;if(musicBus)musicBus.gain.value=settings.music/100;}
  function setVolume(channel,value){
    if(!(channel in settings))return;
    settings[channel]=clamp(value);applyVolumes();
    if(settings[channel]===0)for(const voice of [...voices])if((voice.key==='music')===(channel==='music'))stop(voice);
    try{storage?.setItem(STORAGE,JSON.stringify(settings));}catch{}
    updateControls();sync();
  }
  const controls=[];
  function updateControls(){for(const {input,output,channel} of controls){input.value=String(settings[channel]);output.value=settings[channel]+'%';}}
  for(const [id,channel] of [['sound','sounds'],['music','music']]){
    const input=state.root?.querySelector('#'+id+'-volume'),output=state.root?.querySelector('#'+id+'-volume-value');
    if(input&&output){const listener=()=>setVolume(channel,input.value);input.addEventListener('input',listener);controls.push({input,output,channel,listener});}
  }
  updateControls();
  const unsubscribe=onGameEvent(event=>{
    sync();
    const {type}=event,patient=event.by??event.from??event.robot;
    if(type==='combat-end'){if(event.winner!==null)play('victory',{priority:5});return;}
    if(state.startup?.phase!=='running'||state.combat?.finished||effectsPaused)return;
    if(type==='hit'||type==='segment-broken'){
      play(event.damage===2?'crit':'hit',{patient,priority:3});
      if(type==='segment-broken')play(Math.random()<.5?'detach1':'detach2',{patient:event.robot,priority:4});
    }else if(type==='combat-miss')play(Math.random()<.5?'miss1':'miss2',{patient,priority:1});
    else if(type==='robot-immobilized'&&event.reason==='погиб')play('death',{patient:event.robot,priority:4});
    else if(type==='footstep')play('step',{patient:event.robot,priority:0});
  });
  eventTarget.addEventListener('pointerdown',unlock);eventTarget.addEventListener('keydown',unlock);
  // A prior gesture has already unlocked the shared context during this visit.
  if(sharedContext?.state==='running')unlock();
  return {sync,setVolume,stopAll,get settings(){return {...settings};},dispose(){
    if(disposed)return;disposed=true;unsubscribe();stopAll();soundBus?.disconnect();musicBus?.disconnect();
    for(const {input,listener} of controls)input.removeEventListener('input',listener);
    eventTarget.removeEventListener('pointerdown',unlock);eventTarget.removeEventListener('keydown',unlock);
  }};
}
