import {patientSkin} from '../game/patients.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { onGameEvent } from '../game/event-bus.js';
import { ctx } from '../game/state.js';

const STORAGE='biovshi.audio.v1';
const DEFAULTS={sounds:50,music:50};
const rawFiles=new Map(),decodedFiles=new WeakMap();
const vocalGainCache=new WeakMap();
const PAIN_TARGET_RMS=10**(-19/20);
// Measure the loudest 100-ms window of a decoded vocal take, not the sample
// peak. Do it once per buffer; keep natural accents with a restrained gain cap.
export function painLevelGain(buffer){
  if(!buffer||typeof buffer.getChannelData!=='function'||!buffer.sampleRate||!buffer.length)return 1;
  if(vocalGainCache.has(buffer))return vocalGainCache.get(buffer);
  const window=Math.max(1,Math.round(buffer.sampleRate*.1));
  const channels=Array.from({length:Math.max(1,buffer.numberOfChannels||1)},(_,i)=>buffer.getChannelData(i));
  const length=Math.min(buffer.length,Math.round(buffer.sampleRate*4));
  let peakRms=0;
  for(let start=0;start<length;start+=Math.max(1,Math.floor(window/2))){
    const end=Math.min(length,start+window),count=Math.max(1,(end-start)*channels.length);
    let sum=0;
    for(const samples of channels)for(let i=start;i<end;i++)sum+=samples[i]*samples[i];
    peakRms=Math.max(peakRms,Math.sqrt(sum/count));
  }
  const value=peakRms>1e-5?Math.max(.45,Math.min(2.4,PAIN_TARGET_RMS/peakRms)):1;
  vocalGainCache.set(buffer,value);
  return value;
}
// Room is a single lightweight shared 0.55-s convolution tail. Music, UI,
// footsteps and dragging never enter it.
const ROOM_WET=Object.freeze({
 hit:.07,crit:.08,detach1:.1,detach2:.1,pounce:.08,
 miss1:.05,miss2:.05,death:.12
});
function wetFor(key){return (key.startsWith('manPain')||key.startsWith('womanPain')) ? .14 : (ROOM_WET[key]??0);}
export function makeRoomImpulse(context){
  const rate=context.sampleRate;
  const count=Math.floor(rate*.55),impulse=context.createBuffer(2,count,rate);
  // Fixed seed makes the sound stable across visits and cheap to prepare once.
  let seed=1337;
  for(let channel=0;channel<2;channel++){
    const samples=impulse.getChannelData(channel);
    let damped=0;
    for(let i=0;i<count;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const noise=(seed/4294967296)*2-1;
      damped=damped*.56+noise*.44;
      const time=i/rate;
      const early=time>.014&&time<.055?1.55:1;
      samples[i]=damped*Math.exp(-6.9*time/.55)*early;
    }
  }
  return impulse;
}
const PAIN_SAMPLES = [
  ['manPain1','manPain2','manPain3'], // A, B
  ['womanPain1','womanPain2','womanPain3','womanPain4','womanPain5','womanPain6','womanPain7'] // C, D
];
export function painSoundKey(patient,randomValue=Math.random()) {
  if(!Number.isInteger(patient)||patient<0||patient>3)return null;
  const samples=PAIN_SAMPLES[patient<2?0:1];
  return samples[Math.min(samples.length-1,Math.max(0,Math.floor(randomValue*samples.length)))];
}
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
  let context,soundBus,musicBus,roomConvolver,disposed=false,unlocked=false,effectsPaused=false,lastPhase;
  let musicOffset=0,musicFadeEnd=null;
  const MUSIC_FADE_SECONDS=10;
  const warn=(key,error)=>{if(!warnings.has(key)){warnings.add(key);console.warn('Audio unavailable:',key,error);}};
  // Fetch ahead without requiring a running audio device. Decode only once a
  // context has been unlocked, and reuse it across arena replacements on iOS.
  if(bufferLoader===decodeSound)for(const [key,file] of Object.entries(ASSETS.sounds))fetchSound(file).catch(error=>warn(key,error));
  function stop(voice){
    if(voice.key==='music'&&voice.startedAt!=null&&voice.source?.buffer?.duration>0){
      musicOffset=(voice.offset+Math.max(0,context.currentTime-voice.startedAt))%voice.source.buffer.duration;
    }
    voice.cancelled=true;
    try{voice.source?.stop();}catch{}
    voice.source?.disconnect();voice.gain?.disconnect();voice.roomSend?.disconnect();voices.delete(voice);
    if(voice.slot&&loops.get(voice.slot)===voice)loops.delete(voice.slot);
  }
  function stopAll(){for(const voice of [...voices])stop(voice);}
  function gainFor(key,buffer){
    if(key==='step')return .7;
    if(key==='drag')return 1;
    if(key==='crawl')return .55;
    if(key==='hit')return .95;
    if(key==='crit')return .74;
    if(key.startsWith('manPain')||key.startsWith('womanPain'))return painLevelGain(buffer);
    return 1;
  }
  function play(key,{patient,slot,priority=2,delaySec=0}={}){
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
      gain.gain.value=gainFor(key,buffer);source.connect(gain);
      gain.connect(key==='music'?musicBus:soundBus);
      const wet=wetFor(key);
      if(roomConvolver&&wet>0){
        const send=context.createGain();
        send.gain.value=wet;
        gain.connect(send);send.connect(roomConvolver);voice.roomSend=send;
      }
      source.onended=()=>stop(voice);
      if(key==='music'){
        voice.offset=buffer.duration>0?musicOffset%buffer.duration:0;
        voice.startedAt=context.currentTime;
        source.start(0,voice.offset);
      }else source.start(context.currentTime+Math.max(0,delaySec));
    }).catch(error=>{stop(voice);warn(key,error);});
  }
  function sync(){
    if(disposed)return;
    const active=state.startup?.phase==='running'&&!state.combat?.finished;
    const paused=Boolean(state.paused||state.settingsOpen||state.orientationBlocked);
    if(lastPhase==='running'&&state.startup?.phase!=='running')for(const voice of [...voices])if(voice.key!=='music')stop(voice);
    lastPhase=state.startup?.phase;
    if(paused&&!effectsPaused)for(const v of [...voices])if(v.key!=='music')stop(v);
    effectsPaused=paused;
    const music=active&&settings.music>0;
    if(music){
      if(musicFadeEnd!==null){
        // A new round never inherits a half-faded voice: resume from its current position.
        if(loops.has('music'))stop(loops.get('music'));
        musicFadeEnd=null;
      }
      play('music',{slot:'music'});
    }else if(loops.has('music')){
      const voice=loops.get('music');
      if(state.combat?.finished&&settings.music>0){
        if(musicFadeEnd===null){
          if(voice.gain){
            musicFadeEnd=context.currentTime+MUSIC_FADE_SECONDS;
            voice.gain.gain.cancelScheduledValues(context.currentTime);
            voice.gain.gain.setValueAtTime(voice.gain.gain.value,context.currentTime);
            voice.gain.gain.linearRampToValueAtTime(0,musicFadeEnd);
          }else stop(voice);
        }else if(context.currentTime>=musicFadeEnd){stop(voice);musicFadeEnd=null;}
      }else{stop(voice);musicFadeEnd=null;}
    }else musicFadeEnd=null;
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
      if(!soundBus){
        soundBus=context.createGain();musicBus=context.createGain();
        soundBus.connect(context.destination);musicBus.connect(context.destination);
        // One shared room effect for combat only; no new files, per-frame work,
        // or changes to music and footstep dynamics.
        if(context.createConvolver&&context.createBuffer&&context.sampleRate){
          try{
            roomConvolver=context.createConvolver();
            roomConvolver.normalize=true;
            roomConvolver.buffer=makeRoomImpulse(context);
            roomConvolver.connect(soundBus);
          }catch(error){roomConvolver?.disconnect();roomConvolver=null;warn('room',error);}
        }
        applyVolumes();
      }
      // Predecode short pain clips after user interaction so the first injury
      // can start close to its intended +100 ms audio-clock deadline.
      if(bufferLoader===decodeSound) {
        for(const group of PAIN_SAMPLES)for(const key of group)
          bufferLoader(context,ASSETS.sounds[key]).catch(error=>warn(key,error));
        // The short combat leap must be ready before an unexpected takeoff.
        bufferLoader(context,ASSETS.sounds.pounce).catch(error=>warn('pounce',error));
      }
      unlocked=true;
      // resume() must be invoked inside the gesture, before any asynchronous work.
      Promise.resolve(context.resume()).then(sync).catch(error=>warn('unlock',error));
      sync();
    }catch(error){warn('device',error);}
  }
  function playClickTone(){
    if(disposed||!context||context.state!=='running'||settings.sounds===0)return;
    try{
      const time=context.currentTime,osc=context.createOscillator(),gain=context.createGain();
      osc.type='sine';osc.frequency.setValueAtTime(850,time);
      osc.frequency.exponentialRampToValueAtTime(520,time+.035);
      gain.gain.setValueAtTime(.12,time);
      gain.gain.exponentialRampToValueAtTime(.001,time+.045);
      osc.connect(gain);gain.connect(soundBus);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};
      osc.start(time);osc.stop(time+.05);
    }catch(error){warn('click',error);}
  }
  function click(event){
    const target=event.target?.nodeType===1?event.target:event.target?.parentElement;
    const button=target?.closest?.('button,[role="button"],summary,input[type="button"],input[type="submit"],input[type="reset"]');
    if(!button||!state.root?.contains(button)||disposed||settings.sounds===0
       ||button.disabled||button.matches?.(':disabled')
       ||button.getAttribute?.('aria-disabled')==='true')return;
    // Capture click on the arena root, before a popup/button may stop bubbling
    // or replace itself. The initial launch button must also be audible.
    if(!unlocked)unlock();
    if(!context)return;
    if(context.state==='running'){playClickTone();return;}
    Promise.resolve(context.resume()).then(playClickTone).catch(error=>warn('click',error));
  }
  function applyVolumes(){if(soundBus)soundBus.gain.value=settings.sounds/100;if(musicBus)musicBus.gain.value=settings.music/100;}
  function setVolume(channel,value){
    if(!(channel in settings))return;
    settings[channel]=clamp(value);applyVolumes();
    if(settings[channel]===0)for(const voice of [...voices])if((voice.key==='music')===(channel==='music'))stop(voice);
    if(channel==='music'&&settings.music===0)musicFadeEnd=null;
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
    if(type==='pounce-launch'){play('pounce',{patient:event.robot,priority:4});return;}
    if(type==='hit'||type==='segment-broken'){
      play(event.damage===2?'crit':'hit',{patient,priority:3});
      // The injured patient reacts 100 ms after the impact. This is an
      // additional voice, never a replacement for hit/crit/detach effects.
      const painKey=painSoundKey(patientSkin(event.robot));
      if(painKey)play(painKey,{patient:event.robot,priority:2,delaySec:.1});
      if(type==='segment-broken')play(Math.random()<.5?'detach1':'detach2',{patient:event.robot,priority:4});
    }else if(type==='combat-miss')play(Math.random()<.5?'miss1':'miss2',{patient,priority:1});
    else if(type==='robot-immobilized'&&event.reason==='погиб')play('death',{patient:event.robot,priority:4});
    else if(type==='footstep')play('step',{patient:event.robot,priority:0});
  });
  eventTarget.addEventListener('pointerdown',unlock);eventTarget.addEventListener('keydown',unlock);
  const clickTarget=state.root??eventTarget;
  clickTarget.addEventListener('click',click,true);
  // A prior gesture has already unlocked the shared context during this visit.
  if(sharedContext?.state==='running')unlock();
  return {sync,unlock,setVolume,stopAll,get settings(){return {...settings};},dispose(){
    if(disposed)return;disposed=true;unsubscribe();stopAll();roomConvolver?.disconnect();soundBus?.disconnect();musicBus?.disconnect();
    for(const {input,listener} of controls)input.removeEventListener('input',listener);
    eventTarget.removeEventListener('pointerdown',unlock);eventTarget.removeEventListener('keydown',unlock);
    clickTarget.removeEventListener('click',click,true);
  }};
}
