import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {CONFIG} from '../src/config.js';
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {patientCombatStats} from '../src/game/patients.js';
import {PROSTHETIC_SEGMENTS,statMultiplier,critChance,normalizePatient} from '../src/garage/model.js';
import {prostheticStatSnapshot} from '../src/garage/prosthetics.js';
import {betNewSession,betCommit} from '../src/betting/ledger.js';
import {bettingSettle,bettingCancel} from '../src/betting/ui.js';
import {startSpawnSequence,advanceStartup,resetRound} from '../src/game/session.js';
import {createRobot} from '../src/robot/robot.js';
import {combatAttacks} from '../src/systems/combat.js';
import {pendingStrikes} from '../src/systems/strikes.js';
import {paintTelemetry} from '../src/ui/paint-telemetry.js';
import {newTower} from '../src/tower/model.js';
import {installTowerUI} from '../src/tower/ui.js';
const arm=['arm--1-upper','arm--1-lower'];
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);
function setup(parts=arm,{tower=false}={}){
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://prosthetics.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 const session=betNewSession(['Player'],100);session.garage[0].prosthetics=[...parts];
 const run=tower?newTower(0):null;if(run){run.prosthetics=[...parts];session.towers[0]=structuredClone(run);ctx.towerPlayer=0;}
 initializeGame({session,entry:'betting',arenaId:'ring',...(run?{tower:run}:{})});
 if(run)installTowerUI();else{betCommit(session,[{player:0,robot:0,amount:0}]);startSpawnSequence();advanceStartup(20);}
 return {dom,session,paint(){ctx.telemetryDirty=true;paintTelemetry();},close(){ctx.root.__disposeTag();dom.window.close();}};
}

test('only the eleven replaceable segments count, percentages add without modifying earned points',()=>{
 assert.equal(PROSTHETIC_SEGMENTS.length,11);
 const patient={stats:[3,3,3],prosthetics:[...PROSTHETIC_SEGMENTS,'head','spine-0','tail-0',...arm]};
 const snapshot=prostheticStatSnapshot(patient);
 assert.equal(snapshot.count,11);[3.99,3.99,2.34].forEach((value,i)=>near(snapshot.effective[i],value));
 assert.deepEqual(patient.stats,[3,3,3]);
 const live=prostheticStatSnapshot(patient,{missingSegments:arm,hasHead:true});assert.equal(live.count,9);
 const dead=prostheticStatSnapshot(patient,{hasHead:false});assert.equal(dead.count,0);assert.deepEqual(dead.effective,[3,3,3]);
 const legacy=normalizePatient({stats:[3,3,3],wins:0,prosthetics:['spine-0','head',...arm,...arm]});assert.deepEqual(legacy.prosthetics,arm);
});

test('fractional effects interpolate across every tier and retain the original integer curves and caps',()=>{
 const originalSpeed=p=>p<=4?1+(p-3)*.2:1.2+[0,.15,.30,.40,.50,.60][Math.min(5,p-4)];
 const originalCrit=p=>p<=4?Math.max(0,(p-2)*.15):[.30,.38,.45,.50,.55,.60][Math.min(5,p-4)];
 for(let i=2;i<=30;i++){assert.equal(statMultiplier(i),originalSpeed(i));assert.equal(critChance(i),originalCrit(i));}
 for(const p of [3.09,3.99,4.24,5.32,6.36,7.98,8.48,9.01,11.97]){
  const a=Math.floor(p),b=Math.ceil(p),q=p-a;
  near(statMultiplier(p),originalSpeed(a)*(1-q)+originalSpeed(b)*q);
  near(critChance(p),originalCrit(a)*(1-q)+originalCrit(b)*q);
 }
 near(statMultiplier(2.34),.868);near(critChance(3.99),.2985);
});

test('live severing removes both segment effects and highlighting; recovery, death and cancellation restore the right build',async()=>{
 const f=setup();try{
  let r=ctx.robots[0];f.paint();
  assert.equal(patientCombatStats(0).count,2);near(patientCombatStats(0).effective[1],3.18);
  assert.equal(ctx.cardNodes[0].strength.textContent,'3,18 · 18% КРИТ');
  assert.equal(ctx.cardNodes[0].maneuver.textContent,'2,88 · 98%');
  assert.equal(ctx.cardNodes[0].card.querySelectorAll('.is-prosthetic').length,3);
  r.damage(arm[0],1,3);assert.equal(patientCombatStats(0).count,0);f.paint();
  assert.equal(ctx.cardNodes[0].card.querySelectorAll('.is-prosthetic').length,0);
  assert.equal(ctx.cardNodes[0].speed.textContent,'3 · 100%');
  bettingSettle(1);await resetRound();assert.equal(patientCombatStats(0).count,2);
  // Cancelling a lethal round restores the pre-battle body and its modifiers.
  betCommit(f.session,[{player:0,robot:0,amount:0}]);startSpawnSequence();advanceStartup(20);
  ctx.robots[0].damage('head',1,6);assert.equal(patientCombatStats(0).count,0);
  bettingCancel();await resetRound();assert.equal(patientCombatStats(0).count,2);
  // Completing a lethal round permanently clears the body instead.
  betCommit(f.session,[{player:0,robot:0,amount:0}]);startSpawnSequence();advanceStartup(20);
  ctx.robots[0].damage('head',1,6);bettingSettle(1);await resetRound();f.paint();
  assert.equal(patientCombatStats(0).count,0);assert.deepEqual(f.session.garage[0].prosthetics,[]);
  assert.equal(ctx.cardNodes[0].card.querySelectorAll('.is-prosthetic').length,0);
 }finally{f.close();}
});

