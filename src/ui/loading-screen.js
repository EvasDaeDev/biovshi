import {ASSETS,assetUrl} from '../assets/manifest.js';

export function createLoadingScreen({document:doc=globalThis.document,staged=false}={}){
 const node=doc.getElementById('texture-loading')??doc.createElement('div');
 if(!node.isConnected)doc.body.prepend(node);
 node.id='texture-loading';node.replaceChildren();node.setAttribute('role','status');
 node.setAttribute('aria-live','polite');node.setAttribute('aria-busy','true');
 const sub=doc.createElement('div');sub.className='loading-subtitle';sub.textContent='ПАЦИЕНТЫ ГОТОВЯТСЯ К ПРОЦЕДУРЕ';
 const status=doc.createElement('p');status.className='loading-status';status.textContent='Запуск клиники…';
 const meter=doc.createElement('div');meter.className='loading-track';meter.setAttribute('aria-hidden','true');
 const fill=doc.createElement('div');fill.className='loading-fill';meter.append(fill);
 const percent=doc.createElement('p');percent.className='loading-percent';percent.textContent='0%';
 const host=doc.createElement('div');host.className='loading-streamer';
 const canvas=doc.createElement('canvas');canvas.width=280;canvas.height=288;
 const line=doc.createElement('p');line.className='loading-tip';
 line.textContent='Музыка и звук влияют на восприятие игры. Не выключайте их!';
 host.append(canvas,line);
 const dismissButton=doc.createElement('button');dismissButton.type='button';dismissButton.className='loading-dismiss';dismissButton.textContent='ЗАКРЫТЬ';dismissButton.hidden=true;
 const center=doc.createElement('div');center.className='loading-center';center.append(sub,status,meter,percent,dismissButton);
 node.append(center,host);
 let closed=false,failed=false,started=0,raf=0,atlas=null,highestProgress=0;
 const win=doc.defaultView;
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
 dismissButton.onclick=()=>api.close();
 const api={
  element:node,
  update(message,{done=null,total=null,phase='game'}={}){
   if(closed||failed)return;
   status.textContent=message;
   if(Number.isFinite(done)&&Number.isFinite(total)&&total>0){
    const fraction=Math.max(0,Math.min(1,done/total));
    // Initial launch uses one continuous bar across textures and arena setup.
    // Every subsequent arena transition uses the complete 0-100% game phase.
    const progress=staged?(phase==='textures'?.45*fraction:.45+.55*fraction):fraction;
    highestProgress=Math.max(highestProgress,Math.round(100*progress));
    fill.style.width=highestProgress+'%';percent.textContent=highestProgress+'%';
   }
  },
  fail(message){
   if(closed)return;
   failed=true;status.textContent=message;node.setAttribute('aria-busy','false');
   node.setAttribute('role','alert');
   if(raf)win.cancelAnimationFrame?.(raf);
   dismissButton.hidden=false;
   dismissButton.focus();
  },
  close(){
   if(closed)return;
   closed=true;
   if(raf)win.cancelAnimationFrame?.(raf);
   image.onload=image.onerror=null;dismissButton.onclick=null;node.remove();
  }
 };
 return api;
}
