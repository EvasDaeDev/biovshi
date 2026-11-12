import {JSDOM} from 'jsdom';
import {ROBOT_COLORS} from '../src/utils/colors.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {STREAMER_QUIPS,quipFor,createSpeechPacer,renderQuip} from '../src/ui/streamer-quips.js';
import {createReactionTrack} from '../src/ui/streamer-mascot.js';
import {note} from '../src/game/events.js';
import {ctx} from '../src/game/state.js';
import {onGameEvent} from '../src/game/event-bus.js';

test('approved quips stay short, omit removed copy and use the affected fighter',()=>{
 const events=[{type:'combat-start'},{type:'hit',to:1},{type:'hit',to:1,damage:2},
  {type:'segment-broken',robot:1,segment:'arm--1-upper'},
  {type:'segment-broken',robot:1,segment:'leg-1-lower'},
  {type:'segment-broken',robot:1,segment:'head'},
  {type:'robot-immobilized',robot:1,reason:'потерял сознание'},
  {type:'robot-immobilized',robot:1,reason:'погиб'},
  {type:'combat-end',winner:1},{type:'combat-end',winner:null},{type:'streamer-idle'}];
 for(const event of events)for(let i=0;i<12;i++){
  const line=quipFor(event,i);assert.ok(line);assert.ok(line.match(/[\p{L}\p{N}]+/gu).length<=3,line);
  assert.doesNotMatch(line,/пациент|твоё|перезагрузка|рукопожатие|танцы|возврат|зато|пока живой|ломайтесь|обещанный хруст|обнимашки|— окончательно/iu);
 }
 assert.equal(quipFor(events[1]),'B, держи сдачу!');
 assert.equal(quipFor(events[3]),'B, ручкой помаши!');
 assert.equal(quipFor(events[4]),'B, ножку забыл!');
 assert.equal(quipFor(events[5]),'B теряет запчасти!');
 assert.equal(quipFor(events[6]),'B вышел!');
 assert.equal(quipFor(events[7],1),'B погиб!');
 assert.equal(quipFor(events[8]),'B победил!');
 assert.deepEqual(STREAMER_QUIPS.idle,['…скуучно.','Чего такие целые?']);
});

test('speech keeps the triggering event when important reactions replace a pending hit',()=>{
 const track=createReactionTrack();track.offer({type:'hit',to:0});
 track.offer({type:'segment-broken',robot:2,segment:'leg--1-lower'});
 track.offer({type:'hit',to:1});track.tick(.1);const played=track.tick(.1);
 assert.equal(quipFor(played.event),'C, ножку забыл!');
 track.offer({type:'combat-end',winner:2});track.tick(.1);
 assert.equal(quipFor(track.tick(.1).event),'C победил!');
});

test('battle events still reach subscribers and the log without central arena announcements',()=>{
 const oldGame=ctx.game,oldAccent=ctx.arenaAccent;
 const received=[];const off=onGameEvent(event=>received.push(event));
 try{
  ctx.game={time:7,events:[]};ctx.arenaAccent={flashes:[]};
  for(const type of ['combat-start','segment-broken','robot-immobilized','combat-end'])note(type,{robot:1,segment:'head',winner:0});
  assert.equal(received.length,4);assert.equal(ctx.game.events.length,4);
  assert.deepEqual(ctx.arenaAccent,{flashes:[]});
 }finally{off();ctx.game=oldGame;ctx.arenaAccent=oldAccent;}
});

test('speech pacing halves repeated comments and resets for a new round',()=>{
 const pacer=createSpeechPacer();let count=0;
 for(let i=0;i<10;i++){if(pacer.take(2))count++;pacer.tick(2);}
 assert.equal(count,5);
 pacer.reset();assert.equal(pacer.take(2),true);
 assert.equal(pacer.take(2),false);
});

test('only fighter letters receive their shared identity colour, with safe text rendering',()=>{
 const dom=new JSDOM('<p></p>'),caption=dom.window.document.querySelector('p');
 for(let id=0;id<4;id++){
  const text=quipFor({type:'segment-broken',segment:'arm-1-upper',robot:id},2);
  renderQuip(caption,text);
  assert.equal(caption.textContent,text);
  const name=caption.querySelector('.streamer-fighter');assert.ok(name);
  assert.equal(name.textContent,'ABCD'[id]);
  const expected=dom.window.document.createElement('span');expected.style.color=ROBOT_COLORS[id];
  assert.equal(name.style.color,expected.style.color);
 }
 renderQuip(caption,'Ой, отвалилось!');assert.equal(caption.children.length,0);
 renderQuip(caption,'<img src=x>');assert.equal(caption.querySelector('img'),null);
 dom.window.close();
});

test('mandatory announcements survive pause and are delivered before the winner',()=>{
 const track=createReactionTrack();
 track.offer({type:'robot-immobilized',robot:1,reason:'погиб'});track.tick(.1);track.tick(.1);
 for(let i=0;i<80;i++)track.tick(.1,false);
 assert.equal(track.hasRequired(),true);
 track.offer({type:'combat-end',winner:0});
 const lines=[];let previous=null;
 for(let i=0;i<60;i++){
  const reaction=track.tick(.1);if(reaction&&reaction!==previous){lines.push(quipFor(reaction.event));previous=reaction;}
 }
 assert.deepEqual(lines,['B погиб!','A победил!']);assert.equal(track.hasRequired(),false);
});

test('tower combat names remain intact and coloured safely in mandatory and casual lines',()=>{
 const dom=new JSDOM('<p></p>'),caption=dom.window.document.querySelector('p');
 for(const event of [
  {type:'hit',to:0,fighterName:'Лис <3'},
  {type:'robot-immobilized',robot:2,fighterName:'ИИ 2',reason:'потерял сознание'},
  {type:'combat-end',winner:0,fighterName:'Лис <3'}
 ]){
  const text=quipFor(event);renderQuip(caption,text,event);
  assert.equal(caption.textContent,text);
  assert.equal(caption.querySelector('.streamer-fighter').textContent,event.fighterName);
  assert.equal(caption.querySelectorAll('span').length,1);
 }
 assert.equal(quipFor({type:'combat-end',winner:0,fighterName:'Лис <3'}),'Лис <3 победил!');
 dom.window.close();
});
