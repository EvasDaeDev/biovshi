import {activeOpponents} from '../src/systems/ai.js';
import {segmentDistance} from '../src/utils/math.js';
import {BOSS_NAMES,bossName} from '../src/boss/names.js';
import {BOSS_FLOOR_INTERVAL} from '../src/build-channel.js';
import {fighterLabel} from '../src/game/patients.js';
import {towerPreparation,updateTowerHud} from '../src/tower/ui.js';
import {paint} from '../src/render/frame.js';
import {bossStats} from '../src/boss/progression.js';
import {patientCombatStats} from '../src/game/patients.js';
import {bossDamage} from '../src/boss/attacks.js';
import {statMultiplier,critChance} from '../src/garage/model.js';
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
import {pounceContactSegment,pounceOpportunity,selectSimultaneousStrikes,strikeProgress} from '../src/systems/combat.js';
import {bossPortraitBones} from '../src/boss/card.js';
import {drawDetachedSkin} from '../src/render/robot-skin.js';
import {limbKey} from '../src/robot/body.js';
import {bossOpponentMemory,bossSideWeaponIntent,bossNeedsShortRange,isBossStump} from '../src/boss/positioning.js';
import {chargePlan} from '../src/boss/attacks.js';

for(const variant of BOSS_VARIANTS)for(const arena of variant.spineSegments>6?['columns']:['ward','ring','annulus'])test(`${variant.id} boss has independent geometry, atlas, supports and unique attack sources in ${arena}`,()=>{
 const f=startBossScenario({variant:variant.id,arena});
 try{
  const r=f.boss;assert.equal(ctx.robots.length,4);assert.ok(r.isBoss);assert.equal(r.scale,f.player.scale*1.5);assert.equal(ctx.scale,CONFIG.robot.scale);
  const head=r.capsules.filter(c=>c.segment==='head'),normalHead=f.player.capsules.filter(c=>c.segment==='head');
  head.forEach((c,i)=>assert.ok(Math.abs(c.r-normalHead[i].r)<1e-9));
  assert.ok(Math.abs(Math.hypot(head[1].a.x-head[0].a.x,head[1].a.y-head[0].a.y)-14*f.player.scale)<1e-9);
  const {chest,headMotion}=r.actualPose,pivot={x:chest.x+Math.cos(chest.angle)*14*r.scale,y:chest.y+Math.sin(chest.angle)*14*r.scale};
  assert.ok(Math.abs(Math.hypot(r.eye.x-pivot.x,r.eye.y-pivot.y)-(4+headMotion)*r.scale)<1e-9,'head sits next to the shoulder pivot');
  const outer={x:head[0].a.x-Math.sin(r.angle)*15*f.player.scale,y:head[0].a.y+Math.cos(r.angle)*15*f.player.scale};
  assert.equal(pounceContactSegment(outer,outer,head,()=>true,0),null,'old outer head area no longer takes hits');
  assert.equal(pounceContactSegment(head[0].a,head[0].a,head,()=>true,0),'head');
  assert.equal(r.spineCount,variant.spineSegments);assert.equal(r.movementLimbs,variant.extra?6:4);assert.equal(r.limbIntegrity,1);
  assert.equal(r.hp.get('head'),12);assert.equal(r.hp.get('spine-'+(variant.spineSegments-1)),8);
  assert.equal(r.maxHp('arm--1-upper'),5);assert.equal(r.body.skinKey,'robotBoss0');
  assert.ok(r.capsules.every(c=>staticContacts(c).every(hit=>hit.depth<=(isLimb(c)?5:0)+1e-6)),'full boss rig starts inside arena');
  for(const robot of ctx.robots)assert.ok(robot.capsules.every(c=>staticContacts(c).every(hit=>hit.depth<=(isLimb(c)?5:0)+1e-6)),'every participant starts clear of static surfaces');
  const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
  for(let i=0;i<ctx.robots.length;i++)for(let j=i+1;j<ctx.robots.length;j++)
   for(const a of ctx.robots[i].capsules.filter(solid))for(const b of ctx.robots[j].capsules.filter(solid))assert.ok(segmentDistance(a.a,a.b,b.a,b.b)>=a.r+b.r+.15-1e-6,'initial bodies do not overlap');

  assert.equal(new Set(r.attackSources.map(s=>s.key)).size,r.attackSources.length);
  assert.equal(pounceOpportunity(r,f.player),false);
  const bones=bossPortraitBones(r.body);assert.equal(bones.length,r.segmentTotal);assert.ok(bones.every(b=>b.matrix.every(Number.isFinite)));
  assert.equal(ctx.svg.querySelectorAll('[data-skin-segment]').length,ctx.robots.reduce((sum,robot)=>sum+robot.segmentTotal,0));
  for(let n=0;n<120;n++)step(1/60);
  assert.ok(r.capsules.every(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r].every(Number.isFinite)));
  for(const l of r.limbs){
   const source=r.attackSources.find(s=>s.key===limbKey(l)+'-lower');
   const pose=r.attackPose({source:source.key,aim:{x:r.x+40,y:r.y+l.side*30},preview:true,started:ctx.game.time});assert.ok(pose,source.key);
   const expected=(l.kind==='arm'?27:32)*r.scale;assert.ok(Math.abs(Math.hypot(pose.joint.x-pose.shoulder.x,pose.joint.y-pose.shoulder.y)-expected)<1e-5);
  }
  // Shadows and live sprites must also cover every extended spine section.
  r.paint(0);assert.doesNotMatch(r.actor.outerHTML,/NaN|undefined/);
  const matrix=actor=>actor.querySelector('[data-skin-segment="head"]').getAttribute('transform').match(/matrix\(([^)]+)\)/)[1].split(/\s+/).map(Number);
  f.player.paint(0);const hm=matrix(r.actor),nm=matrix(f.player.actor);
  assert.ok(Math.abs(Math.hypot(hm[0],hm[1])/Math.hypot(nm[0],nm[1])-1)<1e-9,'head texture matches ordinary head');
  const portrait=bossPortraitBones(r.body).find(b=>b.key==='head');assert.ok(Math.abs(portrait.b.x-portrait.a.x-20/1.5)<1e-9);
  assert.equal((portrait.a.x+portrait.b.x)/2,18);

 }finally{f.close();}
});

