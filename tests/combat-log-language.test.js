import test from 'node:test';
import assert from 'node:assert/strict';
import {combatLine} from '../src/ui/combat-log.js';
import {ctx} from '../src/game/state.js';

test('every stock combat-log variation masks coarse words while retaining the event and patient markup',()=>{
 const mode=ctx.mode,seed=ctx.seed;ctx.mode='spectator';ctx.seed=12345;
 try{
  const events=[
   {type:'hit',to:1,from:0,segment:'arm--1-upper',damage:1},
   {type:'hit',to:1,from:0,segment:'head',damage:2},
   {type:'segment-broken',robot:1,by:0,segment:'leg-1-lower',damage:1},
   {type:'segment-broken',robot:1,by:0,segment:'spine-1',damage:2},
   {type:'robot-immobilized',robot:1,reason:'погиб'},
   {type:'robot-immobilized',robot:1,reason:'потерял сознание'},
   {type:'robot-immobilized',robot:1,reason:'погиб',knockoutCause:'blood-loss'},
   {type:'combat-end',winner:0},
   {type:'combat-end',winner:null},
  ];
  const lines=new Set(events.flatMap(event=>Array.from({length:60},(_,n)=>combatLine({...event,time:n/10+.001}))));
  for(const line of lines){
   assert.doesNotMatch(line,/бляд(?:ь|и)|хренов[а-яё]*|пизд[а-яё]*|ёбан[а-яё]*|ебан[а-яё]*/iu);
   if(!line.startsWith('Ничья'))assert.match(line,/class="patient-name"/);
  }
  assert.ok([...lines].some(line=>line.includes('*****. А это ещё было нужно.')));
  assert.ok([...lines].some(line=>line.includes('******** день для здорового образа жизни.')));
  assert.equal(ctx.seed,12345,'wording never changes the simulation random sequence');
 }finally{ctx.mode=mode;ctx.seed=seed;}
});
