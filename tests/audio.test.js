import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createAudio,loadAudioSettings,playbackRate,painSoundKey} from '../src/audio/audio.js';
import {emitGameEvent} from '../src/game/event-bus.js';
import {ASSETS} from '../src/assets/manifest.js';

const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://audio.test/'});
 const sources=[],gains=[];
 const context={state:'suspended',currentTime:0,destination:{},resume(){this.state='running';return Promise.resolve();},
  createGain(){const param={value:1,events:[],cancelScheduledValues(t){this.events.push(['cancel',t]);},setValueAtTime(v,t){this.value=v;this.events.push(['set',v,t]);},linearRampToValueAtTime(v,t){this.events.push(['ramp',v,t]);},exponentialRampToValueAtTime(v,t){this.events.push(['exp',v,t]);}};const gain={gain:param,connect(){},disconnect(){}};gains.push(gain);return gain;},
  createBufferSource(){const source={playbackRate:{value:1},connect(node){this.gain=node;},disconnect(){},start(...args){this.started=true;this.startArgs=args;},stop(){this.stopped=true;}};sources.push(source);return source;}};
 context.createOscillator=()=>{const oscillator={frequency:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;this.onended?.();}};sources.push(oscillator);return oscillator;};
 const state={root:dom.window.document.querySelector('#robot-tag-hops-v22'),startup:{phase:'running'},paused:false,combat:{finished:false,unarmedDeadline:[null,null]},robots:[{id:0,visible:true,mobile:true},{id:1,visible:true,mobile:true}]};
 const target=new EventTarget();
 const audio=createAudio({state,storage:dom.window.localStorage,eventTarget:target,contextFactory:()=>context,bufferLoader:async(_context,path)=>path===ASSETS.sounds.music?{duration:120}:path});
 return {audio,state,context,sources,gains,dom,target,unlock:async()=>{target.dispatchEvent(new Event('pointerdown'));await flush();},finish(){audio.dispose();dom.window.close();}};
}
const live=(sources,key)=>sources.filter(s=>s.started&&!s.stopped&&(key==='music'?s.buffer?.duration===120:s.buffer===ASSETS.sounds[key]));

test('effects unlock on gesture, use per-patient pitch, and a critical replaces a normal hit',async()=>{
 const f=setup();
 emitGameEvent('hit',{by:0,robot:1,damage:1});await flush();assert.equal(f.sources.length,0);
 await f.unlock();
 emitGameEvent('hit',{by:0,robot:1,damage:2});await flush();
 assert.equal(live(f.sources,'hit').length,0);assert.equal(live(f.sources,'crit').length,1);
 assert.ok(live(f.sources,'crit')[0].playbackRate.value<1);
 emitGameEvent('hit',{by:3,robot:1,damage:1});await flush();assert.ok(live(f.sources,'hit')[0].playbackRate.value>1);
 emitGameEvent('segment-broken',{by:0,robot:1,damage:1});await flush();
 assert.equal(live(f.sources,'detach1').length+live(f.sources,'detach2').length,1);
 emitGameEvent('robot-immobilized',{robot:1,reason:'потерял сознание'});await flush();assert.equal(live(f.sources,'death').length,0);
 emitGameEvent('robot-immobilized',{robot:1,reason:'погиб'});await flush();assert.equal(live(f.sources,'death').length,1);
 f.finish();assert.ok(f.sources.every(s=>s.stopped));
});

test('combat leap sound plays only at takeoff, using the uploaded OGG asset',async()=>{
 assert.equal(ASSETS.sounds.pounce,'assets/sounds/effects/56_Attack_03.ogg');
 const f=setup();await f.unlock();
 emitGameEvent('pounce',{robot:0});await flush();
 assert.equal(live(f.sources,'pounce').length,0,'preparation is silent');
 emitGameEvent('pounce-launch',{robot:0});await flush();
 assert.equal(live(f.sources,'pounce').length,1,'one cue at takeoff');
 emitGameEvent('pounce-retreat',{robot:0});await flush();
 assert.equal(live(f.sources,'pounce').length,1,'retreat does not replay jump cue');
 f.finish();
});

test('music loops through pause; crawling stops on unconsciousness and music fades at combat end',async()=>{
 const f=setup();await f.unlock();const music=live(f.sources,'music')[0];assert.ok(music.loop);assert.equal(music.playbackRate.value,1);
 f.state.combat.unarmedDeadline[0]=10;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1);assert.ok(live(f.sources,'crawl')[0].loop);
 f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1,'one loop per patient');
 f.state.paused=true;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,0);assert.equal(music.stopped,undefined);
 f.state.paused=false;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1);
 f.state.robots[0].mobile=false;f.audio.sync();assert.equal(live(f.sources,'crawl').length,0);
 f.state.combat.finished=true;emitGameEvent('combat-end',{winner:1});await flush();assert.equal(music.stopped,undefined);assert.deepEqual(music.gain.gain.events.slice(-3),[['cancel',0],['set',1,0],['ramp',0,10]]);assert.equal(live(f.sources,'victory').length,1);assert.equal(live(f.sources,'victory')[0].loop,false);
 f.state.startup.phase='betting';f.audio.sync();assert.equal(live(f.sources,'victory').length,0);assert.equal(music.stopped,undefined);
 f.context.currentTime=10;f.audio.sync();assert.ok(music.stopped);
 f.finish();
});