test('long combined bosses spawn safely with several independent arena seeds',()=>{
 const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
 for(const variant of ['long_legs','long_arms'])for(const seed of [3,37,251]){
  const f=startBossScenario({variant,arena:'columns',floor:variant==='long_legs'?25:30,seed});
  try{
   assert.equal(f.boss.spineSegmentTotal,8);
   assert.equal(f.boss.limbs.length,6);
   for(const robot of ctx.robots){
    assert.ok(robot.capsules.every(c=>staticContacts(c).every(h=>h.depth<=(isLimb(c)?5:0)+1e-6)),
     variant+' seed '+seed+' initially intersects the arena');
   }
   for(let i=0;i<ctx.robots.length;i++)for(let j=i+1;j<ctx.robots.length;j++)
    for(const a of ctx.robots[i].capsules.filter(solid))
     for(const b of ctx.robots[j].capsules.filter(solid))
      assert.ok(segmentDistance(a.a,a.b,b.a,b.b)>=a.r+b.r+.15-1e-6,
       variant+' seed '+seed+' starts with overlapping bodies');
   for(let tick=0;tick<90;tick++)step(1/60);
   assert.ok(f.boss.capsules.every(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r].every(Number.isFinite)),
    variant+' seed '+seed+' produced non-finite physics');
  }finally{f.close();}
 }
});

