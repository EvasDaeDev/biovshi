import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';

export function enforceOilLimits() {
  const drops=ctx.combat?.oilDrops;
  if(!drops)return;
  const limit=(ctx.touchDevice||ctx.renderProfile?.name==='light')?CONFIG.oil.freshLimitLight:CONFIG.oil.freshLimitFull;
  const fresh=drop=>ctx.game.time-drop.born<CONFIG.oil.drySec;
  let excess=Math.max(0,drops.reduce((n,d)=>n+Number(fresh(d)),0)-limit);
  const remove=drop=>{drop.node.remove();ctx.settledOilDrops?.delete(drop);};
  let keep=0;
  for(const drop of drops){
    if(excess>0&&fresh(drop)){remove(drop);excess--;}
    else drops[keep++]=drop;
  }
  drops.length=keep;
  while(drops.length>CONFIG.oil.limit)remove(drops.shift());
}
