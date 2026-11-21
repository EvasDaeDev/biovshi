import {
 fitsBoundary,locationBoundary,locationPassages,mirrorModes,mirroredObjects,
 parseLocation,polygonKey,validLocationId,wallPoints,
} from '../src/game/location-geometry.js';

const $=id=>document.getElementById(id);
const svg=$('blueprint'),drawing=$('drawing');
const buttons=[...document.querySelectorAll('[data-tool]')];
const draft=()=>({version:1,id:'new-arena',name:'Новая арена',size:700,capacity:6,minPassage:120,cornerCut:25,objects:[]});
let location=draft(),history=[],tool='select',selected=null,gesture=null,checked=null,catalogRequest=0;
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
function svgElement(tag,attributes){
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for(const [name,value] of Object.entries(attributes))node.setAttribute(name,value);
 drawing.append(node);
 return node;
}
const pointsText=points=>points.map(p=>p.join(',')).join(' ');
const line=(from,to,attrs)=>svgElement('line',{x1:from[0],y1:from[1],x2:to[0],y2:to[1],...attrs});
function orbit(object){
 if(!object)return new Set();
 const variants=mirroredObjects(object,location.size,modes());
 return new Set(variants.map(o=>polygonKey(o.points)));
}
function drawObject(object,className,index){
 svgElement('polygon',{class:'object '+object.kind+' '+className,points:pointsText(object.points),
  ...(index===undefined?{}:{'data-index':index})});
}
function render(){
 const {size,objects}=location,mid=size/2,margin=Math.max(12,size*.035);
 svg.setAttribute('viewBox',[-margin,-margin,size+2*margin,size+2*margin].join(' '));
 drawing.replaceChildren();
 svgElement('polygon',{class:'field',points:pointsText(locationBoundary(location))});
 if($('mirror-x').checked)line([mid,0],[mid,size],{class:'axis'});
 if($('mirror-y').checked)line([0,mid],[size,mid],{class:'axis'});
 const picked=objects[selected],keySet=orbit(picked);
 objects.forEach((o,i)=>drawObject(o,picked?.kind===o.kind&&keySet.has(polygonKey(o.points))?'selected':'',i));
 if(gesture?.preview)for(const o of gesture.preview)drawObject(o,'preview');
 else if(gesture&&tool!=='select')line(gesture.start,gesture.current,{class:'guide'});
 if(checked){
  for(const gap of checked.narrow.slice(0,24))line(gap.from,gap.to,{class:'gap'});
  for(const [cx,cy] of checked.spawns)svgElement('circle',{class:'spawn',cx,cy,r:5});
 }
 $('object-count').textContent=objects.length+' / 64';
 $('undo').disabled=!history.length;
 $('delete').disabled=selected===null;
}
function updateFields(){
 $('name').value=location.name;
 $('location-id').value=location.id;
 $('size').value=location.size;
 $('capacity').value=location.capacity;
 $('passage').value=location.minPassage;
 $('passage').max=location.size;
 $('cut').max=Math.floor(location.size/2-1);
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
 saveHistory();
 location=next;
 selected=null;
 updateFields();
 invalidate();
 render();
}
function setTool(next){
 cancelGesture();
 tool=next;
 svg.dataset.tool=tool;
 for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.tool===tool));
 $('tool-help').textContent={
  select:'Перетащите объект. Delete удаляет выделенное.',
  wall:'Протяните от начала стены до конца.',
  obstacle:'Протяните между углами препятствия.',
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
editField('passage','minPassage',v=>inRange(v,20,location.size),()=>number('passage'));
$('cut').addEventListener('change',()=>{
 const cornerCut=number('cut');
 if(!inRange(cornerCut,0,location.size/2-1)||!location.objects.every(o=>fitsBoundary(o.points,{...location,cornerCut}))){
  updateFields();message('Срез угла пересекает объект или выходит за допустимый размер.',true);return;
 }
 if(cornerCut!==location.cornerCut)setLocation({...location,cornerCut});
});
$('size').addEventListener('change',()=>{
 const size=number('size');
 if(!Number.isInteger(size)||!inRange(size,300,1600)){
  updateFields();message('Сторона арены должна быть от 300 до 1600 см.',true);return;
 }
 if(size===location.size)return;
 const scale=size/location.size,points=ps=>ps.map(([x,y])=>[x*scale,y*scale]);
 const next={...location,size,minPassage:Math.min(size,location.minPassage),
  objects:location.objects.map(o=>({...o,points:points(o.points)}))};
 if(next.boundary)next.boundary=points(next.boundary);
 else next.cornerCut=Math.min(size/2-1,next.cornerCut*scale);
 if(next.spawns)next.spawns=points(next.spawns);
 if(next.patrol)next.patrol=points(next.patrol);
 setLocation(next);
});

function coordinate(event){
 const matrix=svg.getScreenCTM();
 if(!matrix)return null;
 const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
 const step=Number($('snap').value);
 const snap=value=>Math.max(0,Math.min(location.size,Math.round(value/step)*step));
 return [snap(p.x),snap(p.y)];
}
function keepObjects(objects,reference){
 const keys=new Set(mirroredObjects(reference,location.size,modes()).map(o=>polygonKey(o.points)));
 return objects.filter(o=>o.kind!==reference.kind||!keys.has(polygonKey(o.points)));
}
function mergeObjects(base,additions){
 const keys=new Set(base.map(o=>o.kind+polygonKey(o.points)));
 return [...base,...additions.filter(o=>!keys.has(o.kind+polygonKey(o.points)))];
}
function placement(start,end){
 const [x,y]=start,[a,b]=end;
 if(x===a&&y===b)return null;
 if(tool==='wall'){
  const width=number('thickness');
  if(!inRange(width,5,160))throw Error('Толщина стены должна быть от 5 до 160 см.');
  return {kind:'wall',points:wallPoints(start,end,width)};
 }
 const left=Math.min(x,a),right=Math.max(x,a),top=Math.min(y,b),bottom=Math.max(y,b);
 if(left===right||top===bottom)return null;
 return {kind:'obstacle',points:[[left,top],[right,top],[right,bottom],[left,bottom]]};
}
function movedSelection(start,end,object){
 const dx=end[0]-start[0],dy=end[1]-start[1];
 if(!dx&&!dy)return null;
 return {...object,points:object.points.map(([x,y])=>[x+dx,y+dy])};
}
svg.addEventListener('pointerdown',event=>{
 if(event.button!==0||gesture)return;
 const start=coordinate(event);
 if(!start)return;
 if(tool==='select'){
  const index=event.target.closest('[data-index]')?.dataset.index;
  selected=index===undefined?null:Number(index);
  render();
  if(selected===null)return;
 }
 svg.setPointerCapture(event.pointerId);
 gesture={pointer:event.pointerId,start,current:start,object:tool==='select'?location.objects[selected]:null};
});
function updateGesture(point){
 gesture.current=point;
 const {start,object}=gesture;
 const next=object?movedSelection(start,point,object):placement(start,point);
 gesture.next=next;
 gesture.preview=next?mirroredObjects(next,location.size,modes()):null;
 return next;
}
svg.addEventListener('pointermove',event=>{
 const point=coordinate(event);
 if(!point)return;
 $('cursor').textContent='X '+point[0]+' · Y '+point[1]+' см';
 if(gesture?.pointer!==event.pointerId)return;
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
svg.addEventListener('pointerup',event=>{
 if(gesture?.pointer!==event.pointerId)return;
 try{
  const point=coordinate(event);
  const next=point&&updateGesture(point);
  if(!next)return;
  const {object,preview}=gesture;
  if(preview.some(o=>!fitsBoundary(o.points,location)))throw Error('Объект или его отражение выходит за внешний контур.');
  const base=object?keepObjects(location.objects,object):location.objects;
  const objects=mergeObjects(base,preview);
  if(objects.length>64)throw Error('Допускается до 64 стен и препятствий.');
  saveHistory();
  location.objects=objects;
  const index=objects.findIndex(o=>o.kind===next.kind&&polygonKey(o.points)===polygonKey(next.points));
  selected=index>=0?index:null;
  invalidate();
 }catch(error){message(error.message,true);}
 finally{cancelGesture();render();}
});
for(const event of ['pointercancel','lostpointercapture'])svg.addEventListener(event,()=>{
 if(gesture){cancelGesture();render();}
});
function removeSelected(){
 if(selected===null)return;
 saveHistory();
 location.objects=keepObjects(location.objects,location.objects[selected]);
 selected=null;
 invalidate();
 render();
}
function undo(){
 if(!history.length)return;
 cancelGesture();
 location=history.pop();
 selected=null;
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
$('undo').onclick=undo;
$('auto-spawns').onclick=()=>{
 const next={...location};
 delete next.spawns;
 delete next.patrol;
 setLocation(next);
 check();
};
for(const button of buttons)button.onclick=()=>setTool(button.dataset.tool);
for(const id of ['mirror-x','mirror-y'])$(id).onchange=()=>{cancelGesture();render();};
document.addEventListener('keydown',event=>{
 if(event.target.closest?.('input,select,textarea'))return;
 if(event.key==='Delete')removeSelected();
 if(event.key.toLowerCase()==='z'&&(event.ctrlKey||event.metaKey)){event.preventDefault();undo();}
 if(event.key==='Escape'){cancelGesture();selected=null;render();}
});
updateFields();
setTool('select');
setupCatalog();
