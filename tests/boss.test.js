import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {startBossScenario} from '../scripts/boss-harness.mjs';
import {ctx} from '../src/game/state.js';
import {CONFIG} from '../src/config.js';
import {BOSS_VARIANTS,BOSS_CONFIG} from '../src/boss/config.js';
import {ensureBossEncounter} from '../src/boss/encounter.js';
import {towerFor,validTower,towerEnemyCount,rewardTower,completeTower} from '../src/tower/model.js';
import {betNewSession} from '../src/betting/ledger.js';
import {bettingSave,bettingLoad} from '../src/betting/storage.js';
import {step} from '../src/game/loop.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';
import {pounceOpportunity,selectSimultaneousStrikes,strikeProgress} from '../src/systems/combat.js';
import {bossPortraitBones} from '../src/boss/card.js';
import {drawDetachedSkin} from '../src/render/robot-skin.js';
import {limbKey} from '../src/robot/body.js';

for(const variant of BOSS_VARIANTS)for(const arena of ['ward','ring','annulus'])test(`${variant.id} boss has independent geometry, atlas, supports and unique attack sources in ${arena}`,()=>{
 const f=startBossScenario({variant:variant.id,arena});
 try{
  const r=f.boss;assert.equal(ctx.robots.length,2);assert.ok(r.isBoss);assert.equal(r.scale,f.player.scale*1.5);assert.equal(ctx.scale,CONFIG.robot.scale);
  assert.equal(r.spineCount,variant.spineSegments);assert.equal(r.movementLimbs,variant.extra?6:4);assert.equal(r.limbIntegrity,1);
  assert.equal(r.hp.get('head'),12);assert.equal(r.hp.get('spine-'+(variant.spineSegments-1)),8);
  assert.equal(r.maxHp('arm--1-upper'),6);assert.equal(r.body.skinKey,'robotBoss0');
  assert.ok(r.capsules.every(c=>staticContacts(c).every(hit=>hit.depth<=(isLimb(c)?5:0)+1e-6)),'full boss rig starts inside arena');
  assert.equal(new Set(r.attackSources.map(s=>s.key)).size,r.attackSources.length);
  assert.equal(pounceOpportunity(r,f.player),false);
  const bones=bossPortraitBones(r.body);assert.equal(bones.length,r.segmentTotal);assert.ok(bones.every(b=>b.matrix.every(Number.isFinite)));
  assert.equal(ctx.svg.querySelectorAll('[data-skin-segment]').length,f.player.segmentTotal+r.segmentTotal);
  for(let n=0;n<120;n++)step(1/60);
  assert.ok(r.capsules.every(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r].every(Number.isFinite)));
  for(const l of r.limbs){
   const source=r.attackSources.find(s=>s.key===limbKey(l)+'-lower');
   const pose=r.attackPose({source:source.key,aim:{x:r.x+40,y:r.y+l.side*30},preview:true,started:ctx.game.time});assert.ok(pose,source.key);
   const expected=(l.kind==='arm'?27:32)*r.scale;assert.ok(Math.abs(Math.hypot(pose.joint.x-pose.shoulder.x,pose.joint.y-pose.shoulder.y)-expected)<1e-5);
  }
  // Shadows and live sprites must also cover every extended spine section.
  r.paint(0);assert.doesNotMatch(r.actor.outerHTML,/NaN|undefined/);
 }finally{f.close();}
});

test('boss ignores cumulative trauma, but head destruction still kills and pays exactly 100 once',()=>{
 const f=startBossScenario({variant:'arms'});
 try{
  const r=f.boss;
  for(const key of r.hp.keys())if(/^(arm|leg)-/.test(key))assert.equal(r.damage(key,0,3),true);
  assert.equal(r.trauma,0);assert.ok(r.mobile);assert.ok(r.hasHead);
  assert.equal(r.damage('head',0,100),true);assert.equal(r.mobile,false);assert.equal(r.unconscious,false);
  assert.equal(f.session.players[0].balance,1100);assert.equal(f.tower.runCoins,100);assert.equal(ctx.towerFloorCoins,100);
  assert.match(document.querySelector('#tower-reward-toast').textContent,/100/);assert.equal(rewardTower(f.session,0,1,0),false);
  bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.players[0].balance,1100);assert.equal(loaded.towerEarned,100);assert.ok(validTower(loaded.towers[0]));
 }finally{f.close();}
});

