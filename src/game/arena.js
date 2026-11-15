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
    ...b,
    points
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
    const slots=[];const count=ctx.ROBOT_COUNT;
    for(const separation of [65,48,32,16,0]){
      for(let i=0;i<Math.max(3000,count*100)&&slots.length<count;i++){
        const p={x:boundary.left+margin+((i*.61803398875)%1)*(boundary.right-boundary.left-2*margin),
          y:boundary.top+margin+((i*.75487766625)%1)*(boundary.bottom-boundary.top-2*margin)};
        if(coreClearCircle(p,margin)&&slots.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=separation))slots.push(p);
      }
      if(slots.length===count)break;
    }
    for(let i=slots.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[slots[i],slots[j]]=[slots[j],slots[i]];}
    return slots.map(p=>({...p,angle:spawnFacingAngle(p,boundary)}));
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
  for (const group of [ctx.conesG, ctx.groundG, ctx.actorsG, ctx.lightHoles, ctx.lightGradients, ctx.trailsG]) group.replaceChildren();
  ctx.robots.length = 0;
  const encounter=ctx.mode==='tower'?ensureBossEncounter(ctx.towerRun):null;
  layout.forEach((p,id)=>ctx.robots.push(encounter&&id===1?createBoss(id,p,encounter):createRobot(id,p)));
  ctx.robots.forEach(r => r.setVisible(false));
}
// Один робот: скелет, опоры, хвост, анимации и отрисовка.
