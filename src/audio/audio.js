import { ASSETS, assetUrl } from '../assets/manifest.js';
import { onGameEvent } from '../game/event-bus.js';
import { ctx } from '../game/state.js';

const STORAGE='biovshi.audio.v1';
const DEFAULTS={sounds:70,music:10};
const rawFiles=new Map(),decodedFiles=new WeakMap();
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
  let context,soundBus,musicBus,disposed=false,unlocked=false,effectsPaused=false,lastPhase;
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
    voice.source?.disconnect();voice.gain?.disconnect();voices.delete(voice);
    if(voice.slot&&loops.get(voice.slot)===voice)loops.delete(voice.slot);
  }
  function stopAll(){for(const voice of [...voices])stop(voice);}
  function gainFor(key){return key==='step' ? .7 : key==='drag' ? 1 : key==='crawl' ? .55 : 1;}
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
      gain.gain.value=gainFor(key);source.connect(gain);gain.connect(key==='music'?musicBus:soundBus);
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
      if(!soundBus){soundBus=context.createGain();musicBus=context.createGain();soundBus.connect(context.destination);musicBus.connect(context.destination);applyVolumes();}
      // Predecode short pain clips after user interaction so the first injury
      // can start close to its intended +100 ms audio-clock deadline.
      if(bufferLoader===decodeSound)for(const group of PAIN_SAMPLES)for(const key of group)
        bufferLoader(context,ASSETS.sounds[key]).catch(error=>warn(key,error));
      unlocked=true;
      // resume() must be invoked inside the gesture, before any asynchronous work.
      Promise.resolve(context.resume()).then(sync).catch(error=>warn('unlock',error));
      sync();
    }catch(error){warn('device',error);}
  }
  function click(event){
    const target=event.target;
    const button=target?.closest?.('button,[role="button"]');
    if(!button||button.disabled||!state.root?.contains(button)||disposed||!unlocked||!context||context.state!=='running'||settings.sounds===0)return;
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
    if(type==='hit'||type==='segment-broken'){
      play(event.damage===2?'crit':'hit',{patient,priority:3});
      // The injured patient reacts 100 ms after the impact. This is an
      // additional voice, never a replacement for hit/crit/detach effects.
      const painKey=painSoundKey(event.robot);
      if(painKey)play(painKey,{patient:event.robot,priority:2,delaySec:.1});
      if(type==='segment-broken')play(Math.random()<.5?'detach1':'detach2',{patient:event.robot,priority:4});
    }else if(type==='combat-miss')play(Math.random()<.5?'miss1':'miss2',{patient,priority:1});
    else if(type==='robot-immobilized'&&event.reason==='погиб')play('death',{patient:event.robot,priority:4});
    else if(type==='footstep')play('step',{patient:event.robot,priority:0});
  });
  eventTarget.addEventListener('pointerdown',unlock);eventTarget.addEventListener('keydown',unlock);
  eventTarget.addEventListener('click',click);
  // A prior gesture has already unlocked the shared context during this visit.
  if(sharedContext?.state==='running')unlock();
  return {sync,unlock,setVolume,stopAll,get settings(){return {...settings};},dispose(){
    if(disposed)return;disposed=true;unsubscribe();stopAll();soundBus?.disconnect();musicBus?.disconnect();
    for(const {input,listener} of controls)input.removeEventListener('input',listener);
    eventTarget.removeEventListener('pointerdown',unlock);eventTarget.removeEventListener('keydown',unlock);
    eventTarget.removeEventListener('click',click);
  }};
}
