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
  const text=el('text',{'text-anchor':'middle',fill:'#e3bc83','font-size':6,'font-weight':700,'paint-order':'stroke',stroke:'#282722','stroke-width':1.5},group);
  robot.bossCue={group,route,text};
 }
 const cue=robot.bossCue,p=pendingStrikes(robot.id)[0],now=ctx.game.time;
 attr(robot.actor,'data-boss-phase',state.phase);
 let text='',points=[];
 if(robot.mobile()){
  if(state.charge&&now<state.charge.started+BOSS_CONFIG.tactics.chargeWindup){text='РЫВОК';points=[state.charge.origin,state.charge.goal];}
  else if(p&&now<p.started+p.timing.windupSec){
   text=p.style==='sweep'?'РАЗМАХ':p.comboIndex?'СЕРИЯ':'';
   if(p.style==='sweep')for(let i=0;i<=12;i++){const pose=poseAt(robot.api,p,p.timing.windupSec+p.timing.thrustSec*i/12);if(pose)points.push(pose.tip);}
  }
 }
 attr(cue.group,'display',text?'':'none');attr(cue.route,'d',points.length?path(points):'');
 if(cue.text.textContent!==text)cue.text.textContent=text;
 attr(cue.text,'x',robot.api.eye.x);attr(cue.text,'y',robot.api.eye.y-26*robot.scale);
}