test('boss ignores cumulative trauma, but head destruction still kills and pays exactly 750 once',()=>{
 const f=startBossScenario({variant:'arms'});
 try{
  const r=f.boss;
  for(const key of r.hp.keys())if(/^(arm|leg)-/.test(key))assert.equal(r.damage(key,0,3),true);
  assert.equal(r.trauma,0);assert.ok(r.mobile);assert.ok(r.hasHead);
  assert.equal(r.damage('head',0,100),true);assert.equal(r.mobile,false);assert.equal(r.unconscious,false);
  assert.equal(f.session.players[0].balance,1750);assert.equal(f.tower.runCoins,750);assert.equal(ctx.towerFloorCoins,750);
  assert.match(document.querySelector('#tower-reward-toast').textContent,/750/);assert.equal(rewardTower(f.session,0,1,0),false);
  bettingSave();const loaded=bettingLoad();assert.ok(loaded);assert.equal(loaded.players[0].balance,1750);assert.equal(loaded.towerEarned,750);assert.ok(validTower(loaded.towers[0]));
 }finally{f.close();}
});

test('all six movement limbs must be lost before blood-loss countdown destroys a boss',()=>{
 const f=startBossScenario({variant:'legs'}),events=[];const off=onGameEvent(e=>{if(e.type==='robot-immobilized')events.push(e);});
 try{
  for(const extra of ctx.robots.slice(2))extra.damage('head',1,100);
  const r=f.boss,keys=r.limbs.map(l=>limbKey(l)+'-upper');
  for(const key of keys.slice(0,4))r.damage(key,0,100);
  assert.equal(r.movementLimbs,2);step(1/60);assert.equal(ctx.combat.unarmedDeadline[1],null);assert.equal(r.failFromOilLoss(),false);
  for(const key of keys.slice(4))r.damage(key,0,100);
  assert.equal(r.movementLimbs,0);step(1/60);const deadline=ctx.combat.unarmedDeadline[1];assert.ok(deadline>ctx.game.time);
  assert.ok(r.mobile);assert.equal(f.session.players[0].balance,1000);
  for(let i=0;i<16*60&&!ctx.combat.finished;i++)step(1/60);
  assert.equal(r.mobile,false);assert.equal(r.unconscious,false);assert.equal(r.knockoutCause,'blood-loss');assert.equal(r.hasHead,true);
  assert.equal(events.filter(e=>e.robot===1).length,1);assert.equal(events.find(e=>e.robot===1).reason,'погиб');assert.equal(ctx.combat.winner,0);
  assert.equal(f.session.players[0].balance,1750);assert.equal(f.tower.level,6);
 }finally{off();f.close();}
});

test('extra limbs sever independently and retain boss atlas mapping in detached pieces',()=>{
 const f=startBossScenario({variant:'arms'});
 try{
  const r=f.boss,key='arm--1-pair2-upper';assert.ok(r.damage(key,0,100));
  assert.equal(r.movementLimbs,5);assert.equal(r.hp.get('arm--1-upper'),5);
  const piece=ctx.combat.detached.at(-1).pieces.find(p=>p.key===key);assert.ok(piece.geometry);assert.ok(piece.skin.url.endsWith('boss/b_01.png'));assert.ok(piece.skin.part);
  const g=document.createElementNS('http://www.w3.org/2000/svg','g');assert.ok(drawDetachedSkin(piece.skin,g));assert.equal(g.querySelector('svg').getAttribute('viewBox'),'0 128 64 64');
  // Severing the anchor also takes the secondary arm with it.
  ctx.game.time+=1;r.damage('spine-2',0,100);assert.equal(r.hp.get('arm-1-pair2-upper'),0);assert.equal(r.hp.get('spine-5'),0);
 }finally{f.close();}
});

test('charge rejection diagnostics leave the selected boss plan unchanged',()=>{
 for(const variant of ['legs','long_legs','long_arms']){
  const f=startBossScenario({variant,arena:'columns',floor:variant==='long_legs'?25:variant==='long_arms'?30:15});
  try{
   const boss=f.boss,targets=[
    {...f.player.center},
    {x:boss.x+120*Math.cos(boss.angle),y:boss.y+120*Math.sin(boss.angle)}
   ];
   for(const target of targets){
    const clean=chargePlan(boss,target),reasons={};
    const observed=chargePlan(boss,target,{diagnostics:reasons});
    assert.deepEqual(observed,clean,'optional instrumentation must not change the charge plan');
    assert.ok(Object.values(reasons).every(n=>Number.isInteger(n)&&n>0));
   }
  }finally{f.close();}
 }
});

