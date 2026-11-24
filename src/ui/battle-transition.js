// The image appears before any arena work and fades according to completed work.
export function createBattleTransition(doc){
 const win=doc.defaultView;
 const cover=doc.createElement('div');
 cover.id='battle-transition';
 cover.setAttribute('aria-hidden','true');
 const image=doc.querySelector('#menu-background img').cloneNode(false);
 const shade=doc.createElement('div');
 shade.className='battle-transition-shade';
 cover.append(image,shade);
 doc.body.append(cover);

 const duration=win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches?0:120;
 shade.style.transitionDuration=duration+'ms';
 let darkness=0;
 const setDarkness=value=>{
  darkness=Math.max(darkness,value);
  shade.style.opacity=String(darkness);
 };
 return {
  show(){
   if(doc.hidden||!win.requestAnimationFrame)return Promise.resolve();
   return new Promise(resolve=>{
    let frame;
    const finish=()=>{win.clearTimeout(timer);win.cancelAnimationFrame(frame);resolve();};
    const timer=win.setTimeout(finish,80);
    frame=win.requestAnimationFrame(()=>{frame=win.requestAnimationFrame(finish);});
   });
  },
  update(_message,{done,total}){
   if(Number.isFinite(done)&&total>0)setDarkness(Math.min(1,done/total)*.92);
  },
  finish(){
   if(!duration||doc.hidden){setDarkness(1);return Promise.resolve();}
   return new Promise(resolve=>{
    const finish=()=>{
     win.clearTimeout(timer);
     shade.removeEventListener('transitionend',onEnd);
     resolve();
    };
    const onEnd=event=>{if(event.propertyName==='opacity')finish();};
    const timer=win.setTimeout(finish,duration+50);
    shade.addEventListener('transitionend',onEnd);
    setDarkness(1);
   });
  },
  close(){cover.remove();}
 };
}
