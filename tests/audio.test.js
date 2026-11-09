import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createAudio,loadAudioSettings,playbackRate} from '../src/audio/audio.js';
import {emitGameEvent} from '../src/game/event-bus.js';
import {ASSETS} from '../src/assets/manifest.js';

const flush=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function setup(){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://audio.test/'});
 const sources=[],gains=[];
 const context={state:'suspended',destination:{},resume(){this.state='running';return Promise.resolve();},
  createGain(){const gain={gain:{value:1},connect(){},disconnect(){}};gains.push(gain);return gain;},
  createBufferSource(){const source={playbackRate:{value:1},connect(node){this.gain=node;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(source);return source;}};
 const state={root:dom.window.document.querySelector('#robot-tag-hops-v22'),startup:{phase:'running'},paused:false,combat:{finished:false,unarmedDeadline:[null,null]},robots:[{id:0,visible:true,mobile:true},{id:1,visible:true,mobile:true}]};
 const target=new EventTarget();
 const audio=createAudio({state,storage:dom.window.localStorage,eventTarget:target,contextFactory:()=>context,bufferLoader:async(_context,path)=>path});
 return {audio,state,sources,gains,dom,unlock:async()=>{target.dispatchEvent(new Event('pointerdown'));await flush();},finish(){audio.dispose();dom.window.close();}};
}
const live=(sources,key)=>sources.filter(s=>s.started&&!s.stopped&&s.buffer===ASSETS.sounds[key]);

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

test('music loops through pause; crawling stops on unconsciousness and every loop stops at combat end',async()=>{
 const f=setup();await f.unlock();const music=live(f.sources,'music')[0];assert.ok(music.loop);assert.equal(music.playbackRate.value,1);
 f.state.combat.unarmedDeadline[0]=10;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1);assert.ok(live(f.sources,'crawl')[0].loop);
 f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1,'one loop per patient');
 f.state.paused=true;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,0);assert.equal(music.stopped,undefined);
 f.state.paused=false;f.audio.sync();await flush();assert.equal(live(f.sources,'crawl').length,1);
 f.state.robots[0].mobile=false;f.audio.sync();assert.equal(live(f.sources,'crawl').length,0);
 f.state.combat.finished=true;emitGameEvent('combat-end',{winner:1});await flush();assert.ok(music.stopped);assert.equal(live(f.sources,'victory').length,1);assert.equal(live(f.sources,'victory')[0].loop,false);
 f.state.startup.phase='betting';f.audio.sync();assert.equal(live(f.sources,'victory').length,0);
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
