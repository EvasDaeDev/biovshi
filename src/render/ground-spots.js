import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';
import { ROBOT_PARTS, skinMatrix } from './robot-skin.js';

export function paddedEllipse(points,angle,padding=1.2) {
  const c=Math.cos(angle),s=Math.sin(angle);
  const local=points.map(p=>({x:p.x*c+p.y*s,y:-p.x*s+p.y*c}));
  const minX=Math.min(...local.map(p=>p.x)),maxX=Math.max(...local.map(p=>p.x));
  const minY=Math.min(...local.map(p=>p.y)),maxY=Math.max(...local.map(p=>p.y));
  const x=(minX+maxX)/2,y=(minY+maxY)/2;
  return {x:x*c-y*s,y:x*s+y*c,rx:(maxX-minX)*padding/2,ry:(maxY-minY)*padding/2,angle};
}

function gradient(id,colour,stops,parent) {
  const g=el('radialGradient',{id,cx:.5,cy:.5,r:.5},parent);
  for(const [offset,opacity] of stops)el('stop',{offset,'stop-color':colour,'stop-opacity':opacity},g);
}

export function createTorsoShadow(robot) {
  const id='tag7hop-torso-shadow-'+robot.id;
  gradient(id,'#000000',[[0,1],[.6,.9],[.82,.45],[1,0]],ctx.lightGradients);
  robot.torsoShadow=el('ellipse',{
    'data-torso-shadow':robot.id,fill:'url(#'+id+')',stroke:'none',opacity:CONFIG.robot.shadowOpacity,
  },robot.floor);
}

export function paintTorsoShadow(robot) {
  const points=[];
  for(let i=0;i<(robot.spineSegmentTotal??4);i++) {
    if(!robot.healthy('spine-'+i))continue;
    const a=robot.spine[i],b=robot.spine[i+1];
    if(robot.skin?.ready) {
      const [A,B,C,D,E,F]=skinMatrix(a,b,robot.skin?.pieces.get('spine-'+i)?.part??ROBOT_PARTS['spine-'+i]);
      for(const [x,y] of [[0,0],[64,0],[64,64],[0,64]])points.push(robot.visiblePoint({x:A*x+C*y+E,y:B*x+D*y+F}));
    } else {
      const r=CONFIG.robot.vertebraBaseCm*(robot.scale??ctx.scale)/2;
      for(const p of [a,b])for(const x of [-r,r])for(const y of [-r,r])
        points.push(robot.visiblePoint({x:p.x+x,y:p.y+y}));
    }
  }
  if(!robot.skin?.ready)for(const [key,frame,x,y] of [
    ['spine-0',robot.chest,3,15],[robot.pelvisKey??'spine-3',robot.pelvis,-5,12],
  ])if(robot.healthy(key))for(const side of [-1,1])points.push(robot.visiblePoint(robot.local(frame,x,y*side)));
  if(!points.length){attr(robot.torsoShadow,'opacity',0);return;}
  const first=robot.spine[0],last=robot.spine[robot.spineSegmentTotal??4];
  const angle=Math.atan2(first.y-last.y,first.x-last.x)+robot.visualRotation();
  const ellipse=paddedEllipse(points,angle,CONFIG.robot.shadowPadding);
  for(const [key,value] of Object.entries({cx:ellipse.x,cy:ellipse.y,rx:ellipse.rx,ry:ellipse.ry}))
    attr(robot.torsoShadow,key,value.toFixed(3));
  attr(robot.torsoShadow,'transform',`rotate(${angle*180/Math.PI} ${ellipse.x} ${ellipse.y})`);
  attr(robot.torsoShadow,'opacity',CONFIG.robot.shadowOpacity);
}

export function obstacleLightBounds(points,extraDiameter=100) {
  let diameter=0;
  for(const a of points)for(const b of points)diameter=Math.max(diameter,Math.hypot(a.x-b.x,a.y-b.y));
  return {
    x:(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,
    y:(Math.min(...points.map(p=>p.y))+Math.max(...points.map(p=>p.y)))/2,
    radius:(diameter+extraDiameter)/2,
  };
}

export function createObstacleLights() {
  for(const id of ['tag7hop-obstacle-lights','tag7hop-obstacle-light-holes','tag7hop-obstacle-glow','tag7hop-obstacle-reveal'])
    ctx.svg.querySelector('#'+id)?.remove();
  gradient('tag7hop-obstacle-glow',CONFIG.light.ambientColor,[[0,1],[.6,.6],[1,0]],ctx.defs);
  gradient('tag7hop-obstacle-reveal','#000000',[[0,1],[.6,.6],[1,0]],ctx.defs);
  const group=el('g',{id:'tag7hop-obstacle-lights','pointer-events':'none'},ctx.arenaContent);
  ctx.arenaContent.insertBefore(group,ctx.blockG);
  const holes=el('g',{id:'tag7hop-obstacle-light-holes'},ctx.svg.querySelector('#tag7hop-darkness-mask'));
  ctx.obstacleLightSpots=ctx.obstacles.map((obstacle,i)=>{
    const {x,y,radius}=obstacleLightBounds(obstacle.points,CONFIG.light.obstacleLightExtraDiameterCm);
    const common={cx:x,cy:y,rx:radius,ry:radius,'data-obstacle-light':i};
    const glow=el('ellipse',{...common,fill:'url(#tag7hop-obstacle-glow)',opacity:CONFIG.light.obstacleLightOpacity},group);
    const reveal=el('ellipse',{...common,fill:'url(#tag7hop-obstacle-reveal)',opacity:CONFIG.light.obstacleLightReveal},holes);
    return {glow,reveal};
  });
}
