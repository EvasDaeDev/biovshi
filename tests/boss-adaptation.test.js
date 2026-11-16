import test from 'node:test';
import assert from 'node:assert/strict';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {step} from '../src/game/loop.js';
import {BOSS_VARIANTS} from '../src/boss/config.js';
import {bossOpponentMemory,observeBossOpponent,chooseBossStance,bossPositionIntent} from '../src/boss/positioning.js';

test('retreat observations persist for a fight and update without reading controller input',()=>{
 const f=startBossScenario({variant:'brute',floor:10,arena:'ring'});try{
  const b=f.boss,m=bossOpponentMemory(b.body.behavior.state,0);
  const fake={id:0,x:b.x+110,y:b.y,center:{x:b.x+110,y:b.y},velocity:{x:65,y:0}};
  for(let i=0;i<35;i++)observeBossOpponent(b,fake,m,i*.1);
  assert.ok(m.retreatPressure>2.2);
  const next=bossOpponentMemory(b.body.behavior.state,0);
  assert.strictEqual(next,m);
  assert.ok(chooseBossStance(b,fake,m)===null||['arm','leg'].includes(chooseBossStance(b,fake,m).kind));
 }finally{f.close();}
});

// Run deterministic actual-physics smoke scenarios at every requested
// difficulty tier, with every boss anatomy. They are not human playtests.
for(const floor of [5,10,20])for(const variant of BOSS_VARIANTS){
 test('adaptive boss stays finite with damaged limbs: '+variant.id+' floor '+floor,()=>{
  const f=startBossScenario({variant:variant.id,floor,arena:'ring'});try{
   const b=f.boss;
   for(const source of b.attackSources.filter(s=>s.kind==='arm')){
    b.damage(source.key.replace(/-(lower|upper)$/,'-upper'),0,100);
   }
   for(let i=0;i<90&&!ctx.combat.finished;i++){
    if(i%6===0){
     const dx=f.player.x-b.x,dy=f.player.y-b.y,d=Math.hypot(dx,dy)||1;
     ctx.towerInput={x:dx/d,y:dy/d}; // retreat from the boss
    }
    step(1/60);
    assert.ok(Number.isFinite(b.x)&&Number.isFinite(b.y)&&Number.isFinite(b.angle));
    assert.ok(b.capsules.every(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r].every(Number.isFinite)));
   }
   assert.ok(b.body.behavior.state.tacticsByTarget);
   assert.ok(b.attackSources.every(s=>s.kind!=='arm'));
  }finally{f.close();}
 });
}

test('armless boss keeps its leg facing while opponent retreats beyond old 118cm limit',()=>{
 const f=startBossScenario({variant:'brute',floor:20,arena:'ring'});try{
  const b=f.boss;
  for(const s of b.attackSources.filter(s=>s.kind==='arm'))b.damage(s.key.replace(/-(lower|upper)$/,'-upper'),0,100);
  b.body.behavior.state.nextChargeAt=1e6;
  const memory=bossOpponentMemory(b.body.behavior.state,0);
  for(const d of [100,130,160,210]){
   const enemy={id:0,x:b.x+d,y:b.y,center:{x:b.x+d,y:b.y},
    velocity:{x:50,y:0}};
   const intent=bossPositionIntent(b,enemy,memory,d);
   assert.ok(intent, 'no direct-chase fallback at '+d+' cm');
   assert.ok(['разворачивает ноги','сближается для удара ногой','готовит удар','ищет сектор для удара ногой'].includes(intent.mode),intent.mode);
   assert.ok(Math.abs(Math.atan2(Math.sin(intent.heading),Math.cos(intent.heading)))>.7,
    'side posture is not a head-first dash');
  }
 }finally{f.close();}
});

test('armless boss physically starts turning away from head-first pursuit',()=>{
 const f=startBossScenario({variant:'brute',floor:10,arena:'ring'});try{
  const b=f.boss;for(const s of b.attackSources.filter(s=>s.kind==='arm'))b.damage(s.key.replace(/-(lower|upper)$/,'-upper'),0,100);
  b.body.behavior.state.nextChargeAt=1e6;
  // Face a known, visible opponent for a deliberately simple regression.
  const enemy=f.player,desired={x:b.x+100,y:b.y};
  const oldAngle=b.angle;
  const memory=bossOpponentMemory(b.body.behavior.state,0);
  const i=bossPositionIntent(b,{id:0,x:desired.x,y:desired.y,center:desired,velocity:{x:0,y:0}},memory,0);
  assert.ok(i);
  assert.notEqual(i.mode,'преследует');
  for(let n=0;n<30;n++)b.tick(1/60,i);
  assert.ok(Math.abs(Math.atan2(Math.sin(b.angle-oldAngle),Math.cos(b.angle-oldAngle)))>.05,
   'a turning instruction must actually rotate the robot body');
 }finally{f.close();}
});
