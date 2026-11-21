// Location files use local centimetres and clockwise vertices in screen coordinates.
const EPSILON=1e-7;
export const validLocationId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)&&id!=='active'&&id!=='fallback-ward';
export const locationDimensions=({size,width=size,height=size})=>({width,height});
function rectangleBoundary(width,height,cut=0){
 return cut?[[cut,0],[width-cut,0],[width,cut],[width,height-cut],
  [width-cut,height],[cut,height],[0,height-cut],[0,cut]]:[[0,0],[width,0],[width,height],[0,height]];
}
export function locationBoundary(location){
 const {width,height}=locationDimensions(location);
 return location.boundary??rectangleBoundary(width,height,location.cornerCut);
}
export function roundPoints([x,y],radius){
 return Array.from({length:48},(_,i)=>{
  const angle=2*Math.PI*i/48;
  return [x+Math.cos(angle)*radius,y+Math.sin(angle)*radius];
 });
}
const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const edges=points=>points.map((a,i)=>[a,points[(i+1)%points.length]]);
function inset(sides,p){
 return Math.min(...sides.map(([a,b])=>cross(a,b,p)/distance(a,b)));
}
function closestPoint(p,a,b){
 const dx=b[0]-a[0],dy=b[1]-a[1];
 const t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
 return [a[0]+t*dx,a[1]+t*dy];
}
function segmentGap(a,b,c,d){
 const opposite=(x,y)=>x>0&&y<0||x<0&&y>0;
 if(opposite(cross(a,b,c),cross(a,b,d))&&opposite(cross(c,d,a),cross(c,d,b)))return {width:0};
 const candidates=[[a,closestPoint(a,c,d)],[b,closestPoint(b,c,d)],
  [closestPoint(c,a,b),c],[closestPoint(d,a,b),d]];
 return candidates.reduce((best,[from,to])=>{
  const width=distance(from,to);
  return width<best.width?{width,from,to}:best;
 },{width:Infinity});
}
function polygonGap(first,second){
 let best={width:Infinity};
 for(const [a,b] of first)for(const [c,d] of second){
  const gap=segmentGap(a,b,c,d);
  if(gap.width<best.width)best=gap;
  if(best.width<EPSILON)return best;
 }
 return best;
}
export function locationPassages(location){
 const boundary=edges(locationBoundary(location));
 const shapes=location.objects.map(object=>edges(object.points));
 const passages=[];
 const add=(gap,first,second)=>{
  // Touching or overlapping sections can form a single wall.
  if(gap.width>EPSILON)passages.push({...gap,first,second});
 };
 for(const [i,shape] of shapes.entries()){
  const shellGap=polygonGap(shape,boundary);
  if(shellGap.width>EPSILON)add(shellGap,i,null);
  else{
   const openSides=boundary.map(edge=>polygonGap(shape,[edge])).filter(gap=>gap.width>EPSILON);
   if(openSides.length)add(openSides.reduce((a,b)=>a.width<b.width?a:b),i,null);
  }
  for(let j=0;j<i;j++){
   if(inPolygon(shapes[j],shape[0][0])||inPolygon(shape,shapes[j][0][0]))continue;
   add(polygonGap(shape,shapes[j]),i,j);
  }
 }
 return passages.sort((a,b)=>a.width-b.width);
}
export function polygonCenter(points){
 const sides=edges(points);
 let area=0,x=0,y=0;
 for(const [a,b] of sides){
  const weight=a[0]*b[1]-a[1]*b[0];
  area+=weight;
  x+=(a[0]+b[0])*weight;
  y+=(a[1]+b[1])*weight;
 }
 return [x/(3*area),y/(3*area)];
}
export function rotatePolygon(points,degrees,[x,y]=polygonCenter(points)){
 const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
 return points.map(([px,py])=>[x+(px-x)*c-(py-y)*s,y+(px-x)*s+(py-y)*c]);
}
export function wallPoints(a,b,width){
 const length=distance(a,b);
 if(length<EPSILON)throw Error('Укажите два разных конца стены.');
 const x=-(b[1]-a[1])*width/(2*length),y=(b[0]-a[0])*width/(2*length);
 return [[a[0]-x,a[1]-y],[b[0]-x,b[1]-y],[b[0]+x,b[1]+y],[a[0]+x,a[1]+y]];
}
export function mirroredPoints(points,dimensions,flipX,flipY){
 const {width,height}=locationDimensions(typeof dimensions==='number'?{size:dimensions}:dimensions);
 const copy=points.map(([x,y])=>[flipX?width-x:x,flipY?height-y:y]);
 return flipX!==flipY?copy.reverse():copy;
}
export function mirrorModes(x,y){
 return [[false,false],...(x?[[true,false]]:[]),...(y?[[false,true]]:[]),...(x&&y?[[true,true]]:[])];
}
export function fitsBoundary(points,location){
 const sides=edges(locationBoundary(location));
 return points.every(p=>inset(sides,p)>=-EPSILON);
}
const finite=(value,min,max)=>Number.isFinite(value)&&min<=value&&value<=max;
function readPoints(points,{width,height},min,max){
 const bounds=[width,height];
 if(!Array.isArray(points)||points.length<min||points.length>max||
  points.some(p=>!Array.isArray(p)||p.length!==2||!p.every((v,i)=>finite(v,-EPSILON,bounds[i]+EPSILON))))
  throw Error('Некорректные координаты в сантиметрах.');
 return points.map(p=>p.map((v,i)=>Math.max(0,Math.min(bounds[i],v))));
}
function inPolygon(sides,[x,y]){
 let inside=false;
 for(const [[ax,ay],[bx,by]] of sides){
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
 }
 return inside;
}
const area2=points=>edges(points).reduce((sum,[a,b])=>sum+a[0]*b[1]-a[1]*b[0],0);
const isConvex=points=>points.every((p,i)=>cross(p,points[(i+1)%points.length],points[(i+2)%points.length])>EPSILON);
function convexHull(points){
 const sorted=[...new Set(points)].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 const chain=vertices=>{
  const side=[];
  for(const p of vertices){
   while(side.length>1&&cross(side.at(-2),side.at(-1),p)<=EPSILON)side.pop();
   side.push(p);
  }
  return side.slice(0,-1);
 };
 return [...chain(sorted),...chain(sorted.toReversed())];
}
export function convexParts(points){
 if(isConvex(points))return [points];
 const vertices=[...points],parts=[];
 while(vertices.length>3){
  const ear=vertices.findIndex((b,i)=>{
   const a=vertices.at(i-1),c=vertices[(i+1)%vertices.length];
   return cross(a,b,c)>EPSILON&&!vertices.some(p=>p!==a&&p!==b&&p!==c&&
    cross(a,b,p)>=-EPSILON&&cross(b,c,p)>=-EPSILON&&cross(c,a,p)>=-EPSILON);
  });
  if(ear<0)throw Error('Не удалось построить замкнутый контур.');
  parts.push([vertices.at(ear-1),vertices[ear],vertices[(ear+1)%vertices.length]]);
  vertices.splice(ear,1);
 }
 parts.push(vertices);
 // Recombine ears when their union stays convex.
 for(let i=0;i<parts.length;i++){
  for(let j=i+1;j<parts.length;j++){
   if(parts[i].filter(p=>parts[j].includes(p)).length<2)continue;
   const hull=convexHull([...parts[i],...parts[j]]);
   if(Math.abs(area2(hull)-area2(parts[i])-area2(parts[j]))>EPSILON)continue;
   parts[i]=hull;
   parts.splice(j,1);
   j=i;
  }
 }
 return parts;
}
export function closePolygon(input){
 const points=input.slice();
 if(points.length>1&&distance(points[0],points.at(-1))<EPSILON)points.pop();
 if(points.length<3||points.length>96)throw Error('Контур должен содержать от 3 до 96 вершин.');
 const sides=edges(points);
 for(const [i,[a,b]] of sides.entries()){
  if(distance(a,b)<EPSILON)throw Error('Вершины контура не должны повторяться.');
  for(let j=i+2;j<sides.length;j++){
   if(i===0&&j===sides.length-1)continue;
   if(segmentGap(a,b,...sides[j]).width<EPSILON)throw Error('Отрезки контура не должны пересекаться.');
  }
 }
 for(let i=points.length-1;i>=0&&points.length>=3;i--){
  const a=points.at(i-1),b=points[i],c=points[(i+1)%points.length];
  if(Math.abs(cross(a,b,c))<=EPSILON){
   if((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])<=0)throw Error('Отрезки контура не должны накладываться.');
   points.splice(i,1);
  }
 }
 const signedArea=area2(points);
 if(points.length<3||Math.abs(signedArea)<EPSILON)throw Error('У контура должна быть ненулевая площадь.');
 return signedArea>0?points:points.reverse();
}
function readPolygon(raw,dimensions,convexOnly=false){
 const points=closePolygon(readPoints(raw,dimensions,3,96));
 if(convexOnly&&!isConvex(points))throw Error('Внешний контур арены должен быть выпуклым.');
 return points;
}
function clearanceTest(location,margin){
 const boundary=edges(locationBoundary(location));
 const shapes=location.objects.map(object=>edges(object.points));
 return p=>inset(boundary,p)>=margin-EPSILON&&shapes.every(sides=>{
  if(inPolygon(sides,p))return false;
  return sides.every(([a,b])=>distance(p,closestPoint(p,a,b))>margin);
 });
}
function automaticSpawns(location,clear,needed,existing=[]){
 const positions=[...existing];
 const {width,height}=locationDimensions(location);
 for(let i=0;i<3000&&positions.length<needed;i++){
  const p=[((.5+i*.61803398875)%1)*width,((.5+i*.75487766625)%1)*height];
  if(clear(p)&&positions.every(q=>distance(p,q)>=65))positions.push(p);
 }
 return positions;
}
export function parseLocation(raw,{id,spawnMargin=60}={}){
 if(!raw||raw.version!==1||!validLocationId(raw.id)||id!==undefined&&raw.id!==id)
  throw Error('Неверная версия или идентификатор локации.');
 const dimensions=locationDimensions(raw),{width,height}=dimensions;
 const shortest=Math.min(width,height),{capacity}=raw,name=typeof raw.name==='string'?raw.name.trim():'';
 const minPassage=raw.minPassage??120;
 if(!name||name.length>80||/[\r\n\t]/.test(name))throw Error('Укажите название длиной до 80 символов.');
 if(![width,height].every(v=>Number.isInteger(v)&&finite(v,300,1600))||!Number.isInteger(capacity)||!finite(capacity,2,10)||
  !finite(minPassage,20,shortest))throw Error('Проверьте размер, вместимость и минимальную ширину прохода.');
 const location={version:1,id:raw.id,name,...(width===height?{size:width}:dimensions),capacity,minPassage};
 if(raw.boundary!==undefined)location.boundary=readPolygon(raw.boundary,dimensions,true);
 else{
  location.cornerCut=raw.cornerCut??0;
  if(!finite(location.cornerCut,0,shortest/2-1))throw Error('Некорректный срез углов.');
 }
 if(!Array.isArray(raw.objects)||raw.objects.length>64)throw Error('Допускается до 64 стен и препятствий.');
 location.objects=raw.objects.map((object,i)=>{
  if(!object||!['wall','obstacle'].includes(object.kind))throw Error('Неизвестный тип объекта.');
  const points=readPolygon(object.points,dimensions);
  if(object.kind==='wall'&&!isConvex(points))throw Error('У стены должен быть выпуклый контур.');
  if(!isConvex(points)){
   if(points.length>32)throw Error('Вогнутое препятствие может содержать до 32 вершин.');
   convexParts(points);
  }
  if(!fitsBoundary(points,location))throw Error('Объект №'+(i+1)+' выходит за границы арены.');
  const pivot=object.pivot===undefined?null:readPoints([object.pivot],dimensions,1,1)[0];
  return {kind:object.kind,points,...(pivot?{pivot}:{})};
 });
 const clear=clearanceTest(location,spawnMargin);
 if(raw.spawns!==undefined){
  location.spawns=readPoints(raw.spawns,dimensions,4,4);
  if(!location.spawns.every(clear)||location.spawns.some((p,i)=>location.spawns.slice(0,i).some(q=>distance(p,q)<65)))
   throw Error('Стартовым точкам не хватает свободного места.');
 }
 if(raw.towerSpawns!==undefined){
  const authored=raw.towerSpawns;
  if(!authored||typeof authored!=='object'||Array.isArray(authored))throw Error('Некорректные точки старта Башни.');
  const player=authored.player===undefined?null:readPoints([authored.player],dimensions,1,1)[0];
  const opponents=authored.opponents===undefined?[]:readPoints(authored.opponents,dimensions,0,9);
  const positions=player?[player,...opponents]:opponents;
  if(!positions.every(clear)||positions.some((p,i)=>positions.slice(0,i).some(q=>distance(p,q)<65)))
   throw Error('Точкам старта Башни не хватает места. Разведите их и отодвиньте от стен и препятствий.');
  if(positions.length){
   const activeOpponents=opponents.slice(0,capacity-1);
   const reserved=player?[player,...activeOpponents]:activeOpponents;
   if(automaticSpawns(location,clear,capacity,reserved).length<capacity)
    throw Error('Для заданных стартов Башни не хватает свободных мест.');
   location.towerSpawns={...(player?{player}:{}),...(opponents.length?{opponents}:{})};
  }
 }
 const slots=automaticSpawns(location,clear,Math.max(capacity,4),location.spawns);
 if(slots.length<Math.max(capacity,4))throw Error('Для указанной вместимости не хватает безопасных стартовых точек.');
 if(raw.patrol!==undefined){
  location.patrol=readPoints(raw.patrol,dimensions,1,24);
  if(!location.patrol.every(clearanceTest(location,0)))throw Error('Точки патруля должны находиться на свободном полу.');
 }
 return {location,spawns:location.spawns??slots.slice(0,4),patrol:location.patrol??slots.slice(0,8)};
}

export const polygonKey=points=>points.map(p=>p.map(v=>Math.round(v*1e5)).join(',')).sort().join(';');
export function mirroredObjects(object,size,modes){
 const variants=new Map();
 for(const [x,y] of modes){
  const points=mirroredPoints(object.points,size,x,y);
  const key=polygonKey(points);
  const pivot=object.pivot?mirroredPoints([object.pivot],size,x,y)[0]:null;
  if(!variants.has(key))variants.set(key,{kind:object.kind,points,...(pivot?{pivot}:{})});
 }
 return [...variants.values()];
}
