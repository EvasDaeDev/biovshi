import {CONFIG} from '../src/config.js';
import {ASSETS} from '../src/assets/manifest.js';
import {bodySegments,PATIENT_HEAD_OFFSET,standardLimbs} from '../src/robot/body.js';
import {neutralCapsules} from '../src/robot/neutral-pose.js';
import {ROBOT_PARTS} from '../src/render/robot-skin.js';
import {bossSkinParts} from '../src/boss/skin.js';
import {numeric} from './io.js';

export const STOCK_ATLASES=Object.fromEntries(['robotA','robotB','robotC','robotD','robotAndroid']
 .map((key,index)=>[key,{path:ASSETS.textures[key],name:['Пациент A','Пациент B','Пациент C','Пациент D','Андроид'][index]}]));
const validId=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9_-]{0,39}$/.test(value);
const validAtlasData=value=>typeof value==='string'&&value.length<=1000000&&/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
const whole=(value,min,max)=>Number.isInteger(value)&&numeric(value,min,max);
export function syncBody(body){
 body.pelvisKey='spine-'+(body.spineSegments-1);
 const defaults=bossSkinParts(body);
 body.skinParts=Object.fromEntries(Object.keys(defaults).map(key=>{
  const part=body.skinParts?.[key]??defaults[key];
  return [key,{col:part.col,row:part.row,from:part.from??8,to:part.to??56,widthScale:part.widthScale??1}];
 }));
 body.segments=bodySegments(body.spineSegments,body.limbs);
 return body;
}
export function newPatient(){
 return {version:1,id:'patient-new',name:'Новый пациент',atlas:{key:'robotA'},
  body:syncBody({spineSegments:4,scaleMultiplier:1,headOffset:PATIENT_HEAD_OFFSET,headSizeFactor:1,
   limbs:standardLimbs().map(limb=>({...limb,lengthScale:1,massScale:1})),skinParts:structuredClone(ROBOT_PARTS)})};
}
export function readPatient(value){
 if(value?.version!==1||!validId(value.id)||typeof value.name!=='string'||!value.name.trim()||value.name.length>80)
  throw Error('Проверьте имя, ID и версию проекта пациента.');
 const atlas=value.atlas;
 if(!(atlas&&Object.hasOwn(STOCK_ATLASES,atlas.key))&&
   !(atlas?.key==='custom'&&validAtlasData(atlas.data)&&typeof atlas.name==='string'&&atlas.name.length<=120))
  throw Error('Проект содержит неподдерживаемый атлас.');
 const body=value.body;
 if(!whole(body?.spineSegments,2,12)||!numeric(body.scaleMultiplier,.5,2.5)||
   !numeric(body.headOffset,8,100)||!numeric(body.headSizeFactor,.5,3)||
   !Array.isArray(body.limbs)||body.limbs.length>12)
  throw Error('Проверьте параметры корпуса пациента.');
 const keys=new Set();
 const limbs=body.limbs.map(limb=>{
  if(!limb||!validId(limb.key)||!['arm','leg'].includes(limb.kind)||!limb.key.startsWith(limb.kind+'-')||
    keys.has(limb.key)||![-1,1].includes(limb.side)||
    (limb.anchor!==undefined&&!whole(limb.anchor,0,body.spineSegments))||
    !numeric(limb.lengthScale,.5,2.5)||!numeric(limb.massScale,.5,2.5))
   throw Error('Проверьте тип, крепление и размеры конечностей.');
  keys.add(limb.key);
  const {key,kind,side,anchor,lengthScale,massScale}=limb;
  return {key,kind,side,...(anchor===undefined?{}:{anchor}),lengthScale,massScale};
 });
 const anatomy=syncBody({spineSegments:body.spineSegments,scaleMultiplier:body.scaleMultiplier,
  headOffset:body.headOffset,headSizeFactor:body.headSizeFactor,limbs});
 for(const key of Object.keys(anatomy.skinParts)){
  const part=body.skinParts?.[key];
  if(!whole(part?.col,0,3)||!whole(part.row,0,3)||!numeric(part.from,0,64)||!numeric(part.to,0,64)||
    Math.abs(part.from-part.to)<4||!numeric(part.widthScale,.25,3))
   throw Error('Проверьте ячейку и якоря атласа для '+key+'.');
  const {col,row,from,to,widthScale}=part;
  anatomy.skinParts[key]={col,row,from,to,widthScale};
 }
 return {version:1,id:value.id,name:value.name.trim(),atlas:atlas.key==='custom'?
  {key:atlas.key,name:atlas.name,data:atlas.data}:{key:atlas.key},body:anatomy};
}
export function patientBones(body){
 const bones=neutralCapsules({x:0,y:0,angle:0},body,body.scaleMultiplier)
  .filter(({a,b})=>a.x!==b.x||a.y!==b.y).map(({segment,a,b})=>[segment,{key:segment,a,b}]);
 const lookup=new Map(bones),scale=CONFIG.robot.scale*body.scaleMultiplier;
 const left=(body.headOffset-10*body.headSizeFactor)*scale,right=(body.headOffset+10*body.headSizeFactor)*scale;
 lookup.set('head',{key:'head',a:{x:left,y:0},b:{x:right,y:0}});
 return Object.keys(body.skinParts).map(key=>lookup.get(key)).filter(Boolean);
}
