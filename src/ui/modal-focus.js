import {ctx} from '../game/state.js';

// Shared keyboard boundary for the game sheets; nested native dialogs keep
// their browser focus handling. Settings owns its pause/close lifecycle.
export function initializeModalFocus(){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 const sheets=['#arena-settings','#launch-overlay','#tower-preparation','#bet-overlay','#gladiator-results'].map(id=>root.querySelector(id));
 const settings=root.querySelector('#arena-settings-button');
 let current=null,previous=null,background=[];
 const controls=sheet=>[...sheet.querySelectorAll('button,input,select,summary,[tabindex="0"]'),settings].filter(node=>!node.disabled&&!node.closest('[hidden]')&&!(node.closest('details')?.open===false&&node.tagName!=='SUMMARY'));
 const ownsFocus=sheet=>sheet.contains(doc.activeElement)||doc.activeElement===settings;
 function sync(){
  if(ctx.tutorial?.active)return;
  const next=sheets.find(sheet=>!sheet.hidden)??null;
  if(next===current)return;
  for(const [node,inert] of background)node.inert=inert;background=[];
  const old=current;current=next;
  if(!old)previous=doc.activeElement;
  if(current?.id==='arena-settings')return;
  if(current){
   background=[...root.querySelector('.atmosphere-controls').children,root.querySelector('.tag7hop-sidebar-wrap'),ctx.svg,ctx.betHud].filter(node=>node&&node!==settings&&!node.contains(current)).map(node=>[node,Boolean(node.inert)]);
   for(const [node] of background)node.inert=true;
   if(!ownsFocus(current))controls(current)[0]?.focus();
  }else if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus();
 }
 const key=event=>{
  if(ctx.tutorial?.active)return;
  sync();if(!current||current.id==='arena-settings'||doc.querySelector('.betting-input-dialog[open]'))return;
  if(event.key==='Tab'){
   const nodes=controls(current),index=nodes.indexOf(doc.activeElement);
   event.preventDefault();
   nodes[index<0?(event.shiftKey?nodes.length-1:0):(index+(event.shiftKey?-1:1)+nodes.length)%nodes.length]?.focus();
  }
  if(event.key==='Escape'){
   if(current===ctx.betOverlay&&current.dataset.view==='garage'){event.preventDefault();current.querySelector('#garage-next')?.click();}
  }
 };
 // Backdrops let pointer events reach Settings, but no other background action.
 const pointer=event=>{
  if(ctx.tutorial?.active||doc.querySelector('.betting-input-dialog[open]'))return;
  sync();
  if(!current||current.id==='arena-settings'||current.contains(event.target)||settings.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
 };
 const pointerEvents=['click','pointerdown','pointerup'];
 for(const type of pointerEvents)root.addEventListener(type,pointer,true);
 const observer=new win.MutationObserver(sync);observer.observe(root,{subtree:true,attributes:true,attributeFilter:['hidden']});
 doc.addEventListener('keydown',key);sync();
 const dispose=root.__disposeTag;root.__disposeTag=()=>{observer.disconnect();doc.removeEventListener('keydown',key);for(const type of pointerEvents)root.removeEventListener(type,pointer,true);for(const [node,inert] of background)node.inert=inert;dispose();};
}

