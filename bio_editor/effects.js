import preset from '../src/render/hit-preset.json' with {type:'json'};
import {hitParticle,hitParticleFrame,hitFlashFrame,HIT_FLASH_PATH} from '../src/render/hit-effects.js';
import {byId as $,downloadJson,importJson,numeric,status,svgNode} from './io.js';

const fields=[
 ['hitParticles','Частиц при попадании',0,64,1],
 ['severParticles','Частиц при отрыве',0,64,1],
 ['hitLifeSec','Жизнь частиц, с',.05,1.5,.01],
 ['hitFlashSec','Время вспышки, с',0,.8,.01],
 ['hitSpread','Угол разлёта, рад',0,6.28,.01],
 ['hitSpeed','Скорость разлёта, ×',0,3,.05],
 ['hitGravity','Падение, см/с²',0,500,1],
 ['hitLift','Подъём, см/с',-120,120,1],
 ['hitParticleSize','Размер частиц, ×',.25,6,.05],
 ['hitFlashSize','Размер вспышки, ×',.25,5,.05],
];
const colors=[
 ['hitFlashColor','Вспышка'],['hitFlashCore','Центр вспышки'],['hitSparkColor','Искра'],
 ...preset.hitSprayColors.map((_,index)=>['hitSprayColors','Брызги '+(index+1),index]),
];
const inputs=new Map();
function field(parent,label,type,attributes){
 const node=document.createElement('label');
 node.textContent=label;
 const input=document.createElement('input');
 Object.assign(input,{type,...attributes});node.append(input);parent.append(node);
 return input;
}
for(const [key,label,min,max,step] of fields)
 inputs.set(key,field($('effect-fields'),label,'number',{id:key,min,max,step,required:true}));
const colorFields=colors.map(([,label])=>field($('effect-colors'),label,'color',{}));
function read(value){
 const next={};
 for(const [key,label,min,max,step] of fields){
  if(!numeric(value?.[key],min,max)||(step===1&&!Number.isInteger(value[key])))throw Error('Проверьте поле «'+label+'».');
  next[key]=value[key];
 }
 const colour=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 if(!colors.every(([key,,index])=>colour(index===undefined?value[key]:value[key]?.[index])))throw Error('Некорректные цвета пресета.');
 for(const [key,,index] of colors)next[key]=index===undefined?value[key]:value[key].slice(0,3);
 if(next.hitFlashSec>next.hitLifeSec)throw Error('Вспышка не может длиться дольше частиц.');
 return next;
}
function sync(value){
 for(const [key,input] of inputs)input.value=value[key];
 colors.forEach(([key,,index],i)=>colorFields[i].value=index===undefined?value[key]:value[key][index]);
}
function fromFields(){
 const next=Object.fromEntries([...inputs].map(([key,input])=>[key,input.valueAsNumber]));
 next.hitSprayColors=[];
 colors.forEach(([key,,index],i)=>{
  if(index===undefined)next[key]=colorFields[i].value;
  else next.hitSprayColors[index]=colorFields[i].value;
 });
 return read(next);
}
const layer=$('particles');
let frameId=0,current=null,severed=false,serial=0;
function play(detach){
 try{
  current=fromFields();status();
 }catch(error){status(error.message,true);return;}
 cancelAnimationFrame(frameId);
 severed=detach;
 for(const [id,on] of [['hit',!severed],['sever',severed]])$(id).setAttribute('aria-pressed',on);
 const direction=$('direction').valueAsNumber*Math.PI/180||0,seed=2177+serial++*173;
 const count=severed?current.severParticles:current.hitParticles;
 const particles=Array.from({length:count},(_,i)=>hitParticle(seed,i,direction,severed,current));
 layer.replaceChildren();
 const nodes=particles.map(p=>svgNode('rect',{fill:p.colour},layer));
 const flash=svgNode('g',{},layer);
 svgNode('path',{d:HIT_FLASH_PATH,fill:current.hitFlashColor},flash);
 svgNode('rect',{x:-2,y:-2,width:4,height:4,fill:current.hitFlashCore},flash);
 const life=current.hitLifeSec*(severed?1.35:1);
 const start=performance.now();
 const render=time=>{
  const elapsed=Math.max(0,(time-start)/1000);
  const age=$('repeat').checked?elapsed%(life+.6):elapsed;
  $('effect-time').value=Math.min(age,life).toLocaleString('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2})+' с';
  nodes.forEach((node,i)=>{
   const pose=hitParticleFrame(particles[i],age,current);
   node.setAttribute('display',pose?'':'none');
   if(pose)for(const [key,value] of Object.entries(pose))node.setAttribute(key,value);
  });
  const flare=hitFlashFrame(age,severed,current);
  flash.setAttribute('display',flare?'':'none');
  if(flare){
   flash.setAttribute('opacity',flare.opacity);
   flash.setAttribute('transform','scale('+flare.size+')');
  }
  if(age<life||$('repeat').checked)frameId=requestAnimationFrame(render);
 };
 render(start);
}
$('hit').onclick=()=>play(false);
$('sever').onclick=()=>play(true);
$('repeat').onchange=()=>play(severed);
$('direction').onchange=()=>play(severed);
for(const input of [...inputs.values(),...colorFields])input.onchange=()=>play(severed);
$('reset').onclick=()=>{sync(preset);play(false);};
$('import').onclick=()=>$('preset-file').click();
importJson($('preset-file'),value=>{sync(read(value));play(severed);});
$('export').onclick=()=>{
 try{downloadJson('hit-preset.json',fromFields());status('Пресет выгружен.');}
 catch(error){status(error.message,true);}
};
sync(preset);play(false);