test('extended bosses use surviving rear limbs after both front arms are severed',()=>{
 for(const variant of ['long_legs','long_arms']){
  const f=startBossScenario({variant,arena:'columns',floor:variant==='long_legs'?25:30,seed:23});
  try{
   const boss=f.boss;
   for(const arm of ['arm--1-upper','arm-1-upper'])
    assert.equal(boss.damage(arm,0,100),true);
   assert.equal(boss.spineSegmentTotal,8);
   assert.equal(boss.attackSources.some(s=>s.kind==='arm'&&!s.key.includes('pair2')),false);
   const remaining=boss.attackSources.filter(s=>s.kind==='arm'||s.kind==='leg');
   assert.ok(remaining.length>=4,'surviving limbs remain available to attack');
   if(variant==='long_arms')
    assert.ok(remaining.some(s=>s.kind==='arm'&&s.key.includes('pair2')));
   else assert.ok(remaining.filter(s=>s.kind==='leg').length>=4);
   const memory=bossOpponentMemory(boss.body.behavior.state,f.player.id);
   const intent=bossSideWeaponIntent(boss,f.player,memory);
   assert.ok(intent,'boss should retain a side-on limb-based engagement stance');
   assert.equal(Number.isFinite(intent.heading),true);
   assert.doesNotMatch(intent.mode,/^преследует$/,'do not regress to head-first pursuit');
   for(let i=0;i<90;i++)step(1/60);
   assert.ok(boss.capsules.every(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r].every(Number.isFinite)));
  }finally{f.close();}
 }
});

test('boss card conceals stats with skulls, hides trauma and describes destruction accurately',()=>{
 const f=startBossScenario({variant:'long'});
 try{
  paintTelemetry();const c=ctx.cardNodes[1];assert.equal(c.card.dataset.boss,'true');assert.ok(c.trauma.hidden);assert.equal(c.strength.querySelectorAll('svg').length,1);assert.equal(c.speed.textContent,'');assert.match(c.card.textContent,/Босс · Потрошитель/);
  for(const n of [c.strength,c.speed,c.maneuver])assert.match(n.parentElement.dataset.hint,/неизвестны/);
  assert.ok(!ctx.cardNodes[0].trauma.hidden);assert.match(ctx.cardNodes[0].strength.textContent,/\d/);
  f.boss.damage('head',0,100);ctx.telemetryDirty=true;paintTelemetry();assert.equal(c.action.textContent,'Уничтожен');
 }finally{f.close();}
});

test('boss fallback handles every anatomy when texture loading fails',()=>{
 for(const {id,spineSegments} of BOSS_VARIANTS){const f=startBossScenario({variant:id,arena:spineSegments>6?'columns':'ward',textured:false});try{f.boss.paint(0);assert.equal(f.boss.actor.querySelectorAll('[data-robot-fallback]').length,2);assert.doesNotMatch(f.boss.actor.outerHTML,/NaN|undefined/);}finally{f.close();}}
});

test('boss encounter survives serialization, rerolls only on the next boss floor and preserves old paid floors',()=>{
 const s=betNewSession(['Test'],100),t=towerFor(s,0);Object.assign(t,{level:5,wins:4,record:4,stats:[4,5,4]});
 const e=ensureBossEncounter(t,()=>.6),copy=JSON.parse(JSON.stringify(t));assert.deepEqual(ensureBossEncounter(copy,()=>0),e);assert.equal(towerEnemyCount(copy),3);
 completeTower(s,0,true);assert.equal(t.bossEncounter,undefined);
 Object.assign(t,{level:10,wins:9,stats:[6,6,6],record:9});assert.equal(ensureBossEncounter(t,()=>0).variant,'long');
 const old=JSON.parse(JSON.stringify(t));delete old.bossEncounter;old.rewarded=[1,2];s.towers[0]=old;
 assert.equal(towerEnemyCount(towerFor(s,0)),6);assert.equal(old.legacyBossFloor,true);assert.equal(rewardTower(s,0,1,0),false);assert.equal(rewardTower(s,0,3,0),false,'preparing floors cannot pay');
 old.preparing=false;const before=s.players[0].balance;assert.equal(rewardTower(s,0,3,0),true);assert.equal(s.players[0].balance-before,100);
});

