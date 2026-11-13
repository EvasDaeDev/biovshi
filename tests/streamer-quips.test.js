import {JSDOM} from 'jsdom';
import {ROBOT_COLORS} from '../src/utils/colors.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createQuipSelector,quipCategory,quipFor,createSpeechPacer,renderQuip} from '../src/ui/streamer-quips.js';
import {createReactionTrack} from '../src/ui/streamer-mascot.js';
import {note} from '../src/game/events.js';
import {ctx} from '../src/game/state.js';
import {onGameEvent} from '../src/game/event-bus.js';

test('events map to independent editable categories',()=>{
 const cases=[
  [{type:'combat-start'},'start'],[{type:'streamer-idle'},'idle'],
  [{type:'hit'},'hit'],[{type:'hit',damage:2},'critical'],
  [{type:'segment-broken',segment:'arm-1'},'arm'],
  [{type:'segment-broken',segment:'leg-1'},'leg'],
  [{type:'segment-broken',segment:'head'},'detached'],
  [{type:'robot-immobilized',reason:'погиб'},'death'],
  [{type:'robot-immobilized',reason:'потерял сознание'},'knockout'],
  [{type:'combat-end',winner:0},'victory'],[{type:'combat-end',winner:null},'draw']
 ];
 const catalog=Object.fromEntries(cases.map(([,category])=>[category,[category]]));
 const select=createQuipSelector(catalog);
 for(const [event,category] of cases){assert.equal(quipCategory(event),category);assert.equal(select(event),category);}
 assert.equal(select({type:'unknown'}),'');
});

test('shuffled bags exhaust each category and never repeat across round resets',()=>{
 const event={type:'combat-end',winner:0},lines=['one','two','three','four'];
 for(const seed of [1,17,12345]){
  let state=seed;const random=()=>((state=(state*1664525+1013904223)>>>0)/2**32);
  const select=createQuipSelector({victory:lines,hit:['hit one','hit two']},random);
  const track=createReactionTrack();let previous=null;const orders=new Set();
  for(let round=0;round<20;round++){
   const cycle=[];
   for(let i=0;i<lines.length;i++){
    track.reset();track.offer(event);track.tick(.1);
    const line=select(track.tick(.1).event);
    assert.notEqual(line,previous);previous=line;cycle.push(line);
    select({type:'hit'}); // Other categories must not consume this bag.
   }
   assert.deepEqual([...cycle].sort(),[...lines].sort());orders.add(cycle.join(','));
  }
  assert.ok(orders.size>1);
 }
});

test('empty, missing, single and duplicate entries are safe',()=>{
 const select=createQuipSelector({hit:[],critical:['only'],victory:['same','same','other','',null,'  ']},()=>0);
 assert.equal(select({type:'hit'}),'');assert.equal(select({type:'streamer-idle'}),'');
 for(let i=0;i<5;i++)assert.equal(select({type:'hit',damage:2}),'only');
 let previous=null;for(let i=0;i<10;i++){
  const next=select({type:'combat-end',winner:0});assert.notEqual(next,previous);previous=next;
 }
 assert.equal(quipFor({robot:1},'{fighter} / {fighter}'),'B / B');
});

test('speech keeps the triggering event when important reactions replace a pending hit',()=>{
 const track=createReactionTrack();track.offer({type:'hit',to:0});
 track.offer({type:'segment-broken',robot:2,segment:'leg--1-lower'});
 track.offer({type:'hit',to:1});track.tick(.1);const played=track.tick(.1);
 assert.equal(played.event.robot,2);assert.equal(quipCategory(played.event),'leg');
 track.offer({type:'combat-end',winner:2});track.tick(.1);
 assert.deepEqual(track.tick(.1).event,{type:'combat-end',winner:2});
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
  const text=quipFor({type:'segment-broken',segment:'arm-1-upper',robot:id},'test {fighter}');
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
  const reaction=track.tick(.1);if(reaction&&reaction!==previous){lines.push(reaction.event);previous=reaction;}
 }
 assert.deepEqual(lines,[{type:'robot-immobilized',robot:1,reason:'погиб'},{type:'combat-end',winner:0}]);assert.equal(track.hasRequired(),false);
});

test('tower combat names remain intact and coloured safely in mandatory and casual lines',()=>{
 const dom=new JSDOM('<p></p>'),caption=dom.window.document.querySelector('p');
 for(const event of [
  {type:'hit',to:0,fighterName:'Лис <3'},
  {type:'robot-immobilized',robot:2,fighterName:'ИИ 2',reason:'потерял сознание'},
  {type:'combat-end',winner:0,fighterName:'Лис <3'}
 ]){
  const text=quipFor(event,'test {fighter}');renderQuip(caption,text,event);
  assert.equal(caption.textContent,text);
  assert.equal(caption.querySelector('.streamer-fighter').textContent,event.fighterName);
  assert.equal(caption.querySelectorAll('span').length,1);
 }
 assert.equal(quipFor({type:'combat-end',winner:0,fighterName:'Лис <3'},'{fighter}'),'Лис <3');
 dom.window.close();
});
