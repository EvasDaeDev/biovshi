import {ctx} from '../game/state.js';
import {el,attr} from '../render/svg.js';
import {path} from '../utils/math.js';
import {pendingStrikes} from '../systems/strikes.js';
import {BOSS_CONFIG} from './config.js';
import {poseAt} from './attacks.js';
export function paintBossTelegraph(robot){
 const state=robot.body.behavior?.state;
 if(!state)return;
 if(!robot.bossCue){
  const group=el('g',{'data-boss-cue':'','pointer-events':'none'},robot.actor);
  const route=el('path',{fill:'none',stroke:'#c79560','stroke-width':1.5,'stroke-dasharray':'3 3',opacity:.75},group);
  robot.bossCue={group,route};
 }
 const cue=robot.bossCue,p=pendingStrikes(robot.id)[0],now=ctx.game.time;
 attr(robot.actor,'data-boss-phase',state.phase);
 let points=[];
 if(robot.mobile()){
  if(state.charge&&now<state.charge.started+BOSS_CONFIG.tactics.chargeWindup){points=[state.charge.origin,state.charge.goal];}
  else if(p&&now<p.started+p.timing.windupSec){
   if(p.style==='sweep')for(let i=0;i<=12;i++){const pose=poseAt(robot.api,p,p.timing.windupSec+p.timing.thrustSec*i/12);if(pose)points.push(pose.tip);}
  }
 }
 attr(cue.group,'display',points.length?'':'none');attr(cue.route,'d',points.length?path(points):'');
}
