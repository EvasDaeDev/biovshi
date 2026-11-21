// Location files use local centimetres and clockwise vertices in screen coordinates.
const EPSILON=1e-7;
export const validLocationId=id=>typeof id==='string'&&/^[a-z0-9][a-z0-9_-]{0,39}$/.test(id)&&id!=='active'&&id!=='fallback-ward';
export function squareBoundary(size,cut=0){
 return cut?[[cut,0],[size-cut,0],[size,cut],[size,size-cut],
  [size-cut,size],[cut,size],[0,size-cut],[0,cut]]:[[0,0],[size,0],[size,size],[0,size]];
}
export const locationBoundary=location=>location.boundary??squareBoundary(location.size,location.cornerCut);
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
   if(inset(shapes[j],shape[0][0])>=0||inset(shape,shapes[j][0][0])>=0)continue;
   add(polygonGap(shape,shapes[j]),i,j);
  }
 }
 return passages.sort((a,b)=>a.width-b.width);
}
export function wallPoints(a,b,width){
 const length=distance(a,b);
 if(length<EPSILON)throw Error('Укажите два разных конца стены.');
 const x=-(b[1]-a[1])*width/(2*length),y=(b[0]-a[0])*width/(2*length);
 return [[a[0]-x,a[1]-y],[b[0]-x,b[1]-y],[b[0]+x,b[1]+y],[a[0]+x,a[1]+y]];
}
export function mirroredPoints(points,size,flipX,flipY){
 const copy=points.map(([x,y])=>[flipX?size-x:x,flipY?size-y:y]);
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
function readPoints(points,size,min,max){
 if(!Array.isArray(points)||points.length<min||points.length>max||
  points.some(p=>!Array.isArray(p)||p.length!==2||!p.every(v=>finite(v,-EPSILON,size+EPSILON))))
  throw Error('Некорректные координаты в сантиметрах.');
 return points.map(p=>p.map(v=>Math.max(0,Math.min(size,v))));
}
function readPolygon(raw,size){
 const points=readPoints(raw,size,3,96);
 for(let i=0;i<points.length;i++){
  const a=points[i],b=points[(i+1)%points.length];
  if(distance(a,b)<EPSILON||points.some((p,j)=>j!==i&&j!==(i+1)%points.length&&cross(a,b,p)<=EPSILON))
   throw Error('Контуры должны быть выпуклыми, с вершинами по часовой стрелке.');
 }
 return points;
}
function clearanceTest(location,margin){
 const boundary=edges(locationBoundary(location));
 const shapes=location.objects.map(object=>edges(object.points));
 return p=>inset(boundary,p)>=margin-EPSILON&&shapes.every(sides=>{
  if(inset(sides,p)>=0)return false;
  return sides.every(([a,b])=>distance(p,closestPoint(p,a,b))>margin);
 });
}
function automaticSpawns(location,clear,needed,existing=[]){
 const positions=[...existing];
 for(let i=0;i<3000&&positions.length<needed;i++){
  const p=[((.5+i*.61803398875)%1)*location.size,((.5+i*.75487766625)%1)*location.size];
  if(clear(p)&&positions.every(q=>distance(p,q)>=65))positions.push(p);
 }
 return positions;
}
export function parseLocation(raw,{id,spawnMargin=60}={}){
 if(!raw||raw.version!==1||!validLocationId(raw.id)||id!==undefined&&raw.id!==id)
  throw Error('Неверная версия или идентификатор локации.');
 const {size,capacity}=raw,name=typeof raw.name==='string'?raw.name.trim():'';
 const minPassage=raw.minPassage??120;
 if(!name||name.length>80||/[\r\n\t]/.test(name))throw Error('Укажите название длиной до 80 символов.');
 if(!Number.isInteger(size)||!finite(size,300,1600)||!Number.isInteger(capacity)||!finite(capacity,2,10)||
  !finite(minPassage,20,size))throw Error('Проверьте размер, вместимость и минимальную ширину прохода.');
 const location={version:1,id:raw.id,name,size,capacity,minPassage};
 if(raw.boundary!==undefined)location.boundary=readPolygon(raw.boundary,size);
 else{
  location.cornerCut=raw.cornerCut??0;
  if(!finite(location.cornerCut,0,size/2-1))throw Error('Некорректный срез углов.');
 }
 if(!Array.isArray(raw.objects)||raw.objects.length>64)throw Error('Допускается до 64 стен и препятствий.');
 location.objects=raw.objects.map((object,i)=>{
  if(!object||!['wall','obstacle'].includes(object.kind))throw Error('Неизвестный тип объекта.');
  const points=readPolygon(object.points,size);
  if(!fitsBoundary(points,location))throw Error('Объект №'+(i+1)+' выходит за границы арены.');
  return {kind:object.kind,points};
 });
 const clear=clearanceTest(location,spawnMargin);
 if(raw.spawns!==undefined){
  location.spawns=readPoints(raw.spawns,size,4,4);
  if(!location.spawns.every(clear)||location.spawns.some((p,i)=>location.spawns.slice(0,i).some(q=>distance(p,q)<65)))
   throw Error('Стартовым точкам не хватает свободного места.');
 }
 const slots=automaticSpawns(location,clear,Math.max(capacity,4),location.spawns);
 if(slots.length<Math.max(capacity,4))throw Error('Для указанной вместимости не хватает безопасных стартовых точек.');
 if(raw.patrol!==undefined){
  location.patrol=readPoints(raw.patrol,size,1,24);
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
  if(!variants.has(key))variants.set(key,{kind:object.kind,points});
 }
 return [...variants.values()];
}
