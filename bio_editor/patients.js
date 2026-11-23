import {skinMatrix} from '../src/render/robot-skin.js';
import {byId as $,downloadJson,htmlOption,importJson,numeric,status,svgNode} from './io.js';
import {newPatient,patientBones,readPatient,STOCK_ATLASES,syncBody} from './patient-model.js';

let project=newPatient(),limbIndex=0,boneKey='head',atlasLoad=0,customAtlas=null;
const preview=$('editor-preview');
const anatomyFields=[['spine','spineSegments'],['scale','scaleMultiplier'],['head-offset','headOffset'],['head-size','headSizeFactor']];
const limbFields=['limb-kind','side','anchor','length','mass','delete-limb'];
const titleFor=key=>{
 if(key==='head')return 'Голова';
 if(key.startsWith('spine-'))return 'Корпус '+(Number(key.slice(6))+1);
 const index=project.body.limbs.findIndex(limb=>key.startsWith(limb.key+'-')&&
  ['upper','lower'].includes(key.slice(limb.key.length+1)));
 return 'Конечность '+(index+1)+' · '+(key.endsWith('-upper')?'верх':'низ');
};
const atlasUrl=()=>project.atlas.data??'../'+STOCK_ATLASES[project.atlas.key].path;
function fit(boxes){
 const minX=Math.min(...boxes.map(p=>p.x))-10,minY=Math.min(...boxes.map(p=>p.y))-10;
 const maxX=Math.max(...boxes.map(p=>p.x))+10,maxY=Math.max(...boxes.map(p=>p.y))+10;
 return [minX,minY,maxX-minX,maxY-minY].join(' ');
}
function draw(stage,bones,textures,showBones){
 stage.replaceChildren();
 const bounds=bones.flatMap(({a,b})=>[a,b]);
 if(textures){
  for(const {key,a,b} of bones){
   const part=project.body.skinParts[key],matrix=skinMatrix(a,b,part);
   const [A,B,C,D,E,F]=matrix;
   for(const [x,y] of [[0,0],[64,0],[0,64],[64,64]])bounds.push({x:A*x+C*y+E,y:B*x+D*y+F});
   const group=svgNode('g',{transform:'matrix('+matrix.join(' ')+')','data-texture-bone':key},stage);
   const tile=svgNode('svg',{width:64,height:64,viewBox:part.col*64+' '+part.row*64+' 64 64',overflow:'hidden'},group);
   svgNode('image',{href:atlasUrl(),width:256,height:256},tile);
  }
 }
 stage.setAttribute('viewBox',fit(bounds));
 for(const {key,a,b} of bones){
  const selected=key===boneKey&&textures;
  if(showBones){
   svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'bone'+(selected?' selected':'')},stage);
   for(const point of [a,b])svgNode('circle',{cx:point.x,cy:point.y,r:1.4,class:selected?'selected-joint':'joint'},stage);
  }
  if(textures){
   const target=svgNode('line',{x1:a.x,y1:a.y,x2:b.x,y2:b.y,class:'bone-handle','data-bone':key},stage);
   target.onclick=()=>selectBone(key);
  }
 }
}
const cells=Array.from({length:16},(_,index)=>{
 const row=Math.floor(index/4),col=index%4,button=document.createElement('button');
 button.type='button';button.setAttribute('aria-label','Строка '+(row+1)+', столбец '+(col+1));
 button.style.setProperty('--atlas-position',(col*100/3)+'% '+(row*100/3)+'%');
 const number=document.createElement('span');number.textContent=index+1;button.append(number);
 button.onclick=()=>{
  Object.assign(project.body.skinParts[boneKey],{row,col});
  renderPreview();
 };
 $('atlas-grid').append(button);
 return button;
});
function renderPreview(){
 const bones=patientBones(project.body),part=project.body.skinParts[boneKey];
 $('bone').value=boneKey;
 $('part-from').value=part.from;$('part-to').value=part.to;$('part-width').value=part.widthScale;
 $('preview-status').textContent='';
 cells.forEach((button,index)=>button.setAttribute('aria-pressed',String(index===part.row*4+part.col)));
 $('atlas-grid').style.setProperty('--atlas-image','url("'+atlasUrl()+'")');
 draw($('atlas-stage'),bones,true,$('preview-bones').checked);
}
function selectBone(key){boneKey=key;renderPreview();}
function paint(){
 const bones=patientBones(project.body);
 draw($('patient-stage'),bones,false,$('bones').checked);
 $('bone-count').value=bones.length+' костей';
 $('atlas-name').value=project.atlas.name??STOCK_ATLASES[project.atlas.key].name;
 $('bone').replaceChildren(...bones.map(bone=>htmlOption(titleFor(bone.key),bone.key)));
 if(!project.body.skinParts[boneKey])boneKey='head';
 renderPreview();
}
function showLimbs(){
 const {limbs,spineSegments}=project.body,limb=limbs[limbIndex];
 $('limb').replaceChildren(...limbs.map((l,i)=>htmlOption(
  (i+1)+'. '+(l.kind==='arm'?'Рука':'Нога')+' · '+(l.side===-1?'левая':'правая'),i)));
 if(!limb)$('limb').append(htmlOption('Крепления не заданы',''));
 $('limb').disabled=!limb;$('limb').value=limb?limbIndex:'';
 $('anchor').replaceChildren(htmlOption('Стандартное',''),...Array.from({length:spineSegments+1},(_,i)=>
  htmlOption(i===0?'Грудь':i===spineSegments?'Таз':'Позвонок '+(i+1),i)));
 for(const id of limbFields)$(id).disabled=!limb;
 $('add-limb').disabled=limbs.length===12;
 $('limb-kind').value=limb?.kind??'arm';$('side').value=limb?.side??-1;
 $('anchor').value=limb?.anchor??'';$('length').value=limb?.lengthScale??1;$('mass').value=limb?.massScale??1;
}
function sync(){
 $('patient-id').value=project.id;$('patient-name').value=project.name;
 for(const [id,key] of anatomyFields)$(id).value=project.body[key];
 const options=Object.entries(STOCK_ATLASES).map(([key,atlas])=>htmlOption(atlas.name,key));
 if(customAtlas)options.push(htmlOption(customAtlas.name,'custom'));
 $('atlas-select').replaceChildren(...options);$('atlas-select').value=project.atlas.key;
 showLimbs();paint();
}
function freshKey(kind,side){
 const used=new Set(project.body.limbs.map(l=>l.key));
 for(let i=1;;i++){
  const key=kind+'-'+side+'-custom'+i;
  if(!used.has(key))return key;
 }
}
function recalculate(){syncBody(project.body);showLimbs();paint();status();}
for(const [id,key] of anatomyFields)$(id).onchange=()=>{
 const input=$(id),value=input.valueAsNumber;
 if(!numeric(value,Number(input.min),Number(input.max))||(id==='spine'&&!Number.isInteger(value))){
  input.value=project.body[key];status('Значение вне диапазона.',true);return;
 }
 project.body[key]=value;
 if(id==='spine')for(const limb of project.body.limbs)if(limb.anchor>value)limb.anchor=value;
 recalculate();
};
$('add-limb').onclick=()=>{
 const {limbs,spineSegments}=project.body;
 if(limbs.length>=12)return;
 const kind='arm',side=limbs.length%2?-1:1;
 limbs.push({kind,side,key:freshKey(kind,side),anchor:Math.min(2,spineSegments),lengthScale:1,massScale:1});
 limbIndex=limbs.length-1;recalculate();
};
$('delete-limb').onclick=()=>{
 project.body.limbs.splice(limbIndex,1);
 limbIndex=Math.max(0,limbIndex-1);recalculate();
};
$('limb').onchange=()=>{limbIndex=Number($('limb').value);showLimbs();};
function changeLimb(){
 const limb=project.body.limbs[limbIndex],lengthScale=$('length').valueAsNumber,massScale=$('mass').valueAsNumber;
 if(!numeric(lengthScale,.5,2.5)||!numeric(massScale,.5,2.5)){
  showLimbs();status('Допустимый масштаб конечности от 0,5 до 2,5.',true);return;
 }
 const kind=$('limb-kind').value,side=Number($('side').value);
 if(kind!==limb.kind||side!==limb.side){
  const oldKey=limb.key;
  limb.key=freshKey(kind,side);
  for(const half of ['upper','lower']){
   project.body.skinParts[limb.key+'-'+half]=project.body.skinParts[oldKey+'-'+half];
   if(boneKey===oldKey+'-'+half)boneKey=limb.key+'-'+half;
  }
 }
 Object.assign(limb,{kind,side,lengthScale,massScale});
 if($('anchor').value==='')delete limb.anchor;
 else limb.anchor=Number($('anchor').value);
 recalculate();
}
for(const id of limbFields.slice(0,-1))$(id).onchange=changeLimb;
$('bones').onchange=paint;
$('preview-bones').onchange=renderPreview;
$('bone').onchange=()=>selectBone($('bone').value);
$('preview-open').onclick=()=>{renderPreview();preview.showModal();};
for(const id of ['part-from','part-to','part-width'])$(id).onchange=()=>{
 const from=$('part-from').valueAsNumber,to=$('part-to').valueAsNumber,widthScale=$('part-width').valueAsNumber;
 if(!numeric(from,0,64)||!numeric(to,0,64)||Math.abs(from-to)<4||!numeric(widthScale,.25,3)){
  renderPreview();$('preview-status').textContent='Между якорями должно быть хотя бы 4 px. Допустимая ширина от 0,25 до 3.';return;
 }
 Object.assign(project.body.skinParts[boneKey],{from,to,widthScale});renderPreview();
};
$('atlas-select').onchange=()=>{
 atlasLoad++;
 const key=$('atlas-select').value;
 project.atlas=key==='custom'?customAtlas:{key};sync();
};
async function normalizeAtlas(source){
 const image=new Image();
 image.src=source;await image.decode();
 if(image.naturalWidth!==image.naturalHeight||image.naturalWidth<64)
  throw Error('Атлас должен быть квадратным и содержать 4 × 4 ячейки.');
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
 const draw=canvas.getContext('2d');
 draw.imageSmoothingEnabled=false;draw.drawImage(image,0,0,256,256);
 return canvas.toDataURL('image/png');
}
$('atlas-file').onchange=async()=>{
 const file=$('atlas-file').files[0];
 $('atlas-file').value='';
 if(!file)return;
 if(file.size>16*1024*1024){status('Размер атласа превышает 16 МБ.',true);return;}
 const token=++atlasLoad,url=URL.createObjectURL(file);
 try{
  const data=await normalizeAtlas(url);
  if(token!==atlasLoad)return;
  project.atlas=customAtlas={key:'custom',name:file.name.slice(0,120),data};
  sync();status('Атлас подключён и приведён к 256 × 256 px.');
 }catch(error){if(token===atlasLoad)status(error.message,true);}
 finally{URL.revokeObjectURL(url);}
};
$('export-atlas').onclick=()=>{
 const anchor=document.createElement('a');
 anchor.href=atlasUrl();
 anchor.download=($('patient-id').validity.patternMismatch||!$('patient-id').value?project.id:$('patient-id').value)+'.png';
 anchor.click();
};
$('new-patient').onclick=()=>{atlasLoad++;project=newPatient();customAtlas=null;limbIndex=0;boneKey='head';sync();status();};
$('import').onclick=()=>$('project-file').click();
importJson($('project-file'),async value=>{
 const incoming=readPatient(value),token=++atlasLoad;
 if(incoming.atlas.key==='custom')incoming.atlas.data=await normalizeAtlas(incoming.atlas.data);
 if(token!==atlasLoad)return;
 project=incoming;customAtlas=incoming.atlas.key==='custom'?incoming.atlas:null;limbIndex=0;boneKey='head';sync();
});
$('export').onclick=()=>{
 try{
  project=readPatient({...project,id:$('patient-id').value.trim(),name:$('patient-name').value});
  downloadJson(project.id+'.json',project);status('Пациент выгружен.');
 }catch(error){status(error.message,true);}
};
sync();