test('volume sliders update independent buses, persist 0–100 values and restore preferences',async()=>{
 const f=setup();await f.unlock();const input=f.dom.window.document.querySelector('#sound-volume');input.value='0';input.dispatchEvent(new f.dom.window.Event('input'));
 assert.equal(f.gains[0].gain.value,0);assert.equal(f.gains[1].gain.value,.1);assert.equal(f.dom.window.document.querySelector('#sound-volume-value').value,'0%');
 f.audio.setVolume('music',150);assert.equal(f.gains[1].gain.value,1);
 assert.deepEqual(loadAudioSettings(f.dom.window.localStorage),{sounds:0,music:100});
 f.audio.setVolume('music',0);assert.equal(live(f.sources,'music').length,0);
 f.audio.setVolume('music',20);await flush();assert.equal(live(f.sources,'music').length,1);
 f.finish();
});

test('voice limit bounds bursts; leaving combat cancels sounds still decoding',async()=>{
 const f=setup();await f.unlock();
 for(let i=0;i<50;i++)emitGameEvent('footstep',{robot:1});
 f.state.startup.phase='betting';f.audio.sync();await flush();assert.equal(live(f.sources,'step').length,0);
 f.state.startup.phase='running';f.audio.sync();
 for(let i=0;i<50;i++)emitGameEvent('footstep',{robot:1});await flush();assert.equal(live(f.sources,'step').length,12);
 f.finish();
});

test('runtime sound manifest resolves all files outside source references and pitch stays subtle',()=>{
 for(const path of Object.values(ASSETS.sounds)){assert.ok(!path.includes('/_src/'));assert.ok(fs.existsSync(new URL('../public/'+path,import.meta.url)));}
 for(let id=0;id<4;id++)assert.ok(playbackRate(id)>.9&&playbackRate(id)<1.1);
});

test('foot contact uses step_1 at 70%; legless movement loops it at 100% and stops when idle',async()=>{
 const f=setup();await f.unlock();
 emitGameEvent('footstep',{robot:0});await flush();
 const step=live(f.sources,'step')[0];assert.equal(step.loop,false);assert.equal(step.gain.gain.value,.7);assert.match(step.buffer,/step_1\.mp3$/);
 const robot=f.state.robots[1];robot.limbs=[];robot.velocity={x:3,y:0};f.audio.sync();await flush();
 const drag=live(f.sources,'drag').find(s=>s.loop);assert.ok(drag);assert.equal(drag.gain.gain.value,1);
 f.audio.sync();await flush();assert.equal(live(f.sources,'drag').filter(s=>s.loop).length,1);
 robot.velocity.x=0;f.audio.sync();assert.ok(drag.stopped);
 robot.velocity.x=3;robot.limbs=[{kind:'leg'}];f.audio.sync();await flush();assert.equal(live(f.sources,'drag').filter(s=>s.loop).length,0);
 robot.limbs=[];f.audio.sync();await flush();const resumed=live(f.sources,'drag').find(s=>s.loop);assert.ok(resumed);
 f.state.paused=true;f.audio.sync();assert.ok(resumed.stopped);
 f.state.paused=false;f.state.robots[1].mobile=false;f.audio.sync();await flush();assert.equal(live(f.sources,'drag').filter(s=>s.loop).length,0);
 assert.deepEqual(loadAudioSettings(),{sounds:70,music:10});
 f.finish();
});


test('next round resumes soundtrack at the paused offset after a complete fade',async()=>{
 const f=setup();await f.unlock();const first=live(f.sources,'music')[0];
 f.context.currentTime=22;f.state.combat.finished=true;f.audio.sync();
 f.context.currentTime=32;f.audio.sync();assert.ok(first.stopped);
 f.state.startup.phase='betting';f.audio.sync();
 f.state.combat.finished=false;f.state.startup.phase='running';f.audio.sync();await flush();
 const next=live(f.sources,'music')[0];assert.notEqual(next,first);assert.deepEqual(next.startArgs,[0,32]);
 f.finish();
});

test('starting a new round during fade restores gain and resumes from current playback time',async()=>{
 const f=setup();await f.unlock();const first=live(f.sources,'music')[0];
 f.context.currentTime=4;f.state.combat.finished=true;f.audio.sync();
 f.context.currentTime=7;f.state.combat.finished=false;f.audio.sync();await flush();
 assert.ok(first.stopped);
 const resumed=live(f.sources,'music')[0];assert.deepEqual(resumed.startArgs,[0,7]);
 assert.equal(resumed.gain.gain.value,1);
 f.finish();
});

