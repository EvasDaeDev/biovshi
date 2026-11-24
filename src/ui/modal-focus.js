import {ctx} from '../game/state.js';

// Shared keyboard boundary for the game sheets; nested native dialogs keep
// their browser focus handling. Settings owns its pause/close lifecycle.
export function initializeModalFocus(){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 const sheets=['#arena-settings','#launch-overlay','#tower-preparation','#bet-overlay','#gladiator-results'].map(id=>root.querySelector(id));
 const settings=root.querySelector('#game-nav-settings');
 const navigation=root.querySelector('#game-navigation');
 let current=null,previous=null,background=[];
 const controls=sheet=>[...sheet.querySelectorAll('button,input,select,summary,[tabindex="0"]'),...navigation.querySelectorAll('button')].filter(node=>!node.disabled&&!node.hidden&&!node.closest('[hidden]')&&!node.closest('[aria-hidden="true"]')&&!(node.closest('details')?.open===false&&node.tagName!=='SUMMARY'));
 const ownsFocus=sheet=>sheet.contains(doc.activeElement)||navigation.contains(doc.activeElement);
 // Tower modernization is a sibling of #tower-preparation, not a child.
 // It lives in the native dialog top layer, but events still capture through
 // the game root. Treat its content as part of the active Tower sheet.
 const activeTowerUpgrade=()=>root.querySelector('#tower-upgrade-window[open]:not([hidden])');
 const activeReplacement=()=>root.querySelector('#tower-module-replacement[open]');
 const activeTopDialog=()=>root.querySelector('#game-action-confirm[open]')??root.querySelector('.paper-dialog[open], #tower-cycle-notice[open]');
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
   if(!ownsFocus(current)&&!activeTowerUpgrade()&&!activeTopDialog())controls(current)[0]?.focus();
  }else if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus();
 }
 const key=event=>{
  if(ctx.tutorial?.active)return;
  sync();
  // Let the top-layer dialog own Tab and Escape. Trapping focus inside the
  // preparation sheet would make the modernization controls unreachable.
  if(activeTopDialog()||activeReplacement()||activeTowerUpgrade())return;
  if(!current||current.id==='arena-settings'||doc.querySelector('.betting-input-dialog[open]'))return;
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
  if(ctx.orientationBlocked||ctx.tutorial?.active||doc.querySelector('.betting-input-dialog[open]'))return;
  sync();
  const modal=activeTopDialog();
  if(modal){
   if(modal.contains(event.target))return;
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  const replacement=activeReplacement();
  if(replacement){
   if(replacement.contains(event.target))return;
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  const upgrade=activeTowerUpgrade();
  if(upgrade){
   if(upgrade.contains(event.target))return;
   // No controls behind an open modernization dialog may be activated.
   event.preventDefault();event.stopImmediatePropagation();return;
  }
  if(!current||current.id==='arena-settings'||current.contains(event.target)||navigation.contains(event.target))return;
  event.preventDefault();event.stopImmediatePropagation();
 };
 const pointerEvents=['click','pointerdown','pointerup'];
 for(const type of pointerEvents)root.addEventListener(type,pointer,true);
 const observer=new win.MutationObserver(sync);observer.observe(root,{subtree:true,attributes:true,attributeFilter:['hidden']});
 doc.addEventListener('keydown',key);sync();
 const dispose=root.__disposeTag;root.__disposeTag=()=>{observer.disconnect();doc.removeEventListener('keydown',key);for(const type of pointerEvents)root.removeEventListener(type,pointer,true);for(const [node,inert] of background)node.inert=inert;dispose();};
}