test('extra arms do not multiply simultaneous strikes on a single player; boss timing matches ordinary patients',()=>{
 const candidates=['arm--1-lower','arm-1-lower','arm--1-pair2-lower'].map((key,i)=>({victim:{id:0},source:{kind:'arm',key},segment:'head',score:i}));
 assert.equal(selectSimultaneousStrikes(candidates).length,1);
 ctx.game.time=10;assert.equal(strikeProgress({started:9.6,timing:BOSS_CONFIG.combat}).phase,'thrust');assert.equal(strikeProgress({started:9.6}).phase,'thrust');
});


test('successive bosses gain two points per stat, apply ordinary effects and do not stack on reload',()=>{
 for(const [floor,points] of [[5,3],[10,5],[15,7],[20,9],[25,11]]){
  const expected=[points,points,points];assert.deepEqual(bossStats(floor),expected);
  for(let load=0;load<2;load++){
   const f=startBossScenario({floor});try{
    assert.deepEqual(ctx.towerGarage[1].stats,expected);
    assert.deepEqual(patientCombatStats(1,f.boss).effective,expected);
    assert.equal(f.boss.locomotion,.85);assert.equal(f.boss.turnAbility,.75);
    assert.equal(f.boss.maxHp('head'),12);assert.equal(f.boss.body.headSizeFactor,1/1.5);
    const critical=Math.max(.30,critChance(points));
    assert.equal(bossDamage(critical-1e-6,points),2);assert.equal(bossDamage(critical,points),1);
    if(points>3)assert.ok(statMultiplier(points)>statMultiplier(3));
   }finally{f.close();}
  }
 }
});

test('all boss strike styles share patient timing and a 0.9-second start interval',()=>{
 const {windupSec,thrustSec,recoverSec,attackCooldownSec}=CONFIG.combat;
 assert.deepEqual(BOSS_CONFIG.combat,{windupSec,thrustSec,recoverSec,attackCooldownSec});
 for(const style of ['first','second','sweep']){
  assert.deepEqual(BOSS_CONFIG.tactics[style],{windupSec,thrustSec,recoverSec});
  for(const pause of ['followupDelay','seriesRest'])assert.ok(Math.abs(windupSec+thrustSec+recoverSec+BOSS_CONFIG.tactics[pause]-attackCooldownSec)<1e-9);
 }
});


test('boss names follow the exact list, repeat with increasing suffixes and reset by floor',()=>{
 assert.deepEqual(BOSS_NAMES,['Потрошитель','Костолом','Гниломорд','Мясоруб','Хряп','Кадавр','Шрамыч','Костогрыз','Недодел','Живодёр','Трупоед','Перешив']);
 const seen=new Set();
 for(let ordinal=1;ordinal<=36;ordinal++){
  const cycle=Math.floor((ordinal-1)/12)+1,expected=BOSS_NAMES[(ordinal-1)%12]+(cycle>1?' '+cycle:'');
  const name=bossName(ordinal*BOSS_FLOOR_INTERVAL);assert.equal(name,expected);assert.ok(!seen.has(name));seen.add(name);
 }
 assert.equal(bossName(BOSS_FLOOR_INTERVAL),'Потрошитель');
});