test('all enabled game buttons including popup, summary and stopped-bubble clicks sound once',async()=>{
 const f=setup();await f.unlock();
 const root=f.state.root,button=root.querySelector('#tag7hop-pause');
 const click=target=>target.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true}));
 f.audio.setVolume('sounds',70);
 const initial=f.sources.length;
 button.addEventListener('click',event=>event.stopPropagation());
 click(button);
 assert.equal(f.sources.length,initial+1,'capturing root sees clicks before bubbling is stopped');
 const nested=f.dom.window.document.createElement('span');button.append(nested);
 click(nested);
 assert.equal(f.sources.length,initial+2,'icon/label inside a button is clickable');
 const popup=f.dom.window.document.createElement('div');
 const action=f.dom.window.document.createElement('button');popup.append(action);root.append(popup);
 click(action);assert.equal(f.sources.length,initial+3,'dynamically inserted popup button');
 const summary=f.dom.window.document.createElement('summary');root.append(summary);
 click(summary);assert.equal(f.sources.length,initial+4,'arena picker summary');
 const disabled=f.dom.window.document.createElement('button');disabled.disabled=true;root.append(disabled);
 click(disabled);assert.equal(f.sources.length,initial+4);
 const ariaDisabled=f.dom.window.document.createElement('button');ariaDisabled.setAttribute('aria-disabled','true');
 root.append(ariaDisabled);click(ariaDisabled);assert.equal(f.sources.length,initial+4);
 const foreign=f.dom.window.document.createElement('button');f.dom.window.document.body.append(foreign);
 click(foreign);assert.equal(f.sources.length,initial+4,'outside game stays silent');
 f.finish();
});
test('the first game-button click also unlocks and produces its cue',async()=>{
 const f=setup();const button=f.state.root.querySelector('#tag7hop-pause');
 button.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true}));
 await flush();
 assert.equal(f.context.state,'running');
 assert.equal(f.sources.filter(s=>s.frequency).length,1);
 f.finish();
});

test('pain samples map A/B to men and C/D to women, with all files selectable',()=>{
 const male=['manPain1','manPain2','manPain3'],female=['womanPain1','womanPain2','womanPain3','womanPain4','womanPain5','womanPain6','womanPain7'];
 for(const id of [0,1])assert.deepEqual(male.map((_,i)=>painSoundKey(id,(i+.5)/male.length)),male);
 for(const id of [2,3])assert.deepEqual(female.map((_,i)=>painSoundKey(id,(i+.5)/female.length)),female);
 assert.equal(painSoundKey(-1),null);assert.equal(painSoundKey(4),null);
});

test('injured patient plays an additional pain clip 100 ms after hit, crit and severing',async()=>{
 const f=setup();await f.unlock();
 const originalRandom=Math.random;
 try{
  Math.random=()=>0;
  f.context.currentTime=12;
  emitGameEvent('hit',{by:0,robot:2,damage:1});await flush();
  const impact=live(f.sources,'hit')[0],voice=live(f.sources,'womanPain1')[0];
  assert.ok(impact,'existing impact remains audible');
  assert.ok(voice,'C plays a female vocalisation');
  assert.deepEqual(impact.startArgs,[12]);
  assert.ok(Math.abs(voice.startArgs[0]-12.1)<1e-9);
  assert.equal(voice.playbackRate.value,playbackRate(2,-.2));
  f.context.currentTime=13;
  emitGameEvent('hit',{by:3,robot:0,damage:2});await flush();
  assert.equal(live(f.sources,'crit').length,1,'critical sound not replaced');
  assert.equal(live(f.sources,'manPain1').length,1,'injured A plays male sample');
  assert.ok(Math.abs(live(f.sources,'manPain1')[0].startArgs[0]-13.1)<1e-9);
  f.context.currentTime=14;
  emitGameEvent('segment-broken',{by:0,robot:1,damage:1});await flush();
  assert.equal(live(f.sources,'hit').length,2);
  assert.equal(live(f.sources,'detach1').length,1);
  assert.equal(live(f.sources,'manPain1').length,2);
 }finally{Math.random=originalRandom;f.finish();}
});

test('queued pain voices are cancelled on pause or next round without affecting sound buses',async()=>{
 const f=setup();await f.unlock();
 emitGameEvent('hit',{by:1,robot:3,damage:1});await flush();
 const voice=f.sources.find(s=>s.started&&String(s.buffer).includes('/woman_pain/'));
 assert.ok(voice);
 f.state.paused=true;f.audio.sync();assert.equal(voice.stopped,true);
 f.state.paused=false;f.state.startup.phase='betting';f.audio.sync();await flush();
 assert.equal(live(f.sources,'womanPain1').length,0);
 f.finish();
});
