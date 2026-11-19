import {ASSETS,assetUrl} from '../assets/manifest.js';

export const LOADING_TIPS=Object.freeze([
 'Не стой на месте. Пациенты любят неподвижные цели.',
 'Ноги ещё на месте? Значит, можно маневрировать.',
 'После босса забери модуль. Установка оплачивается отдельно.',
 'Оторванная конечность не повод терять голову.',
 'Следи за противниками: они дерутся не только с тобой.',
 'ДМС сохраняет контрольную точку. Бесплатной она не бывает.',
 'В Убежище можно снять модуль и вернуть его на склад.',
 'У каждого протеза есть цена. У каждого пациента — предел.',
 'Когда врагов много, пусть сначала разбираются друг с другом.',
 'Не путай редкость модуля с количеством конечностей.'
]);
export const LOADING_TIP_MS=1500;

export function createLoadingScreen({document:doc=globalThis.document,random=Math.random}={}){
 const node=doc.getElementById('texture-loading')??doc.createElement('div');
 if(!node.isConnected)doc.body.prepend(node);
 node.id='texture-loading';node.replaceChildren();node.setAttribute('role','status');
 node.setAttribute('aria-live','polite');node.setAttribute('aria-busy','true');
 const title=doc.createElement('h1');title.className='loading-title';title.textContent='БИОВШИ';
 const sub=doc.createElement('div');sub.className='loading-subtitle';sub.textContent='ПАЦИЕНТЫ ГОТОВЯТСЯ К ПРОЦЕДУРЕ';
 const status=doc.createElement('p');status.className='loading-status';status.textContent='Запуск клиники…';
 const meter=doc.createElement('div');meter.className='loading-track';meter.setAttribute('aria-hidden','true');
 const fill=doc.createElement('div');fill.className='loading-fill';meter.append(fill);
 const percent=doc.createElement('p');percent.className='loading-percent';percent.textContent='0%';
 const host=doc.createElement('div');host.className='loading-streamer';
 const canvas=doc.createElement('canvas');canvas.width=280;canvas.height=288;
 const tip=doc.createElement('p');tip.className='loading-tip';host.append(canvas,tip);
 const center=doc.createElement('div');center.className='loading-center';center.append(title,sub,status,meter,percent);
 node.append(center,host);
 let closed=false,started=0,raf=0,timer=null,lastTip=-1,atlas=null;
 const tips=[...LOADING_TIPS];
 const chooseTip=()=>{
  if(closed)return;
  const choices=tips.length>1?tips.filter((_,i)=>i!==lastTip):tips;
  const selected=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]??tips[0];
  lastTip=tips.indexOf(selected);tip.textContent=selected;
 };
 chooseTip();
 const win=doc.defaultView;
 timer=win.setInterval(chooseTip,LOADING_TIP_MS);
 const image=new win.Image();image.onload=()=>{if(!closed)atlas=image;};
 image.onerror=()=>{host.classList.add('without-art');};
 image.src=assetUrl(ASSETS.textures.streamer);
 const paint=canvas.getContext('2d');
 if(paint)paint.imageSmoothingEnabled=false;
 const draw=now=>{
  if(closed)return;
  if(!started)started=now;
  if(paint&&atlas){
   const t=(now-started)/1000;
   paint.clearRect(0,0,280,288);paint.save();paint.translate(0,11);
   const part=(rect,x,y)=>paint.drawImage(atlas,...rect,x,y,rect[2],rect[3]);
   part([10,377,245,135],12,142);
   const arm=(rect,px,py,x,y,angle)=>{
    paint.save();paint.translate(px,py);paint.rotate(angle);
    part(rect,x-px,y-py);paint.restore();
   };
   const sway=Math.sin(t*5)*.28;
   arm([0,319,104,58],99,185,4,160,-.15+sway);
   arm([150,319,105,58],165,185,157,160,.15-sway);
   paint.save();paint.translate(135,175+Math.sin(t*4)*2);
   part([592,9,156,248],-83,-149);
   paint.restore();paint.restore();
  }
  raf=win.requestAnimationFrame(draw);
 };
 if(paint&&typeof win.requestAnimationFrame==='function')raf=win.requestAnimationFrame(draw);
 return {
  element:node,
  update(message,{done=null,total=null}={}){
   if(closed)return;
   status.textContent=message;
   if(Number.isFinite(done)&&Number.isFinite(total)&&total>0){
    const value=Math.max(0,Math.min(100,Math.round(100*done/total)));
    fill.style.width=value+'%';percent.textContent=value+'%';
   }
  },
  fail(message){
   if(closed)return;
   status.textContent=message;node.setAttribute('aria-busy','false');
   if(timer!==null){win.clearInterval(timer);timer=null;}
  },
  close(){
   if(closed)return;
   closed=true;if(timer!==null)win.clearInterval(timer);
   if(raf)win.cancelAnimationFrame?.(raf);
   image.onload=image.onerror=null;node.remove();
  }
 };
}
