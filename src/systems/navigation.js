import { ctx } from "../game/state.js";
import { containsPoint, expandedObstacle } from "../game/arena.js";
import { coreClearCircle, nearestObstaclePoint, rectHit } from "./collision.js";
// Only static corners/edges are cached; moving start/goal links are checked on every call.
const arenaGraphs=new WeakMap();
function navigationGraph(padding) {
  let cache=arenaGraphs.get(ctx.obstacles);
  if(!cache||cache.planes!==ctx.arenaPlanes){cache={planes:ctx.arenaPlanes,entries:new Map()};arenaGraphs.set(ctx.obstacles,cache);}
  if(cache.entries.has(padding))return cache.entries.get(padding);
  const boxes=ctx.obstacles.map(b=>expandedObstacle(b,padding));
  const outer=ctx.obstacles.map(b=>expandedObstacle(b,padding+2));
  const corners=outer.flatMap(b=>b.points).filter(p=>coreClearCircle(p,Math.max(2,padding))&&!boxes.some(b=>containsPoint(b,p)));
  const edges=corners.map((a,i)=>corners.map((b,j)=>i===j?null:boxes.every(box=>rectHit(a,b,box)===null)?Math.hypot(a.x-b.x,a.y-b.y):null));
  const graph={boxes,outer,corners,edges};
  if(cache.entries.size>=8)cache.entries.delete(cache.entries.keys().next().value);
  cache.entries.set(padding,graph);
  return graph;
}
export
// Граф видимости: кратчайший обход углов всех кубов с запасом для лап.
function planPath(start, end, padding = 70) {
  const {boxes,outer,corners,edges}=navigationGraph(padding);
  const contains=containsPoint;
  let finish = {
    ...end
  };
  if (boxes.some(b => contains(b, finish))) {
    const exits = outer.map(b => nearestObstaclePoint(end,b).point).concat(corners).filter(p => coreClearCircle(p, padding) && !boxes.some(b => contains(b, p)));
    exits.sort((a, b) => Math.hypot(a.x - end.x, a.y - end.y) - Math.hypot(b.x - end.x, b.y - end.y));
    if (!exits.length) return [];
    finish = exits[0];
  }
  const nodes = [start, finish, ...corners],
    dist = nodes.map(() => Infinity),
    prev = nodes.map(() => -1),
    used = new Set();
  const clear = (a, b) => boxes.every(box => {
    // Из уже занятого запаса можно выйти; сам куб пересекать нельзя.
    if (a === start && contains(box, start)) return rectHit(a, b, null, 3) === null;
    return rectHit(a, b, box) === null;
  });
  dist[0] = 0;
  for (let k = 0; k < nodes.length; k++) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!used.has(i) && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || !Number.isFinite(dist[u])) break;
    if (u === 1) break;
    used.add(u);
    for (let v = 1; v < nodes.length; v++) {
      if(u===v)continue;
      const edge=u>=2&&v>=2?edges[u-2][v-2]:clear(nodes[u],nodes[v])?Math.hypot(nodes[u].x-nodes[v].x,nodes[u].y-nodes[v].y):null;
      if(edge===null)continue;
      const d = dist[u] + edge;
      if (d < dist[v]) {
        dist[v] = d;
        prev[v] = u;
      }
    }
  }
  // Нет безопасного маршрута — остаёмся на месте до нового решения ИИ.
  if (!Number.isFinite(dist[1])) return [{
    ...start
  }];
  const result = [];
  for (let i = 1; i > 0; i = prev[i]) result.unshift(nodes[i]);
  return result;
}
