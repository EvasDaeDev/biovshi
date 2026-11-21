import {
 closePolygon,convexParts,fitsBoundary,locationBoundary,locationDimensions,locationPassages,mirrorModes,mirroredObjects,
 parseLocation,polygonCenter,polygonKey,rotatePolygon,roundPoints,validLocationId,wallPoints,
} from '../src/game/location-geometry.js';
import {neutralCapsules} from '../src/robot/neutral-pose.js';

const $=id=>document.getElementById(id);
const svg=$('blueprint'),drawing=$('drawing');
const buttons=[...document.querySelectorAll('[data-tool]')];
const draft=()=>({version:1,id:'new-arena',name:'Новая арена',size:700,capacity:6,minPassage:120,cornerCut:25,objects:[]});
let location=draft(),history=[],tool='select',selected=null,gesture=null,checked=null,catalogRequest=0;
let outline=[],outlineTip=null,selectedSpawn=null,mannequin=null,editPivot=false;
const patientOutline=neutralCapsules({x:0,y:0,angle:0});
const rotationStep=5;
const selectionHelp='Выделите объект. Кольцо поворачивает, стрелки перемещают, квадрат меняет масштаб. Delete удаляет выделенное.';
const modes=()=>mirrorModes($('mirror-x').checked,$('mirror-y').checked);
const number=id=>$(id).valueAsNumber;
function message(text='',error=false){
 $('status').textContent=text;
 $('status').dataset.error=String(error);
}
function invalidate(){
 checked=null;
 $('gaps').replaceChildren();
 message();
}
function svgElement(tag,attributes,parent=drawing){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
 parent.append(node);
 return node;
}
const pointsText=points=>points.map(p=>p.join(',')).join(' ');
const line=(from,to,attrs)=>svgElement('line',{x1:from[0],y1:from[1],x2:to[0],y2:to[1],...attrs});
function orbit(object){
 if(!object)return new Set();
 const variants=mirroredObjects(object,location,modes());
 return new Set(variants.map(o=>polygonKey(o.points)));
}
function drawObject(object,className,index){
 svgElement('polygon',{class:'object '+object.kind+' '+className,points:pointsText(object.points),
  ...(index===undefined?{}:{'data-index':index})});
}
function drawSpawn(point,role,index){
 const active=selectedSpawn?.role===role&&selectedSpawn.index===index;
 const [x,y]=active&&gesture?.spawn?gesture.current:point;
 const marker=svgElement('g',{class:'spawn-marker '+role+(active?' selected':''),
  'data-spawn-role':role,'data-spawn-index':index,transform:'translate('+x+' '+y+')'});
 svgElement('circle',{r:10},marker);
 svgElement('text',{},marker).textContent=role==='player'?'И':String(index+1);
}
function drawMannequin(){
 if(!mannequin)return;
 const {point,angle}=mannequin;
 const group=svgElement('g',{class:'patient-mannequin',transform:'translate('+point.join(' ')+') rotate('+angle+')'});
 for(const {a,b,r} of patientOutline){
  if(a.x===b.x&&a.y===b.y)svgElement('circle',{cx:a.x,cy:a.y,r},group);
  else svgElement('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,'stroke-width':2*r},group);
 }
}
const objectPivot=object=>object.pivot??polygonCenter(object.points);
function drawGizmo(object){
 const pivot=objectPivot(object);
 const matrix=svg.getScreenCTM();
 const unit=1/(Math.hypot(matrix?.a??1,matrix?.b??0)||1),radius=42*unit;
 const group=svgElement('g',{class:'transform-gizmo'+(editPivot?' gizmo-editing':''),transform:'translate('+pivot.join(' ')+')'});
 if(!editPivot){
  svgElement('circle',{class:'gizmo-ring',r:radius,'pointer-events':'none'},group);
  svgElement('circle',{class:'gizmo-ring-hit',r:radius,'data-transform':'rotate'},group);
  const stem=33*unit,tip=53*unit,half=5*unit;
  svgElement('line',{class:'gizmo-axis gizmo-x',x1:0,y1:0,x2:stem,y2:0},group);
  svgElement('polygon',{class:'gizmo-x',points:`${stem},${-half} ${tip},0 ${stem},${half}`,'data-transform':'x'},group);
  svgElement('line',{class:'gizmo-axis gizmo-y',x1:0,y1:0,x2:0,y2:stem},group);
  svgElement('polygon',{class:'gizmo-y',points:`${-half},${stem} 0,${tip} ${half},${stem}`,'data-transform':'y'},group);
  svgElement('rect',{class:'gizmo-scale',x:-40*unit,y:-40*unit,width:10*unit,height:10*unit,'data-transform':'scale'},group);
 }
 svgElement('circle',{class:'gizmo-center',r:6*unit,'data-transform':editPivot?'pivot':'move'},group);
 if(gesture?.handle==='rotate')svgElement('text',{class:'gizmo-label',x:0,y:-55*unit,'font-size':13*unit},group).textContent=(gesture.degrees??0)+'°';
}
function render(){
 const {width,height}=locationDimensions(location),{objects}=location,margin=Math.max(12,Math.max(width,height)*.035);
 svg.setAttribute('viewBox',[-margin,-margin,width+2*margin,height+2*margin].join(' '));
 drawing.replaceChildren();
 svgElement('polygon',{class:'field',points:pointsText(locationBoundary(location))});
 if($('mirror-x').checked)line([width/2,0],[width/2,height],{class:'axis'});
 if($('mirror-y').checked)line([0,height/2],[width,height/2],{class:'axis'});
 const picked=objects[selected],keySet=orbit(picked);
 objects.forEach((o,i)=>drawObject(o,picked?.kind===o.kind&&keySet.has(polygonKey(o.points))?'selected':'',i));
 if(gesture?.preview)for(const o of gesture.preview)drawObject(o,'preview');
 else if(gesture&&tool!=='select')line(gesture.start,gesture.current,{class:'guide'});
 if(outline.length){
  const points=outlineTip?[...outline,outlineTip]:outline;
  svgElement('polyline',{class:'guide',fill:'none',points:pointsText(points)});
  svgElement('circle',{class:'polygon-start',cx:outline[0][0],cy:outline[0][1],r:6});
 }
 $('close-polygon').disabled=outline.length<3;
 if(checked){
  for(const gap of checked.narrow.slice(0,24))line(gap.from,gap.to,{class:'gap'});
  for(const [cx,cy] of checked.spawns)svgElement('circle',{class:'spawn',cx,cy,r:5});
 }
 const {player,opponents=[]}=location.towerSpawns??{};
 if(player)drawSpawn(player,'player',0);
 opponents.forEach((point,index)=>drawSpawn(point,'opponent',index));
 drawMannequin();
 if(picked&&tool==='select')drawGizmo(gesture?.object&&gesture.next?gesture.next:picked);
 $('edit-pivot').disabled=tool!=='select'||!picked;
 $('edit-pivot').setAttribute('aria-pressed',String(editPivot&&tool==='select'&&Boolean(picked)));
 if(tool==='select')$('tool-help').textContent=editPivot&&picked?'Перетащите золотой пивот на новое место.':selectionHelp;
 $('reset-pivot').disabled=!picked?.pivot;
 $('spawn-count').textContent=(player?'Игрок задан':'Игрок авто')+' · '+opponents.length+' / 9';
 $('clear-mannequin').disabled=!mannequin;
 const canRotate=tool==='mannequin'?Boolean(mannequin):Boolean(picked);
 $('rotate-left').disabled=$('rotate-right').disabled=!canRotate;
 $('object-count').textContent=objects.length+' / 64';
 $('undo').disabled=!history.length&&!outline.length;
 $('delete').disabled=selected===null&&!selectedSpawn;
}
function updateFields(){
 $('name').value=location.name;
 $('location-id').value=location.id;
 const {width,height}=locationDimensions(location),shortest=Math.min(width,height);
 $('width').value=width;
 $('height').value=height;
 $('capacity').value=location.capacity;
 $('passage').value=location.minPassage;
 $('passage').max=shortest;
 $('cut').max=Math.floor(shortest/2-1);
 $('cut').value=location.cornerCut??'';
 $('cut').disabled=Boolean(location.boundary);
 $('contour-note').hidden=!location.boundary;
}
function saveHistory(){
 history.push(structuredClone(location));
 if(history.length>30)history.shift();
}
function setLocation(next){
 cancelGesture();
 clearOutline();
 saveHistory();
 location=next;
 selected=null;
 selectedSpawn=null;
 editPivot=false;
 mannequin=null;
 updateFields();
 invalidate();
 render();
}
function clearOutline(){outline=[];outlineTip=null;}
function setTool(next){
 cancelGesture();
 clearOutline();
 tool=next;
 editPivot=false;
 if(next==='mannequin'){selected=null;selectedSpawn=null;}
 svg.dataset.tool=tool;
 $('close-polygon').hidden=tool!=='polygon';
 for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
 $('tool-help').textContent={
  select:selectionHelp,
  wall:'Протяните от начала стены до конца.',
  obstacle:'Протяните между углами препятствия.',
  circle:'Потяните от центра до края круга, чтобы задать радиус.',
  polygon:'Отметьте вершины отрезков. Для замыкания нажмите на первую вершину или Enter.',
  'spawn-player':'Щёлкните по плану, чтобы поставить точку старта игрока.',
  'spawn-opponent':'Щёлкните по плану, чтобы добавить старт противника. Точки используются по порядку.',
  mannequin:'Щёлкните или перетащите болванку. Клавиши Q и E поворачивают её на 5°.',
 }[tool];
 render();
}
function editField(id,key,valid,value){
 $(id).addEventListener('change',()=>{
  const next=value();
  if(!valid(next)){updateFields();message('Проверьте значение поля.',true);return;}
  if(next===location[key])return;
  saveHistory();
  location[key]=next;
  invalidate();
  render();
 });
}
const inRange=(v,min,max)=>Number.isFinite(v)&&v>=min&&v<=max;
editField('name','name',v=>Boolean(v)&&v.length<=80,()=>$('name').value.trim());
editField('location-id','id',validLocationId,()=>$('location-id').value.trim());
editField('capacity','capacity',v=>Number.isInteger(v)&&inRange(v,2,10),()=>number('capacity'));
const shortestSide=()=>Math.min(...Object.values(locationDimensions(location)));
editField('passage','minPassage',v=>inRange(v,20,shortestSide()),()=>number('passage'));
$('cut').addEventListener('change',()=>{
 const cornerCut=number('cut');
 if(!inRange(cornerCut,0,shortestSide()/2-1)||!location.objects.every(o=>fitsBoundary(o.points,{...location,cornerCut}))){
  updateFields();message('Срез угла пересекает объект или выходит за допустимый размер.',true);return;
 }
 if(cornerCut!==location.cornerCut)setLocation({...location,cornerCut});
});
for(const field of ['width','height'])$(field).addEventListener('change',()=>{
 const width=number('width'),height=number('height'),before=locationDimensions(location);
 if(![width,height].every(v=>Number.isInteger(v)&&inRange(v,300,1600))){
  updateFields();message('Ширина и высота должны быть от 300 до 1600 см.',true);return;
 }
 if(width===before.width&&height===before.height)return;
 const sx=width/before.width,sy=height/before.height,uniform=Math.min(sx,sy);
 const points=ps=>ps.map(([x,y])=>[x*sx,y*sy]);
 const next={...location,width,height,minPassage:Math.min(width,height,location.minPassage),
  objects:location.objects.map(o=>{
   const n=o.points.length;
   const [cx,cy]=o.points.reduce(([u,v],[x,y])=>[u+x/n,v+y/n],[0,0]);
   const transform=([x,y])=>[cx*sx+(x-cx)*uniform,cy*sy+(y-cy)*uniform];
   return {...o,points:o.points.map(transform),...(o.pivot?{pivot:transform(o.pivot)}:{})};
  })};
 delete next.size;
 if(next.boundary)next.boundary=points(next.boundary);
 else next.cornerCut=Math.min(Math.min(width,height)/2-1,next.cornerCut*uniform);
 if(!next.objects.every(o=>fitsBoundary(o.points,next))){
  updateFields();message('При таком размере один из объектов выходит за границу.',true);return;
 }
 if(next.towerSpawns){
  const {player,opponents}=next.towerSpawns;
  next.towerSpawns={...(player?{player:points([player])[0]}:{}),
   ...(opponents?{opponents:points(opponents)}:{})};
 }
 if(next.spawns)next.spawns=points(next.spawns);
 if(next.patrol)next.patrol=points(next.patrol);
 setLocation(next);
});

function coordinate(event,snapped=true){
 const matrix=svg.getScreenCTM();
 if(!matrix)return null;
 const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
 if(!snapped)return [p.x,p.y];
 const step=Number($('snap').value);
 const {width,height}=locationDimensions(location);
 const snap=(value,max)=>Math.max(0,Math.min(max,Math.round(value/step)*step));
 return [snap(p.x,width),snap(p.y,height)];
}
function keepObjects(objects,reference){
 const keys=new Set(mirroredObjects(reference,location,modes()).map(o=>polygonKey(o.points)));
 return objects.filter(o=>o.kind!==reference.kind||!keys.has(polygonKey(o.points)));
}
function mergeObjects(base,additions){
 const keys=new Set(base.map(o=>o.kind+polygonKey(o.points)));
 return [...base,...additions.filter(o=>!keys.has(o.kind+polygonKey(o.points)))];
}
function placement(start,end){
 const [x,y]=start,[a,b]=end;
 if(x===a&&y===b)return null;
 if(tool==='circle')return {kind:'obstacle',points:roundPoints(start,Math.hypot(a-x,b-y))};
 if(tool==='wall'){
  const width=number('thickness');
  if(!inRange(width,5,160))throw Error('Толщина стены должна быть от 5 до 160 см.');
  return {kind:'wall',points:wallPoints(start,end,width)};
 }
 const left=Math.min(x,a),right=Math.max(x,a),top=Math.min(y,b),bottom=Math.max(y,b);
 if(left===right||top===bottom)return null;
 return {kind:'obstacle',points:[[left,top],[right,top],[right,bottom],[left,bottom]]};
}
function transformedObject(object,transform){
 return {...object,points:object.points.map(transform),...(object.pivot?{pivot:transform(object.pivot)}:{})};
}
function movedSelection(start,end,object,axis){
 const dx=axis==='y'?0:end[0]-start[0],dy=axis==='x'?0:end[1]-start[1];
 return dx||dy?transformedObject(object,([x,y])=>[x+dx,y+dy]):null;
}
function transformedSelection(point){
 const {start,object,handle}=gesture;
 if(handle==='pivot')return point.some((value,i)=>value!==start[i])?{...object,pivot:point}:null;
 if(handle!=='rotate'&&handle!=='scale')return movedSelection(start,point,object,handle);
 const pivot=objectPivot(object);
 const distance=p=>Math.hypot(p[0]-pivot[0],p[1]-pivot[1]);
 if(handle==='scale'){
  const ratio=Math.max(.1,Math.min(10,distance(point)/(distance(start)||1)));
  return Math.abs(ratio-1)>1e-6?{...object,points:object.points.map(([x,y])=>[pivot[0]+(x-pivot[0])*ratio,pivot[1]+(y-pivot[1])*ratio])}:null;
 }
 const angle=p=>Math.atan2(p[1]-pivot[1],p[0]-pivot[0]);
 const delta=(angle(point)-angle(start))*180/Math.PI;
 const degrees=Math.round((((delta+540)%360)-180)/rotationStep)*rotationStep;
 gesture.degrees=degrees;
 return degrees?{...object,points:rotatePolygon(object.points,degrees,pivot)}:null;
}
function saveSpawn(role,point,index){
 const {player,opponents=[]}=location.towerSpawns??{};
 const next={...(player?{player}:{}),opponents:[...opponents]};
 if(role==='player')next.player=point;
 else{
  index??=opponents.length;
  if(index>=9){message('Можно поставить до девяти точек старта противников.',true);return;}
  next.opponents[index]=point;
 }
 saveHistory();
 location.towerSpawns=next;
 selected=null;
 selectedSpawn={role,index:role==='player'?0:index};
 invalidate();
}
function rotateSelection(degrees){
 if(tool==='mannequin'&&mannequin){
  mannequin.angle=(mannequin.angle+degrees)%360;
 }else if(selected!==null){
  const object=location.objects[selected];
  try{commitObject({...object,points:rotatePolygon(object.points,degrees,objectPivot(object))},object);}
  catch(error){message(error.message,true);}
 }
 render();
}
svg.addEventListener('pointerdown',event=>{
 if(event.button!==0||gesture)return;
 const handle=tool==='select'?event.target.closest('[data-transform]')?.dataset.transform:null;
 const start=coordinate(event,handle!=='rotate'&&handle!=='scale');
 if(!start)return;
 if(handle&&selected!==null){
  svg.focus({preventScroll:true});
  svg.setPointerCapture(event.pointerId);
  gesture={pointer:event.pointerId,start,current:start,handle,object:location.objects[selected]};
  return;
 }
 if(tool==='mannequin'){
  mannequin={point:start,angle:mannequin?.angle??0};
  svg.focus({preventScroll:true});
  svg.setPointerCapture(event.pointerId);
  gesture={pointer:event.pointerId,start,current:start,mannequin:true};
  render();return;
 }
 const role=tool==='spawn-player'?'player':tool==='spawn-opponent'?'opponent':null;
 const marker=event.target.closest('[data-spawn-role]');
 if(marker&&(tool==='select'||role===marker.dataset.spawnRole)){
  selected=null;
  selectedSpawn={role:marker.dataset.spawnRole,index:Number(marker.dataset.spawnIndex)};
  svg.setPointerCapture(event.pointerId);
  gesture={pointer:event.pointerId,start,current:start,spawn:selectedSpawn};
  render();return;
 }
 if(role){saveSpawn(role,start);render();return;}
 if(tool==='polygon'){
  svg.focus({preventScroll:true});
  if(outline.length&&polygonKey([start])===polygonKey([outline[0]])){finishPolygon();return;}
  if(outline.length>=96){message('Контур может содержать до 96 вершин.',true);return;}
  outline.push(start);outlineTip=null;render();return;
 }
 if(tool==='select'){
  selectedSpawn=null;
  const index=event.target.closest('[data-index]')?.dataset.index;
  const next=index===undefined?null:Number(index);
  if(next!==selected)editPivot=false;
  selected=next;
  render();
  if(selected===null)return;
 }
 svg.setPointerCapture(event.pointerId);
 gesture={pointer:event.pointerId,start,current:start,object:tool==='select'?location.objects[selected]:null};
});
function updateGesture(point){
 gesture.current=point;
 const {start,object}=gesture;
 const next=object?transformedSelection(point):placement(start,point);
 gesture.next=next;
 gesture.preview=next?mirroredObjects(next,location,modes()):null;
 return next;
}
svg.addEventListener('pointermove',event=>{
 const point=coordinate(event,gesture?.handle!=='rotate'&&gesture?.handle!=='scale');
 if(!point)return;
 const radius=tool==='circle'&&gesture?Math.round(Math.hypot(point[0]-gesture.start[0],point[1]-gesture.start[1])):null;
 $('cursor').textContent='X '+Math.round(point[0])+' · Y '+Math.round(point[1])+' см'+(radius===null?'':' · R '+radius+' см');
 if(tool==='polygon'&&outline.length){outlineTip=point;render();return;}
 if(gesture?.pointer!==event.pointerId)return;
 if(gesture.spawn||gesture.mannequin){
  gesture.current=point;
  if(gesture.mannequin)mannequin.point=point;
  render();return;
 }
 try{updateGesture(point);}catch{gesture.preview=null;}
 render();
});
svg.addEventListener('pointerleave',()=>{$('cursor').textContent='X — · Y —';});
function cancelGesture(){
 if(!gesture)return;
 const pointer=gesture.pointer;
 gesture=null;
 if(svg.hasPointerCapture(pointer))svg.releasePointerCapture(pointer);
}
function commitObject(next,original=null,preview=mirroredObjects(next,location,modes())){
 const {width,height}=locationDimensions(location);
 if(preview.some(o=>o.pivot&&(o.pivot[0]<0||o.pivot[0]>width||o.pivot[1]<0||o.pivot[1]>height)))
  throw Error('Пивот должен находиться в пределах плана.');
 if(preview.some(o=>!fitsBoundary(o.points,location)))throw Error('Объект или его отражение выходит за внешний контур.');
 const base=original?keepObjects(location.objects,original):location.objects;
 const objects=mergeObjects(base,preview);
 if(objects.length>64)throw Error('Допускается до 64 стен и препятствий.');
 saveHistory();
 location.objects=objects;
 const index=objects.findIndex(o=>o.kind===next.kind&&polygonKey(o.points)===polygonKey(next.points));
 selected=index>=0?index:null;
 selectedSpawn=null;
 invalidate();
}
function finishPolygon(){
 if(outline.length<3)return;
 try{
  const points=closePolygon(outline);
  if(convexParts(points).length>1&&points.length>32)throw Error('Вогнутое препятствие может содержать до 32 вершин.');
  commitObject({kind:'obstacle',points});
  clearOutline();
 }catch(error){message(error.message,true);}
 render();
}
svg.addEventListener('pointerup',event=>{
 if(gesture?.pointer!==event.pointerId)return;
 try{
  const point=coordinate(event,gesture.handle!=='rotate'&&gesture.handle!=='scale');
  if(!point)return;
  if(gesture.spawn){
   if(point.some((value,i)=>value!==gesture.start[i]))saveSpawn(gesture.spawn.role,point,gesture.spawn.index);
   return;
  }
  if(gesture.mannequin){mannequin.point=point;return;}
  const next=updateGesture(point);
  if(next)commitObject(next,gesture.object,gesture.preview);
 }catch(error){message(error.message,true);}
 finally{cancelGesture();render();}
});
for(const event of ['pointercancel','lostpointercapture'])svg.addEventListener(event,()=>{
 if(gesture){cancelGesture();render();}
});
function removeSelected(){
 if(selected===null&&!selectedSpawn)return;
 saveHistory();
 if(selectedSpawn){
  const {player,opponents=[]}=location.towerSpawns;
  if(selectedSpawn.role==='player')location.towerSpawns={opponents};
  else location.towerSpawns={...(player?{player}:{}),opponents:opponents.filter((_,i)=>i!==selectedSpawn.index)};
 }else location.objects=keepObjects(location.objects,location.objects[selected]);
 selected=null;
 selectedSpawn=null;
 invalidate();
 render();
}
function undo(){
 if(outline.length){outline.pop();outlineTip=null;render();return;}
 if(!history.length)return;
 cancelGesture();
 location=history.pop();
 selected=null;
 selectedSpawn=null;
 updateFields();
 invalidate();
 render();
}
function check(){
 try{
  const result=parseLocation(location);
  const gaps=locationPassages(result.location);
  const narrow=gaps.filter(gap=>gap.width<location.minPassage-1e-7);
  checked={narrow,spawns:result.spawns};
  const format=value=>value.toLocaleString('ru-RU',{maximumFractionDigits:1});
  const status=gaps.length?'Наименьший зазор '+format(gaps[0].width)+' см.':'У отдельных объектов нет зазоров для проверки.';
  message(status+(narrow.length?' Узких зазоров: '+narrow.length+'.':''),narrow.length>0);
  $('gaps').replaceChildren(...narrow.slice(0,8).map(({first,second,width})=>{
   const item=document.createElement('li');
   const other=second===null?'граница арены':'объект '+(second+1);
   item.textContent='Объект '+(first+1)+' ↔ '+other+' · '+format(width)+' см';
   return item;
  }));
  render();
  return result.location;
 }catch(error){invalidate();message(error.message,true);render();return null;}
}
async function importFile(file){
 if(!file)return;
 const request=++catalogRequest;
 try{
  if(file.size>500_000)throw Error('Файл локации больше 500 КБ.');
  const raw=JSON.parse(await file.text());
  if(request!==catalogRequest)return;
  setLocation(parseLocation(raw).location);
  $('catalog').value='';
  message('Локация открыта.');
 }catch(error){if(request===catalogRequest)message('Ошибка импорта. '+error.message,true);}
}
function exportFile(){
 if(outline.length){message('Замкните контур или отмените его клавишей Esc.',true);return;}
 const result=check();
 if(!result)return;
 const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)+'\n'],{type:'application/json'}));
 const link=document.createElement('a');
 link.href=url;
 link.download=result.id+'.json';
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const folder=new URL('../locations/',document.baseURI);
async function readCatalogFile(file){
 const response=await fetch(new URL(file,folder),{cache:'no-store'});
 if(!response.ok)throw Error('Файл недоступен.');
 return response.json();
}
async function setupCatalog(){
 try{
  const manifest=await readCatalogFile('active.json');
  if(manifest?.version!==1||!Array.isArray(manifest.active))throw Error();
  for(const id of new Set(manifest.active.filter(validLocationId)))$('catalog').add(new Option(id,id));
 }catch{$('catalog').disabled=true;}
}
$('catalog').addEventListener('change',async()=>{
 const id=$('catalog').value,request=++catalogRequest;
 if(!validLocationId(id))return;
 try{
  const raw=await readCatalogFile(id+'.json');
  if(request!==catalogRequest)return;
  setLocation(parseLocation(raw,{id}).location);
  message('Локация открыта.');
 }catch(error){if(request===catalogRequest)message('Ошибка загрузки. '+error.message,true);}
});
$('new-map').onclick=()=>{catalogRequest++;$('catalog').value='';setLocation(draft());};
$('import').onclick=()=>$('file').click();
$('file').onchange=event=>{importFile(event.target.files[0]);event.target.value='';};
$('export').onclick=exportFile;
$('check').onclick=check;
$('delete').onclick=removeSelected;
$('edit-pivot').onclick=()=>{editPivot=!editPivot;render();};
$('reset-pivot').onclick=()=>{
 const object=location.objects[selected];
 if(!object?.pivot)return;
 const {pivot,...reset}=object;
 try{commitObject(reset,object);editPivot=false;}
 catch(error){message(error.message,true);}
 render();
};
$('rotate-left').onclick=()=>rotateSelection(-rotationStep);
$('rotate-right').onclick=()=>rotateSelection(rotationStep);
$('clear-mannequin').onclick=()=>{mannequin=null;render();};
$('undo').onclick=undo;
$('close-polygon').onclick=finishPolygon;
$('auto-spawns').onclick=()=>{
 const next={...location};
 delete next.spawns;
 delete next.towerSpawns;
 delete next.patrol;
 setLocation(next);
 check();
};
for(const button of buttons)button.onclick=()=>setTool(button.dataset.tool);
for(const id of ['mirror-x','mirror-y'])$(id).onchange=()=>{cancelGesture();render();};
document.addEventListener('keydown',event=>{
 if(event.target.closest?.('input,select,textarea'))return;
 if(event.key==='Delete')removeSelected();
 const rotationKey=event.code==='KeyQ'?'q':event.code==='KeyE'?'e':event.key.toLowerCase();
 if(!event.ctrlKey&&!event.metaKey&&!event.altKey&&['q','e'].includes(rotationKey)){
  event.preventDefault();rotateSelection(rotationKey==='q'?-rotationStep:rotationStep);
 }
 if(event.key==='Enter'&&(event.target===document.body||event.target===svg)&&tool==='polygon'&&outline.length){event.preventDefault();finishPolygon();}
 if(event.key.toLowerCase()==='z'&&(event.ctrlKey||event.metaKey)){event.preventDefault();undo();}
 if(event.key==='Escape'){cancelGesture();clearOutline();editPivot=false;selected=null;selectedSpawn=null;render();}
});
updateFields();
setTool('select');
setupCatalog();
