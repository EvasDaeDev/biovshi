import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';
import { triangleMatrix } from './wall-geometry.js';
import { renderProfile } from './performance.js';

export function wavePoint(x, y, pulse, time) {
  const age=time-pulse.time;
  if (age<0 || age>=CONFIG.effects.waveSec) return {x,y};
  const dx=x-pulse.x,dy=y-pulse.y,distance=Math.hypot(dx,dy);
  if (distance<1e-8) return {x,y};
  const radius=age*CONFIG.effects.waveSpeedCm;
  const amplitude=CONFIG.effects.waveAmplitudeCm*(1-age/CONFIG.effects.waveSec);
  const edge=Math.max(0,Math.min(1,Math.min(x,y,700-x,700-y)/30));
  const offset=Math.exp(-Math.pow((distance-radius)/CONFIG.effects.waveWidthCm,2))*amplitude*edge;
  return {x:x+dx/distance*offset,y:y+dy/distance*offset};
}

// Deform the actual floor pattern, even when the coordinate grid is hidden.
// The mesh exists only after the first hit and is hidden between impacts.
export function paintFloorWarp() {
  const floor=ctx.arenaContent.querySelector(':scope > rect');
  const pulse=ctx.pulses.at(-1);
  let mesh=ctx.floorWarp;
  if (mesh?.floor!==floor) {
    mesh?.group.remove();
    mesh=ctx.floorWarp=null;
  }
  const age=pulse?ctx.game.time-pulse.time:Infinity;
  if (!pulse || age<0 || age>=CONFIG.effects.waveSec) {
    if (mesh) attr(mesh.group,'display','none');
    if (floor) attr(floor,'opacity',1);
    return;
  }
  const step=renderProfile().name==='light'?100:50;
  if (!mesh || mesh.step!==step) {
    mesh?.group.remove();
    const group=el('g',{
      id:'tag7hop-floor-warp','pointer-events':'none','aria-hidden':'true',
      'shape-rendering':'crispEdges',
    },ctx.arenaContent);
    ctx.arenaContent.insertBefore(group,floor.nextSibling);
    const vertices=[],triangles=[],size=700/step+1;
    for(let y=0;y<=700;y+=step)for(let x=0;x<=700;x+=step)vertices.push({x,y});
    for(let row=0;row<size-1;row++)for(let col=0;col<size-1;col++) {
      const a=row*size+col,b=a+1,c=a+size+1,d=a+size;
      for(const ids of [[a,b,c],[a,c,d]]) {
        const source=ids.map(i=>vertices[i]);
        const node=el('path',{
          d:source.map((p,i)=>(i?'L':'M')+p.x+','+p.y).join(' ')+' Z',
        },group);
        triangles.push({ids,source,node});
      }
    }
    mesh=ctx.floorWarp={floor,group,vertices,triangles,step};
  }
  attr(mesh.group,'fill',floor.style.fill||floor.getAttribute('fill'));
  attr(mesh.group,'display','');
  attr(floor,'opacity',0);
  const warped=mesh.vertices.map(p=>wavePoint(p.x,p.y,pulse,ctx.game.time));
  for(const triangle of mesh.triangles) {
    const matrix=triangleMatrix(triangle.source,triangle.ids.map(i=>warped[i]));
    attr(triangle.node,'transform','matrix('+matrix.join(' ')+')');
  }
}