test('named boss announcement, card, arena label and combat identity survive saved encounter reload',()=>{
 for(const variant of ['brute','legs']){
  const f=startBossScenario({floor:65,variant});try{
   assert.equal(f.boss.bossName,'Потрошитель 2');assert.equal(fighterLabel(1),'Босс · Потрошитель 2');
   const encounter=JSON.parse(JSON.stringify(f.tower));assert.equal(bossName(ensureBossEncounter(encounter,()=>.99).floor),'Потрошитель 2');
   towerPreparation();const title=document.querySelector('#tower-prep-title');
   assert.equal(title.textContent,'БОСС · Потрошитель 2 · ЭТАЖ №B-05');assert.ok(title.classList.contains('boss-floor-title'));
   document.querySelector('#tower-fight').click();updateTowerHud();paint();
   assert.match(ctx.status.textContent,/Потрошитель 2 · ЭТАЖ №B-05/);assert.ok(ctx.status.classList.contains('boss-floor-badge'));
   assert.match(ctx.cardNodes[1].card.textContent,/Потрошитель 2/);assert.equal(f.boss.label.textContent,'Потрошитель 2');
   assert.doesNotMatch(document.querySelector('#tower-wallet').textContent,/Потрошитель/);
  }finally{f.close();}
 }
 const f=startBossScenario({floor:3,ordinary:true});try{
  towerPreparation();paint();assert.equal(document.querySelector('#tower-prep-title').classList.contains('boss-floor-title'),false);assert.equal(ctx.status.classList.contains('boss-floor-badge'),false);
 }finally{f.close();}
});


test('boss floor is a four-way free-for-all and pays 750 for boss, 100 for a patient, nothing for other killers',()=>{
 const f=startBossScenario({variant:'arms',arena:'ring'});
 try{
  assert.equal(ctx.robots.length,4);assert.equal(ctx.robots.filter(r=>r.isBoss).length,1);
  for(const robot of ctx.robots)assert.deepEqual(activeOpponents(robot.id).map(r=>r.id),[0,1,2,3].filter(id=>id!==robot.id));
  ctx.robots[1].damage('head',0,100);step(1/60);
  assert.equal(f.session.players[0].balance,1750);assert.equal(ctx.combat.finished,false,'the two ordinary patients keep the floor running');
  ctx.robots[2].damage('head',3,100);assert.equal(f.session.players[0].balance,1750);
  ctx.robots[3].damage('head',0,100);step(1/60);
  assert.equal(f.session.players[0].balance,1850);assert.equal(ctx.combat.finished,true);assert.equal(ctx.combat.winner,0);
  assert.equal(f.tower.artifacts.pieces.length,1);assert.equal(ctx.towerOutcome.floorCoins,850);
 }finally{f.close();}
});


test('boss switches to kicks and periodic short-range stump approaches when both forearms are lost',()=>{
 const f=startBossScenario({variant:'brute',arena:'ward'});
 try{
  const boss=f.boss,memory=bossOpponentMemory(boss.body.behavior.state,f.player.id);
  assert.equal(bossNeedsShortRange(boss),false,'intact arms use ordinary spacing');
  for(const key of ['arm--1-lower','arm-1-lower'])assert.equal(boss.damage(key,0,100),true);
  const stumps=boss.attackSources.filter(isBossStump);
  assert.equal(stumps.length,2,'both upper arms remain attack-capable');
  assert.equal(bossNeedsShortRange(boss),true);
  const first=bossSideWeaponIntent(boss,f.player,memory);
  assert.ok(first,'amputated boss still has a tactical approach');
  assert.match(first.mode,/ног|удар/,'kicks remain the initial priority');
  ctx.game.time+=BOSS_CONFIG.tactics.positionCommitSec*2+.01;
  bossSideWeaponIntent(boss,f.player,memory);
  ctx.game.time+=BOSS_CONFIG.tactics.positionCommitSec*2+.01;
  const close=bossSideWeaponIntent(boss,f.player,memory);
  assert.ok(close,'periodic stump phase must not stall');
  assert.match(close.mode,/культ/,'stump phase must actively close to physical contact');
  assert.equal(Number.isFinite(close.heading),true);
  assert.ok(close.goal&&Number.isFinite(close.goal.x)&&Number.isFinite(close.goal.y));
 }finally{f.close();}
});

test('one remaining full arm prevents premature stump-only stance',()=>{
 const f=startBossScenario({variant:'brute',arena:'ward'});
 try{
  const boss=f.boss;
  assert.equal(boss.damage('arm-1-lower',0,100),true);
  assert.equal(boss.attackSources.some(isBossStump),true);
  assert.equal(bossNeedsShortRange(boss),false);
  assert.equal(bossSideWeaponIntent(boss,f.player,bossOpponentMemory(boss.body.behavior.state,f.player.id)),null);
 }finally{f.close();}
});
