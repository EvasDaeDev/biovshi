import {ctx} from '../game/state.js';
// Native title tooltips do not expose font sizing, so use a small shared hint.
export function initializeHints(){
  const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
  const tooltip=doc.createElement('div');tooltip.className='biovshi-hint';tooltip.id='biovshi-hint';tooltip.setAttribute('role','tooltip');tooltip.hidden=true;doc.body.append(tooltip);
  const moved=new Map();let current=null,description=null;
  function hide(){
    tooltip.hidden=true;
    if(current){if(description===null)current.removeAttribute('aria-describedby');else current.setAttribute('aria-describedby',description);}
    current=null;description=null;
  }
  function show(event){
    const target=event.target.closest?.('[title],[data-hint]');if(!target||!root.contains(target))return;
    const message=target.getAttribute('title')??target.dataset.hint;if(!message)return;
    if(current===target&&tooltip.textContent===message)return;
    hide();
    if(target.hasAttribute('title')){moved.set(target,message);target.dataset.hint=message;target.removeAttribute('title');}
    current=target;description=target.getAttribute('aria-describedby');target.setAttribute('aria-describedby',[description,tooltip.id].filter(Boolean).join(' '));
    tooltip.textContent=message;tooltip.hidden=false;
    const box=target.getBoundingClientRect(),bounds=tooltip.getBoundingClientRect();
    tooltip.style.left=Math.max(4,Math.min(box.left,win.innerWidth-bounds.width-4))+'px';
    tooltip.style.top=Math.max(4,box.bottom+bounds.height+8<win.innerHeight?box.bottom+6:box.top-bounds.height-6)+'px';
  }
  const leave=event=>{if(current&&!current.contains(event.relatedTarget))hide();};
  const key=event=>{if(event.key==='Escape')hide();};
  root.addEventListener('pointerover',show);root.addEventListener('focusin',show);root.addEventListener('pointerout',leave);root.addEventListener('focusout',hide);doc.addEventListener('keydown',key);win.addEventListener('scroll',hide,true);
  const dispose=root.__disposeTag;
  root.__disposeTag=()=>{
    hide();tooltip.remove();root.removeEventListener('pointerover',show);root.removeEventListener('focusin',show);root.removeEventListener('pointerout',leave);root.removeEventListener('focusout',hide);doc.removeEventListener('keydown',key);win.removeEventListener('scroll',hide,true);
    for(const [node,title] of moved){if(!node.hasAttribute('title'))node.setAttribute('title',title);delete node.dataset.hint;}
    dispose();
  };
}
