// Reproducible headless tower fights, not a substitute for human playtesting.
// Uses the actual arena, AI, locomotion, collision and combat step(1/60).
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {installTowerUI} from '../src/tower/ui.js';
import {advanceStartup} from '../src/game/session.js';
import {step} from '../src/game/loop.js';
import {ctx} from '../src/game/state.js';
import {onGameEvent} from '../src/game/event-bus.js';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor} from '../src/tower/model.js';
import {ensureTowerFloorPlan} from '../src/tower/floors.js';
import {towerRelationPlan,towerAllies} from '../src/tower/relations.js';
import {towerCycleWins} from '../src/tower/cycles.js';
import {earnedStats} from '../src/garage/model.js';
import {towerRarityScenario} from '../src/tower/rarity-scenarios.js';
import {towerMutationBonus,towerMutationCombatBonus} from '../src/tower/mutations.js';
import {patientCombatStats} from '../src/game/patients.js';
import {towerFighterCombatBonus} from '../src/systems/combat.js';
import {BOSS_CONFIG,bossVariantForFloor} from '../src/boss/config.js';
import {staticContacts,isLimb} from '../src/systems/surface-contact.js';
import {segmentDistance,wrap} from '../src/utils/math.js';
import {sightClear} from '../src/systems/collision.js';
import {chargePlan} from '../src/boss/attacks.js';
import {captureTowerBattleSample,diagnoseLongTowerFight} from './tower-battle-analysis.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(x=>x.replace(/^--/,'').split('=')));
const samples=Number(args.seeds??1),seconds=Number(args.limit??35),offset=Number(args.offset??19274);
const out=args.out??'artifacts/tower-fights.json';
const policy=args.policy??'approach';
const selectedFloors=args.floors?.split(',').map(Number)??null;
const bossBench=args.bossBench==='true';
const naturalBoss=args.naturalBoss==='true';
const cycleTactics=args.cycleTactics==='true';
const rarityCompare=args.rarityCompare==='true';
const rarityStep=Number(args.rarityStep??0);
const diagnose=args.diagnose==='true';
const maxAllowedBodyOverlapCm=Number(args.maxOverlapCm??2);
if(!['approach','orbit','idle','evade'].includes(policy))throw Error('Invalid policy');
if(rarityCompare&&!([0,.08,.1,.12].includes(rarityStep))||
   !rarityCompare&&args.rarityStep!==undefined)throw Error('Invalid H8 rarity switch');
if(!Number.isFinite(maxAllowedBodyOverlapCm)||maxAllowedBodyOverlapCm<0)throw Error('Invalid maximum body overlap');
if(!Number.isInteger(samples)||samples<1||samples>(naturalBoss?60:20)||!Number.isInteger(seconds)||seconds<5||seconds>180)throw Error('Invalid seeds/limit');
const scenarios=[
 {kind:'normal',arena:'ring',floor:3,profiles:['basic','fast']},
 {kind:'normal',arena:'annulus',floor:7,profiles:['agile','fast','strong']},
 {kind:'normal',arena:'sluice',floor:9,profiles:['basic','fast','strong','agile']},
 {kind:'normal',arena:'throat',floor:12,profiles:['basic','strong','agile','fast','elite']},
 {kind:'normal',arena:'zigzag',floor:14,profiles:['fast','agile','strong','elite','basic','fast']},
 {kind:'normal',arena:'ward',floor:17,profiles:['basic','fast','strong','agile','elite','basic','strong']},
 {kind:'normal',arena:'columns',floor:19,profiles:['basic','fast','strong','agile','elite','basic','fast','strong','agile']},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','basic']},
 {kind:'boss',arena:'ward',floor:10,profiles:['boss','fast','agile']},
 {kind:'boss',arena:'columns',floor:15,profiles:['boss','strong','basic']},
 {kind:'boss',arena:'columns',floor:20,profiles:['boss','agile','strong']},
 {kind:'boss',arena:'columns',floor:25,profiles:['boss','fast','elite']},
 {kind:'boss',arena:'columns',floor:30,profiles:['boss','strong','agile']}
];
// Real 1/60s physics, perception, team selection and physical boss protection
// for cycles A, B, C, D and later combinations. Not player victory estimates.
const cycleTacticsScenarios=[
 {kind:'normal',arena:'columns',floor:31,profiles:['basic','fast','strong','agile','basic','fast']},
 {kind:'normal',arena:'columns',floor:61,profiles:['fast','agile','strong','basic','elite','basic']},
 {kind:'normal',arena:'columns',floor:91,profiles:['strong','agile','basic','elite','fast','basic']},
 {kind:'boss',arena:'columns',floor:95,profiles:['boss','basic','basic']},
 {kind:'normal',arena:'columns',floor:121,profiles:['elite','strong','agile','fast','basic','basic']},
 {kind:'normal',arena:'columns',floor:151,profiles:['basic','strong','agile','elite','fast','basic']},
 {kind:'normal',arena:'columns',floor:181,profiles:['strong','agile','basic','elite','fast','basic']}
];
// Controlled H8 fixtures: each variant receives the same physical topology,
 // seed, skill points, opponent profiles and equipped module types. Only the
 // numerical effects of the equipped ranks vary in the transient garage.