test('all six movement limbs must be lost before blood-loss countdown destroys a boss',()=>{
 const f=startBossScenario({variant:'legs'}),events=[];const off=onGameEvent(e=>{if(e.type==='robot-immobilized')events.push(e);});
 try{
  const r=f.boss,keys=r.limbs.map(l=>limbKey(l)+'-upper');
  for(const key of keys.slice(0,4))r.damage(key,0,100);
  assert.equal(r.movementLimbs,2);step(1/60);assert.equal(ctx.combat.unarmedDeadline[1],null);assert.equal(r.failFromOilLoss(),false);
  for(const key of keys.slice(4))r.damage(key,0,100);
  assert.equal(r.movementLimbs,0);step(1/60);const deadline=ctx.combat.unarmedDeadline[1];assert.ok(deadline>ctx.game.time);
  assert.ok(r.mobile);assert.equal(f.session.players[0].balance,1000);
  for(let i=0;i<16*60&&!ctx.combat.finished;i++)step(1/60);
  assert.equal(r.mobile,false);assert.equal(r.unconscious,false);assert.equal(r.knockoutCause,'blood-loss');assert.equal(r.hasHead,true);
  assert.equal(events.filter(e=>e.robot===1).length,1);assert.equal(events.find(e=>e.robot===1).reason,'погиб');assert.equal(ctx.combat.winner,0);
  assert.equal(f.session.players[0].balance,1100);assert.equal(f.tower.level,6);
 }finally{off();f.close();}
});

test('extra limbs sever independently and retain boss atlas mapping in detached pieces',()=>{
 const f=startBossScenario({variant:'arms'});
 try{
  const r=f.boss,key='arm--1-pair2-upper';assert.ok(r.damage(key,0,100));
  assert.equal(r.movementLimbs,5);assert.equal(r.hp.get('arm--1-upper'),6);
  const piece=ctx.combat.detached.at(-1).pieces.find(p=>p.key===key);assert.ok(piece.geometry);assert.ok(piece.skin.url.endsWith('boss/b_01.png'));assert.ok(piece.skin.part);
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');assert.ok(drawDetachedSkin(piece.skin,g));assert.equal(g.querySelector('svg').getAttribute('viewBox'),'0 128 64 64');
  // Severing the anchor also takes the secondary arm with it.
  ctx.game.time+=1;r.damage('spine-2',0,100);assert.equal(r.hp.get('arm-1-pair2-upper'),0);assert.equal(r.hp.get('spine-5'),0);
 }finally{f.close();}
});

test('boss card conceals stats with skulls, hides trauma and describes destruction accurately',()=>{
 const f=startBossScenario({variant:'long'});
 try{
  paintTelemetry();const c=ctx.cardNodes[1];assert.equal(c.card.dataset.boss,'true');assert.ok(c.trauma.hidden);assert.equal(c.strength.querySelectorAll('svg').length,1);assert.equal(c.speed.textContent,'');assert.match(c.card.textContent,/Босс · Длинный/);
  for(const n of [c.strength,c.speed,c.maneuver])assert.match(n.parentElement.dataset.hint,/неизвестны/);
  assert.ok(!ctx.cardNodes[0].trauma.hidden);assert.match(ctx.cardNodes[0].strength.textContent,/\d/);
  f.boss.damage('head',0,100);ctx.telemetryDirty=true;paintTelemetry();assert.equal(c.action.textContent,'Уничтожен');
 }finally{f.close();}
});

test('boss fallback handles every anatomy when texture loading fails',()=>{
 for(const {id} of BOSS_VARIANTS){const f=startBossScenario({variant:id,textured:false});try{f.boss.paint(0);assert.equal(f.boss.actor.querySelectorAll('[data-robot-fallback]').length,2);assert.doesNotMatch(f.boss.actor.outerHTML,/NaN|undefined/);}finally{f.close();}}
});

test('boss encounter survives serialization, rerolls only on the next boss floor and preserves old paid floors',()=>{
 const s=betNewSession(['Test'],100),t=towerFor(s,0);Object.assign(t,{level:5,wins:4,record:4,stats:[4,5,4]});
 const e=ensureBossEncounter(t,()=>.6),copy=JSON.parse(JSON.stringify(t));assert.deepEqual(ensureBossEncounter(copy,()=>0),e);assert.equal(towerEnemyCount(copy),1);
 completeTower(s,0,true);assert.equal(t.bossEncounter,undefined);
 Object.assign(t,{level:10,wins:9,stats:[6,6,6],record:9});assert.equal(ensureBossEncounter(t,()=>0).variant,'brute');
 const old=JSON.parse(JSON.stringify(t));delete old.bossEncounter;old.rewarded=[1,2];s.towers[0]=old;
 assert.equal(towerEnemyCount(towerFor(s,0)),6);assert.equal(old.legacyBossFloor,true);assert.equal(rewardTower(s,0,1,0),false);assert.equal(rewardTower(s,0,3,0),false,'preparing floors cannot pay');
 old.preparing=false;const before=s.players[0].balance;assert.equal(rewardTower(s,0,3,0),true);assert.equal(s.players[0].balance-before,10);
});

test('extra arms do not multiply simultaneous strikes on a single player; boss timing is slower',()=>{
 const candidates=['arm--1-lower','arm-1-lower','arm--1-pair2-lower'].map((key,i)=>({victim:{id:0},source:{kind:'arm',key},segment:'head',score:i}));
 assert.equal(selectSimultaneousStrikes(candidates).length,1);
 ctx.game.time=10;assert.equal(strikeProgress({started:9.6,timing:BOSS_CONFIG.combat}).phase,'windup');assert.equal(strikeProgress({started:9.6}).phase,'thrust');
});
