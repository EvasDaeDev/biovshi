import {planNeutralRigSpawns} from '../boss/spawn.js';
import {bossAnatomy} from '../boss/anatomy.js';
import {towerPatientAnatomy} from '../tower/anatomy.js';
import {BOSS_CONFIG} from '../boss/config.js';
import {standardNeutralBody} from '../robot/neutral-pose.js';
import {createBoss} from '../boss/boss.js';
import {ensureBossEncounter} from '../boss/encounter.js';
import { clamp } from '../utils/math.js';
import { ctx } from "./state.js";
import { random } from "../utils/random.js";
import { CONFIG } from "../config.js";
import { coreClearCircle } from "../systems/collision.js";
import { createRobot } from "../robot/robot.js";
export
// Вершины идут по часовой стрелке в экранных координатах.
function obstacleVertices(b) {
  if (b.points) return b.points.map(p => ({
    ...p
  }));
  const {
    left: l,
    right: r,
    top: t,
    bottom: d,
    cut: c = 0
  } = b;
  return c ? [{
    x: l + c,
    y: t
  }, {
    x: r - c,
    y: t
  }, {
    x: r,
    y: t + c
  }, {
    x: r,
    y: d - c
  }, {
    x: r - c,
    y: d
  }, {
    x: l + c,
    y: d
  }, {
    x: l,
    y: d - c
  }, {
    x: l,
    y: t + c
  }] : [{
    x: l,
    y: t
  }, {
    x: r,
    y: t
  }, {
    x: r,
    y: d
  }, {
    x: l,
    y: d
  }];
}
export function polygonPlanes(b, pad = 0) {
  let stored = ctx.planeCache.get(b);
  if (!stored) {
    stored = new Map();
    ctx.planeCache.set(b, stored);
  }
  if (stored.has(pad)) return stored.get(pad);
  const ps = b.points || obstacleVertices(b);
  const planes = ps.map((a, i) => {
    const z = ps[(i + 1) % ps.length],
      nx = z.y - a.y,
      ny = a.x - z.x;
    return {
      nx,
      ny,
      c: nx * a.x + ny * a.y + pad * Math.hypot(nx, ny),
      length: Math.hypot(nx,ny)
    };
  });
  stored.set(pad, planes);
  return planes;
}
export function arenaClearance(p) {
  let nearest=Infinity;
  for(const n of ctx.arenaPlanes)nearest=Math.min(nearest,(n.c-n.nx*p.x-n.ny*p.y)/(n.length??Math.hypot(n.nx,n.ny)));
  return nearest;
}
export function containsPoint(b, p, pad = 0) {
  if(b.parts){
    if(pad)return b.parts.some(part=>containsPoint(part,p,pad));
    let inside=false;
    for(const [i,a] of b.points.entries()){
      const q=b.points[(i+1)%b.points.length];
      if((a.y>p.y)!==(q.y>p.y)&&p.x<(q.x-a.x)*(p.y-a.y)/(q.y-a.y)+a.x)inside=!inside;
    }
    return inside;
  }
  return polygonPlanes(b, pad).every(n => n.nx * p.x + n.ny * p.y < n.c - 1e-9);
}
export function expandedObstacle(b, pad) {
  const ns = polygonPlanes(b, pad),
    points = ns.map((n, i) => {
      const prev = ns[(i + ns.length - 1) % ns.length],
        det = prev.nx * n.ny - n.nx * prev.ny;
      return {
        x: (prev.c * n.ny - n.c * prev.ny) / det,
        y: (prev.nx * n.c - n.nx * prev.c) / det
      };
    });
  return {
    ...b,points,left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
    top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y))
  };
}
// Фиксированные точки старта. В каждой из них может появиться любой робот.
export function spawnFacingAngle(point,boundary) {
  const right=boundary.right??boundary.left+boundary.size;
  const bottom=boundary.bottom??boundary.top+boundary.size;
  return Math.atan2((boundary.top+bottom)/2-point.y,
    (boundary.left+right)/2-point.x);
}
export function chooseSpawnLayout() {
  const boundary=ctx.arenaBoundary;
  const cx=(boundary.left+boundary.right)/2,cy=(boundary.top+boundary.bottom)/2;
  const margin=CONFIG.startup.spawnMarginCm;
  if(ctx.mode==='tower'){
    // A low-discrepancy sequence fills usable floor for arbitrary participant counts.
    // Prefer generous spacing, then relax it for crowded late floors.
    const count=ctx.ROBOT_COUNT;
    const {player,opponents=[]}=ctx.arenaDefinition?.towerSpawns??{};
    const enemies=opponents.slice(0,count-1);
    const reserved=player?[player,...enemies]:enemies;
    const slots=[];
    for(const separation of [65,48,32,16,0]){
      for(let i=0;i<Math.max(3000,count*100)&&reserved.length+slots.length<count;i++){
        const p={x:boundary.left+margin+((i*.61803398875)%1)*(boundary.right-boundary.left-2*margin),
          y:boundary.top+margin+((i*.75487766625)%1)*(boundary.bottom-boundary.top-2*margin)};
        if(coreClearCircle(p,margin)&&reserved.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=Math.max(1,separation))
          &&slots.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=Math.max(1,separation)))slots.push(p);
      }
      if(reserved.length+slots.length===count)break;
    }
    for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
    const authored=p=>({...p,authored:true});
    const layout=[player?authored(player):slots.shift(),...enemies.map(authored),...slots].filter(Boolean);
    return layout.map(p=>({...p,angle:spawnFacingAngle(p,boundary)}));
  }
  const slots=ctx.arenaDefinition?.spawnPoints?.map(p=>({...p}))??[{x:cx,y:boundary.top+margin},{x:boundary.left+margin,y:cy},{x:boundary.right-margin,y:cy},{x:cx,y:boundary.bottom-margin}];
  for (const p of slots) if (!coreClearCircle(p, CONFIG.startup.spawnMarginCm)) throw Error('Стартовая точка пересекается с препятствием');
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  // Spawn position remains shuffled, but every patient faces the true
  // centre of the selected arena on every new round.
  return slots.map(p => ({
    ...p,
    angle: spawnFacingAngle(p,boundary)
  }));
}
export function rebuildRobots() {
  const layout = chooseSpawnLayout();
  for (const group of [ctx.conesG, ctx.flashlightsG, ctx.groundG, ctx.actorsG, ctx.lightHoles, ctx.lightGradients, ctx.trailsG]) group.replaceChildren();
  ctx.robots.length = 0;
  const encounter=ctx.mode==='tower'?ensureBossEncounter(ctx.towerRun):null;
  // Newly generated floor plans guarantee collision-free FULL bodies, not
  // merely clear centre points. Preserve historical unplanned tower layouts.
  const plannedFloor=ctx.mode==='tower'&&ctx.towerRun?.floorPlan?.floor===ctx.towerRun?.level;
  const preflight=Boolean(encounter||plannedFloor||layout.some(p=>p.authored));
  const normalRig=preflight?standardNeutralBody():null;
  const playerBody=ctx.mode==='tower'?towerPatientAnatomy(ctx.towerRun):null;
  const rigs=preflight?layout.map((_,id)=>encounter&&id===1
    ?{body:bossAnatomy(encounter.variant),scaleMultiplier:BOSS_CONFIG.scale}
    :{body:id===0&&playerBody?playerBody:normalRig,scaleMultiplier:1}):null;
  const starts=preflight?planNeutralRigSpawns(layout,rigs):layout;
  if(!starts)throw Error('Не удалось разместить всех пациентов без пересечений арены');
  // Reserve space for the patient's grafted anatomy in the exact same
  // preflight used by the longer boss rigs.
  starts.forEach((start,id)=>{
    const skinKey=ctx.mode==='tower'&&id>0?ctx.towerGarage?.[id]?.skinKey:null;
    ctx.robots.push(encounter&&id===1?createBoss(id,start,encounter):createRobot(id,start,
      id===0&&playerBody?playerBody:skinKey?{skinKey}:{}));
  });
  ctx.robots.forEach(r => r.setVisible(false));
}
// Один робот: скелет, опоры, хвост, анимации и отрисовка.