const rarityPresets=Object.freeze({
 mixed:['turbo','piston','adrenal','focus','synapse','gyro'],
 neural:['optic','focus','quiet','flywheel','metronome','synapse']
});
const rarityScenarios=[31,91,181].flatMap(floor=>Object.keys(rarityPresets).map(preset=>({
 kind:'normal',arena:'columns',floor,rarityPreset:preset,
 profiles:['basic','fast','strong','agile','basic','fast']
})));
const bossBenchScenarios=[
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','basic'],label:'two ordinary'},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','strong'],label:'one strong'},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','strong','strong'],label:'two strong'},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','fast'],label:'one fast'},
 {kind:'boss',arena:'ward',floor:5,profiles:['boss','strong','agile'],label:'strong plus agile'}
];
function randomGenerator(seed){
 let x=seed>>>0;return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296};
}
function runScenario(scenario,seed){
 const previousRandom=Math.random;
 Math.random=randomGenerator(seed);
 let dom,off=()=>{};
 const row={kind:scenario.kind,arena:scenario.arena,floor:scenario.floor,
  variant:scenario.kind==='boss'?bossVariantForFloor(scenario.floor):null,
  profiles:scenario.profiles,label:scenario.label??null,seed,participants:scenario.profiles.length+1,
  completed:false,winner:null,duration:0,hits:0,strikes:0,
  charges:0,sweeps:0,unstucks:0,nonFinite:0,bodyPenetrations:0,bodyOverlaps:0,
  initialPenetrations:0,initialOverlaps:0,maxBodyOverlapCm:0,overlapSamples:[],chargeProbe:{},
  combatSamples:[],longFight:null,bossHitsFrom:{},bossStrikesFrom:{},bossKilledBy:null,
  patientHitsOnBoss:0,playerHitsOnBoss:0,playerHitsTotal:0,bossHitsOnOthers:0,
  relations:null,friendlyHits:0,personalEliminations:0,
  rarityCompare:rarityCompare?{step:rarityStep,preset:scenario.rarityPreset,
    rank:Math.min(5,Math.floor((scenario.floor-1)/30))}:null,
  bossDeathAt:null,playerAliveAtBossDeath:null,headHpAtEnd:null,
  errors:[],elapsedCpuMs:0};
 const began=Date.now();
 try{
  dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),
   {url:'https://tower-sim.test/',pretendToBeVisual:true});
  for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
  globalThis.matchMedia=()=>({matches:false});
  globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  globalThis.confirm=()=>true;
  ctx.arenaRenderer=null;ctx.towerPlayer=0;
  const session=betNewSession(['Автопилот'],1000),tower=towerFor(session,0);
  tower.level=scenario.floor;tower.wins=scenario.floor-1;
  tower.record=scenario.floor-1;tower.stats=earnedStats(towerCycleWins(scenario.floor));
  if(rarityCompare){
   const types=rarityPresets[scenario.rarityPreset],rank=row.rarityCompare.rank;
   tower.mutations=[...types];
   tower.mutationInventory=types.map((type,i)=>({id:'m'+(i+1),type,rarity:rank,obtainedAt:scenario.floor-1}));
   tower.equippedMutations=types.map((_,i)=>'m'+(i+1));
   tower.nextMutationId=types.length+1;
   // Fixture owns equipment at zero simulated purchase cost; this is NOT a
   // 30-floor economic progression or a claim about affordability.
  }
  const option={arenaId:scenario.arena,kind:scenario.kind==='boss'?'boss':'danger',
   ...(scenario.kind==='normal'?{style:'mixed'}:{}),profiles:scenario.profiles};
  if(cycleTactics||rarityCompare){
   option.relations=towerRelationPlan(scenario.floor,scenario.profiles,Math.random);
   row.relations=structuredClone(option.relations);
  }
  tower.floorPlan={floor:scenario.floor,selected:0,options:[option]};
  if(naturalBoss){
   delete tower.floorPlan;
   const generated=ensureTowerFloorPlan(tower,Math.random);
   row.arena=generated.options[0].arenaId;
   row.profiles=[...generated.options[0].profiles];
  }
  if(scenario.kind==='boss')tower.bossEncounter={
   floor:scenario.floor,variant:row.variant,
   texture:'assets/textures/robots/boss/b_01.png'
  };
  initializeGame({session,entry:'tower',tower:structuredClone(tower),arenaId:row.arena});
  if(rarityCompare){
   const patient=ctx.towerGarage[0];
   const installed=patient.mutationInventory.filter(item=>patient.equippedMutations.includes(item.id));
   const live=towerMutationBonus(patient.mutations),liveCombat=towerMutationCombatBonus(patient.mutations);
   const proposal=rarityStep===0?{effective:live,crit:liveCombat.crit,
     cooldownMultiplier:liveCombat.cooldownMultiplier}:towerRarityScenario(installed,rarityStep);
   // Freeze the historical comparison, including its rank-neutral control.
   // This override lives only in the transient arena.
   patient.rarityPhysics=Object.freeze({effective:Object.freeze([...proposal.effective]),
    crit:proposal.crit,cooldownMultiplier:proposal.cooldownMultiplier});
   row.rarityCompare.live=Object.freeze({effective:live,crit:liveCombat.crit,
     cooldownMultiplier:liveCombat.cooldownMultiplier});
   row.rarityCompare.proposed=Object.freeze({effective:[...proposal.effective],
     crit:proposal.crit,cooldownMultiplier:proposal.cooldownMultiplier});
  }
  installTowerUI();document.querySelector('#tower-fight').click();
  advanceStartup(20);
  ctx.paused=false;ctx.appInactive=false;ctx.orientationBlocked=false;
  ctx.settingsOpen=false;ctx.towerControlMode='joystick';
  if(ctx.startup.phase!=='running')throw Error('Fight failed to reach running phase');
  if(rarityCompare){
   const actual=patientCombatStats(0).mutationBonus,combat=towerFighterCombatBonus(0);
   const planned=row.rarityCompare.proposed;
   if(actual.some((n,i)=>Math.abs(n-planned.effective[i])>1e-8)||
       Math.abs(combat.crit-planned.crit)>1e-8||
       Math.abs(combat.cooldownMultiplier-planned.cooldownMultiplier)>1e-8)
    throw Error('H8 proposed bonuses were not used by the physical game');
   row.rarityCompare.actual={effective:[...actual],crit:combat.crit,
     cooldownMultiplier:combat.cooldownMultiplier};
  }
  const solid=c=>c.segment==='head'||c.segment?.startsWith('spine-');
  const inspect=(initial=false)=>{
   const bodies=ctx.robots;
   for(const r of bodies){
    if(![r.x,r.y,r.angle,...r.capsules.flatMap(c=>[c.a.x,c.a.y,c.b.x,c.b.y,c.r])].every(Number.isFinite))
     row.nonFinite++;
    for(const c of r.capsules)if(staticContacts(c).some(h=>h.depth>(isLimb(c)?5:.5)+1e-6)){
     if(initial)row.initialPenetrations++;else row.bodyPenetrations++;
    }
   }
   for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
    let deepest=-Infinity;
    for(const a of bodies[i].capsules.filter(solid))
     for(const b of bodies[j].capsules.filter(solid))
      deepest=Math.max(deepest,a.r+b.r-segmentDistance(a.a,a.b,b.a,b.b));
    if(deepest>-.15+1e-6){
     if(initial)row.initialOverlaps++;else row.bodyOverlaps++;
     const penetration=Math.max(0,deepest);
     if(!initial){
      row.maxBodyOverlapCm=Math.max(row.maxBodyOverlapCm,penetration);
      if(row.overlapSamples.length<12)row.overlapSamples.push({
       time:Math.round(ctx.game.time*10)/10,robots:[i,j],depthCm:Math.round(penetration*100)/100,
       leap:!!(bodies[i].actualPose?.leap||bodies[j].actualPose?.leap)
      });
     }
    }
   }
  };
  const diagnoseCharge=()=>{
   const boss=ctx.robots.find(r=>r.isBoss);
   if(!boss?.mobile)return;
   const state=boss.body?.behavior?.state;
   if(!state)return;
   const record=key=>row.chargeProbe[key]=(row.chargeProbe[key]??0)+1;
   const target=ctx.robots.filter(r=>r.id!==boss.id&&r.mobile&&r.visible)
    .sort((a,b)=>Math.hypot(a.x-boss.x,a.y-boss.y)-Math.hypot(b.x-boss.x,b.y-boss.y))[0];
   const now=ctx.game.time;
   if(!target){record('noTarget');return;}
   if(state.charge){record('charging');return;}
   if(ctx.combat.pending[boss.id]?.length){record('striking');return;}
   if(now<ctx.combat.nextStrike[boss.id]){record('attackCooldown');return;}
   if(ctx.combat.escapeUntil[boss.id]>now){record('escaping');return;}
   const seen=boss.canSee(target.center)&&sightClear(boss.center,target.center);
   if(!seen){record('unseen');return;}
   if(state.chargeAim)record('chargeAimActive');
   if(now<state.nextChargeAt){record('chargeCooldown');return;}
   const gap=Math.hypot(target.center.x-boss.x,target.center.y-boss.y);
   if(gap<BOSS_CONFIG.tactics.chargeMinGap){record('tooClose');return;}
   if(gap>BOSS_CONFIG.tactics.chargeMaxGap){record('tooFar');return;}
   record('withinDashRange');
   const angle=Math.abs(wrap(Math.atan2(target.y-boss.y,target.x-boss.x)-boss.angle));
   if(angle>=.35){record('notAlignedInRange');return;}
   const reasons={},plan=chargePlan(boss,target.center,{history:state.chargeHistory,diagnostics:reasons});
   if(plan)record('planAvailable');
   else record('planRejected');
   for(const [key,value] of Object.entries(reasons))row.chargeProbe[key]=(row.chargeProbe[key]??0)+value;
  };
  inspect(true);
  off=onGameEvent(e=>{
   if(e.type==='robot-immobilized'&&e.robot>0&&e.lastAttacker===0)
    row.personalEliminations++;
   if(e.type==='combat-strike'&&cycleTactics&&towerAllies(ctx.towerRun,e.from,e.to,ctx.game.time))
    row.friendlyHits++;
   if(e.type==='combat-strike'&&scenario.kind==='boss'){
     if(e.from===0)row.playerHitsTotal++;
     if(e.to===1){
      const source=String(e.from);
      row.bossHitsFrom[source]=(row.bossHitsFrom[source]??0)+1;
      if(e.from===0)row.playerHitsOnBoss++;else row.patientHitsOnBoss++;
     }
     if(e.from===1)row.bossHitsOnOthers++;
   }
   if(e.type==='combat-windup'&&scenario.kind==='boss'&&e.to===1){
    const source=String(e.from);row.bossStrikesFrom[source]=(row.bossStrikesFrom[source]??0)+1;
   }
   if(e.type==='robot-immobilized'&&scenario.kind==='boss'&&e.robot===1){
    row.bossKilledBy=e.lastAttacker??null;
    row.bossDeathAt=Math.round(e.time*10)/10;
    row.playerAliveAtBossDeath=ctx.robots[0]?.mobile??null;
   }
   if(e.type==='combat-unstuck')row.unstucks++;
   if(e.type==='boss-charge')row.charges++;
   if(e.type==='combat-windup'&&e.bossStyle==='sweep')row.sweeps++;
  });
  for(let tick=0;tick<seconds*60&&!ctx.combat.finished;tick++){
   if(tick%6===0){
    const me=ctx.robots[0];
    const others=ctx.robots.filter(r=>r.id!==0&&r.mobile&&r.visible);
    others.sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y));
    const foe=others[0],dx=foe?foe.x-me.x:0,dy=foe?foe.y-me.y:0;
    const length=Math.hypot(dx,dy);
    if(policy==='evade'){
      const alive=ctx.robots.filter(r=>r.id!==0&&r.mobile&&r.visible);
      const nearest=alive.sort((a,b)=>Math.hypot(a.x-me.x,a.y-me.y)-Math.hypot(b.x-me.x,b.y-me.y))[0];
      const d=nearest?Math.hypot(nearest.x-me.x,nearest.y-me.y):Infinity;
      if(nearest&&d<170){
        const awayX=me.x-nearest.x,awayY=me.y-nearest.y;
        ctx.towerInput={x:awayX/Math.max(1,d),y:awayY/Math.max(1,d)};
      }else ctx.towerInput={x:0,y:0};
    }else if(policy==='idle')ctx.towerInput={x:0,y:0};
    else if(policy==='orbit'&&length>0&&length<110){
      const radial=Math.max(-.7,Math.min(.7,(length-55)/20));
      const vx=dx/length*radial-dy/length*.9;
      const vy=dy/length*radial+dx/length*.9;
      const norm=Math.max(1,Math.hypot(vx,vy));
      ctx.towerInput={x:vx/norm,y:vy/norm};
    }else ctx.towerInput=length>36?{x:dx/length,y:dy/length}:{x:0,y:0};
   }
   if(diagnose&&tick%12===0&&scenario.kind==='boss')diagnoseCharge();
   step(1/60);
   if(tick%60===59){
    inspect();
    row.combatSamples.push(captureTowerBattleSample(ctx));
   }
  }
  row.completed=ctx.combat.finished;
  row.winner=ctx.combat.winner;
  row.duration=Math.round(ctx.round.elapsedSec*10)/10;
  row.hits=ctx.combat.hits;row.strikes=ctx.combat.strikes;
  row.playerHits=ctx.combat.fighterHits[0]??0;
  row.playerSwings=ctx.combat.fighterSwings[0]??0;
  row.aliveAtEnd=ctx.robots.filter(r=>r.mobile).length;
  row.coins=session.players[0].balance-1000;
  row.playerAlive=ctx.robots[0].mobile;
  row.bossAlive=scenario.kind==='boss'?ctx.robots[1].mobile:null;
  row.headHpAtEnd=scenario.kind==='boss'?ctx.robots[1].hp.get('head'):null;
  row.longFight=diagnoseLongTowerFight(row.combatSamples,row.completed);
 }catch(error){
  row.errors.push(String(error?.stack??error).slice(0,2000));
 }finally{
  off();
  try{ctx.root?.__disposeTag?.();dom?.window.close();}catch{}
  Math.random=previousRandom;
  if(ctx.towerGarage?.[0])delete ctx.towerGarage[0].rarityPhysics;
  ctx.mode='spectator';
  row.elapsedCpuMs=Date.now()-began;
 }
 return row;
}
const runs=[];
for(const scenario of (naturalBoss?[{kind:'boss',arena:'ward',floor:5,profiles:['boss','basic','basic'],label:'naturally generated'}]:bossBench?bossBenchScenarios:rarityCompare?rarityScenarios:cycleTactics?cycleTacticsScenarios:scenarios).filter(s=>!selectedFloors||selectedFloors.includes(s.floor))){
 for(let sample=0;sample<samples;sample++){
  const row=runScenario(scenario,offset+sample*15485863+scenario.floor*7919);
  runs.push(row);
  console.log('FIGHT '+JSON.stringify({
   arena:row.arena,floor:row.floor,variant:row.variant,label:row.label,participants:row.participants,
   relations:cycleTactics||rarityCompare?row.relations:undefined,
   friendlyHits:cycleTactics||rarityCompare?row.friendlyHits:undefined,
   rarityCompare:rarityCompare?row.rarityCompare:undefined,
   seed:row.seed,completed:row.completed,winner:row.winner,seconds:row.duration,
   personalEliminations:row.personalEliminations,earnedCoins:row.coins,
   hits:row.hits,strikes:row.strikes,unstucks:row.unstucks,charges:row.charges,sweeps:row.sweeps,
   nonFinite:row.nonFinite,bodyPenetrations:row.bodyPenetrations,bodyOverlaps:row.bodyOverlaps,
   initialPenetrations:row.initialPenetrations,initialOverlaps:row.initialOverlaps,
   maxBodyOverlapCm:row.maxBodyOverlapCm,chargeProbe:diagnose?row.chargeProbe:undefined,
   playerAlive:row.playerAlive,bossAlive:row.bossAlive,bossKilledBy:row.bossKilledBy,
   patientHitsOnBoss:row.patientHitsOnBoss,playerHitsOnBoss:row.playerHitsOnBoss,
   bossHitsOnOthers:row.bossHitsOnOthers,playerHitsTotal:row.playerHitsTotal,
   bossDeathAt:row.bossDeathAt,playerAliveAtBossDeath:row.playerAliveAtBossDeath,
   headHpAtEnd:row.headHpAtEnd,longFight:row.longFight,
   error:row.errors[0]?.slice(0,230)??null
  }));
 }
}
const summary={
 total:runs.length,completed:runs.filter(r=>r.completed).length,
 friendlyHits:runs.reduce((n,r)=>n+r.friendlyHits,0),
 timedOut:runs.filter(r=>!r.completed&&!r.errors.length).length,
 errors:runs.filter(r=>r.errors.length).length,
 nonFinite:runs.reduce((n,r)=>n+r.nonFinite,0),
 initialPenetrations:runs.reduce((n,r)=>n+r.initialPenetrations,0),
 initialOverlaps:runs.reduce((n,r)=>n+r.initialOverlaps,0),
 bodyPenetrations:runs.reduce((n,r)=>n+r.bodyPenetrations,0),
 bodyOverlaps:runs.reduce((n,r)=>n+r.bodyOverlaps,0),
 maxBodyOverlapCm:Math.max(0,...runs.map(r=>r.maxBodyOverlapCm)),
 unstucks:runs.reduce((n,r)=>n+r.unstucks,0),
 hits:runs.reduce((n,r)=>n+r.hits,0),
 charges:runs.reduce((n,r)=>n+r.charges,0),
 playerWins:runs.filter(r=>r.winner===0).length,
 bossDeaths:runs.filter(r=>r.kind==='boss'&&r.bossAlive===false).length,
 bossKilledByPatients:runs.filter(r=>r.kind==='boss'&&r.bossAlive===false&&r.bossKilledBy>1).length,
 bossKilledByPatientsWithoutPlayerHit:runs.filter(r=>r.kind==='boss'&&r.bossAlive===false&&r.bossKilledBy>1&&r.playerHitsTotal===0).length,
 bossKilledByPatientsWhilePlayerAlive:runs.filter(r=>r.kind==='boss'&&r.bossAlive===false&&r.bossKilledBy>1&&r.playerAliveAtBossDeath).length,
 totalPatientHitsOnBoss:runs.reduce((n,r)=>n+r.patientHitsOnBoss,0),
 totalPlayerHitsOnBoss:runs.reduce((n,r)=>n+r.playerHitsOnBoss,0),
 longFightReasons:Object.fromEntries([...new Set(runs.filter(r=>!r.completed).map(r=>r.longFight?.reason??'error'))].map(reason=>
   [reason,runs.filter(r=>!r.completed&&(r.longFight?.reason??'error')===reason).length])),
 cpuSeconds:Math.round(runs.reduce((n,r)=>n+r.elapsedCpuMs,0)/100)/10
};
const result={simulation:'headless real 1/60s game loop',selectedFloors,diagnose,bossBench,naturalBoss,cycleTactics,
 rarityCompare,rarityStep:rarityCompare?rarityStep:null,maxAllowedBodyOverlapCm,
 policy:policy==='orbit'?'Player approaches and circles a nearby enemy at about 55 cm; not human performance':
 policy==='idle'?'Player remains idle and never presses movement controls':
 policy==='evade'?'Player avoids other fighters when closer than 170 cm and does not attack deliberately':
 'Player automatically approaches nearest moving enemy and stops at 36 cm; not human performance',
 seconds,seeds:samples,summary,runs};
fs.mkdirSync(out.split('/').slice(0,-1).join('/')||'.',{recursive:true});
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY '+JSON.stringify(summary));
console.log('REPORT '+out);
if(summary.errors||summary.nonFinite||(cycleTactics||rarityCompare)&&summary.friendlyHits||summary.initialPenetrations||summary.initialOverlaps||
 summary.maxBodyOverlapCm>maxAllowedBodyOverlapCm)process.exitCode=1;
