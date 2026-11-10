import {ctx} from '../game/state.js';

// Shared keyboard boundary for the game sheets; nested native dialogs keep
// their browser focus handling. Settings owns its pause/close lifecycle.
export function initializeModalFocus(){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 const sheets=['#launch-overlay','#arena-settings','#bet-overlay','#gladiator-results'].map(id=>root.querySelector(id));
 let current=null,previous=null,background=[];
 const controls=sheet=>[...sheet.querySelectorAll('button,input,select,summary,[tabindex="0"]')].filter(node=>!node.disabled&&!node.closest('[hidden]')&&!(node.closest('details')?.open===false&&node.tagName!=='SUMMARY'));
 function sync(){
  const next=sheets.find(sheet=>!sheet.hidden)??null;
  if(next===current)return;
  for(const [node,inert] of background)node.inert=inert;background=[];
  const old=current;current=next;
  if(!old)previous=doc.activeElement;
  if(current?.id==='arena-settings')return;
  if(current){
   background=[root.querySelector('.atmosphere-controls'),root.querySelector('.tag7hop-sidebar-wrap'),ctx.svg,ctx.betHud].filter(node=>node&&!node.contains(current)).map(node=>[node,Boolean(node.inert)]);
   for(const [node] of background)node.inert=true;
   if(!current.contains(doc.activeElement))controls(current)[0]?.focus();
  }else if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus();
 }
 const key=event=>{
  sync();if(!current||current.id==='arena-settings'||doc.querySelector('.betting-input-dialog[open]'))return;
  if(event.key==='Tab'){
   const nodes=controls(current),first=nodes[0],last=nodes.at(-1);
   if(event.shiftKey&&(!current.contains(doc.activeElement)||doc.activeElement===first)){event.preventDefault();last?.focus();}
   else if(!event.shiftKey&&(!current.contains(doc.activeElement)||doc.activeElement===last)){event.preventDefault();first?.focus();}
  }
  if(event.key==='Escape'){
   if(current===ctx.betOverlay&&current.dataset.view==='garage'){event.preventDefault();current.querySelector('#garage-next')?.click();}
  }
 };
 const observer=new win.MutationObserver(sync);observer.observe(root,{subtree:true,attributes:true,attributeFilter:['hidden']});
 doc.addEventListener('keydown',key);sync();
 const dispose=root.__disposeTag;root.__disposeTag=()=>{observer.disconnect();doc.removeEventListener('keydown',key);for(const [node,inert] of background)node.inert=inert;dispose();};
}
