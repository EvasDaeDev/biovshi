import {ctx} from '../game/state.js';
import {el} from './svg.js';
export function showCrit(x,y){
  ctx.critLabels??=[];
  while(ctx.critLabels.length>=8)ctx.critLabels.shift().node.remove();
  const node=el('text',{class:'crit-label',x,y:y-12,fill:'#ff8a24','font-size':10,'font-weight':700,'text-anchor':'middle',stroke:'none'},ctx.hitEffects.group);
  node.textContent='Crit!';ctx.critLabels.push({node,until:ctx.game.time+.2});
}
export function paintCrit(){
  for(const label of ctx.critLabels??[])if(ctx.game.time>=label.until)label.node.remove();
  ctx.critLabels=(ctx.critLabels??[]).filter(label=>ctx.game.time<label.until&&label.node.isConnected);
}
