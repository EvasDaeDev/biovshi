// World coordinates are centimetres; blueprint coordinates below are metres.
// All outer boundaries and obstacles are convex clockwise polygons. Concave
// boundaries require a different collision representation.
const point=(x,y,offset)=>({x:offset+x*100,y:offset+y*100});
function arenaFromPlan(id,title,metres,boundary,obstacles,patrol){
 const size=Math.round(metres*100),left=(700-size)/2,top=left;
 const vertices=pairs=>pairs.map(([x,y])=>point(x,y,left));
 const blocks=obstacles.map(pairs=>{
  const points=vertices(pairs);
  return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),
    top:Math.min(...points.map(p=>p.y)),bottom:Math.max(...points.map(p=>p.y)),points};
 });
 return {id,name:`${title} · ${metres} × ${metres} м`,size,left,top,
  points:vertices(boundary),obstacles:blocks,patrolPoints:vertices(patrol),
  preview:boundary.map(([x,y])=>`${x*100/metres},${y*100/metres}`).join(' ')};
}
export const NEW_ARENAS=Object.freeze({
 sluice:arenaFromPlan('sluice','Шлюз',6,
  [[.8,0],[5.2,0],[6,.8],[6,5.2],[5.2,6],[.8,6],[0,5.2],[0,.8]],
  [[[2.05,2.45],[2.45,2.05],[3.95,3.55],[3.55,3.95]]],
  [[2.25,3.75],[5,.75],[1,.75],[5.25,5],[3,1.5],[4.5,3],[.75,5],[.75,2.75]]),
 zigzag:arenaFromPlan('zigzag','Зигзаг',7.5,
  [[1.1,0],[6.3,0],[7.5,1.1],[7.5,6],[6.4,7.5],[1,7.5],[0,6.3],[0,1]],
  [[[2,1.8],[2.7,1.8],[2.7,4.1],[2,4.1]],[[4.8,3.4],[5.5,3.4],[5.5,5.7],[4.8,5.7]]],
  [[3.75,3.75],[.75,1.25],[1.25,6.75],[6.75,1.25],[6,6.75],[3.75,.75],[1,4],[6.5,4]]),
 columns:arenaFromPlan('columns','Колоннада',9,
  [[2,0],[7,0],[9,2],[9,7],[7,9],[2,9],[0,7],[0,2]],
  [[[2.1,2.1],[3,2.1],[3,3],[2.1,3]],[[6,2.1],[6.9,2.1],[6.9,3],[6,3]],
   [[2.1,6],[3,6],[3,6.9],[2.1,6.9]],[[6,6],[6.9,6],[6.9,6.9],[6,6.9]]],
  [[4.5,4.5],[.75,2.25],[.75,6.75],[6.75,.75],[6.75,8.25],[8.25,4.25],[3.5,.75],[3.5,8.25]]),
 throat:arenaFromPlan('throat','Горловина',10,
  [[1.6,0],[7.6,0],[9.1,.7],[10,2.2],[10,8.2],[8.4,10],[1.6,10],[0,8.6],[0,1.5]],
  [[[2,3.1],[3.85,3.9],[3.85,6.1],[2,6.9]],
   [[6.15,3.9],[8,3.1],[8,6.9],[6.15,6.1]]],
  [[5,5],[.75,1.75],[.75,8.25],[8.25,9.25],[8.25,1],[9.25,5],[4.5,8.75],[4.5,.75]])
});