test('prostheses change actual movement and turning, without changing earned points',()=>{
 const f=setup([]);try{
  function measure(parts,turn){
   ctx.betting.garage[0].prosthetics=[...parts];ctx.robots=[];ctx.obstacles=[];ctx.game.time=10;
   const r=createRobot(0,{x:350,y:350,angle:0});ctx.robots=[r];r.setVisible(true);
   for(let i=0;i<10;i++){ctx.game.time+=1/60;r.tick(1/60,{manual:true,mode:'manual',speed:turn?0:55,goal:turn?{x:350,y:500}:{x:500,y:350}});}
   const value=turn?r.angle:r.x;r.actor.remove();return value;
  }
  const walk=measure([],false),bionicWalk=measure(PROSTHETIC_SEGMENTS,false);
  assert.ok(bionicWalk>walk&&walk>350,'prosthetic speed affects real displacement');
  const turn=measure([],true),bionicTurn=measure(PROSTHETIC_SEGMENTS,true);
  assert.ok(bionicTurn>0&&bionicTurn<turn,'prosthetic maneuver penalty slows the physical turn');
  assert.deepEqual(ctx.betting.garage[0].stats,[3,3,3]);
 }finally{f.close();}
});

test('ordinary attack resolution uses fractional prosthetic strength for critical damage',()=>{
 for(const [parts,expected] of [[[],1],[PROSTHETIC_SEGMENTS,2]]){
  const f=setup(parts);try{
   ctx.robots=[];ctx.obstacles=[];ctx.game.time=10;
   const r=createRobot(0,{x:350,y:350,angle:0});ctx.robots=[r];r.setVisible(true);
   ctx.agentAI[0].nextPounceDecisionAt=Infinity;
   const source=r.attackSources.find(s=>s.kind==='arm'),point={x:source.point.x+20,y:source.point.y},hits=[];
   const foe={id:1,...point,center:point,visible:true,mobile:true,hasHead:true,segmentCount:1,movementLimbs:4,
    actualPose:{leap:null,scene:null},combatRecoverUntil:0,attackSources:[],canSee:()=>false,
    capsules:[{a:point,b:point,r:4,segment:'head'}],isDamageable:()=>true,
    damage(segment,by,damage){hits.push(damage);return true;},reactToHit(){}};
   ctx.robots.push(foe);combatAttacks();const strike=pendingStrikes(0)[0];assert.ok(strike);
   ctx.game.time=strike.impactAt;
   foe.capsules=[{a:r.attackPose(strike).tip,b:r.attackPose(strike).tip,r:5,segment:'head'}];
   ctx.seed=0;combatAttacks();
   assert.deepEqual(hits,[expected],'same random roll is a crit only with the prosthetic bonus');
   near(strike.endsAt-strike.started,CONFIG.combat.windupSec+CONFIG.combat.thrustSec+CONFIG.combat.recoverSec);
  }finally{f.close();}
 }
});

test('hints open by tap and keyboard, refresh while visible, dismiss outside and do not intercept skill selectors',async()=>{
 const f=setup();try{
  f.paint();const field=ctx.cardNodes[0].strength.parentElement,hint=document.querySelector('.biovshi-hint');
  field.click();assert.equal(hint.hidden,false);assert.match(hint.textContent,/3 → 3,18/);assert.match(hint.textContent,/\+6%/);
  ctx.robots[0].damage(arm[0],1,3);f.paint();await Promise.resolve();
  assert.equal(hint.textContent,field.dataset.hint);assert.doesNotMatch(hint.textContent,/\+6%/);
  document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));assert.equal(hint.hidden,true);
  field.focus();assert.equal(hint.hidden,false);
  field.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(hint.hidden,true);
  field.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(hint.hidden,false);
 }finally{f.close();}
 const tower=setup(arm,{tower:true});try{
  assert.equal(patientCombatStats(0).count,2);assert.equal(patientCombatStats(1).count,0);
  assert.equal(document.querySelectorAll('#tower-stats .is-prosthetic').length,3);
  const select=document.querySelector('[data-tower-stat="0"]');
  const space=new tower.dom.window.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true});select.dispatchEvent(space);assert.equal(space.defaultPrevented,false);
  select.value='4';select.dispatchEvent(new Event('change'));near(patientCombatStats(0).effective[0],4.24);
  assert.ok(ctx.towerRun.stats.every(Number.isInteger));
 }finally{tower.close();}
});
