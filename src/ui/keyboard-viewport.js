import {ctx} from '../game/state.js';
import {contentViewport,visibleViewport,screenRect,effectiveZoom,scrollPanelToTarget} from './geometry.js';

// Keep game geometry separate from the smaller area available to an editor.
// A native keyboard changes visualViewport, and some WebViews change innerHeight
// too. Focus alone is insufficient: hardware keyboards must not lock resizing.
export function initializeKeyboardViewport(onLayoutChange){
 const root=ctx.root,doc=root.ownerDocument,win=doc.defaultView;
 const measure=()=>{
  const raw=visibleViewport(win),view=ctx.platform?.rawViewport(raw)??raw,scale=win.visualViewport?.scale||1;
  return {width:view.width*scale,height:view.height*scale,
   orientation:win.screen?.orientation?.type??win.orientation??null};
 };
 const lostHeight=(a,b)=>a.height-b.height>=Math.max(80,a.height*.18);
 const sameWidth=(a,b)=>Math.abs(a.width-b.width)<Math.max(8,a.width*.02);
 const current=measure(),saved=root.__keyboardViewportState;
 let active=Boolean(saved?.active&&sameWidth(saved.stable,current)&&lostHeight(saved.stable,current)&&saved.stable.orientation===current.orientation);
 let stable=active?saved.stable:current,disposed=false,updating=false,panelState=null;
 const editable=()=>{
  const node=doc.activeElement;
  if(!node||!root.contains(node)||node.disabled||node.readOnly||node.closest('[hidden]'))return null;
  if(node.tagName==='TEXTAREA')return node;
  if(node.tagName==='INPUT'&&['text','number','search','email','tel','url','password'].includes(node.type))return node;
  return node.closest('[contenteditable]:not([contenteditable="false"])');
 };
 const properties=['position','top','left','right','bottom','width','height','min-height','max-height','margin-top','margin-right','margin-bottom','margin-left','transform','overflow-y','box-sizing'];
 function restorePanel(){
  if(!panelState)return;
  const {node,styles,scrollTop}=panelState;panelState=null;
  for(const [property,value,priority] of styles){
   if(value)node.style.setProperty(property,value,priority);else node.style.removeProperty(property);
  }
  node.classList.remove('keyboard-input-panel');node.scrollTop=scrollTop;
 }
 function fitEditor(field){
  const panel=active&&field?.closest('.betting-input-dialog,.bet-panel,.settings-panel,.launch-paper,#player-profiles');
  if(panel!==panelState?.node)restorePanel();
  if(!panel)return;
  if(!panelState){
   panelState={node:panel,width:screenRect(panel).width,scrollTop:panel.scrollTop,
    styles:properties.map(property=>[property,panel.style.getPropertyValue(property),panel.style.getPropertyPriority(property)])};
  }
  const view=contentViewport(win),zoom=effectiveZoom(panel),pad=8;
  const width=Math.max(1,Math.min(panelState.width||view.width-pad*2,view.width-pad*2));
  const values={position:'fixed',top:(view.y+pad)/zoom+'px',left:(view.x+(view.width-width)/2)/zoom+'px',
   right:'auto',bottom:'auto',width:width/zoom+'px',height:'auto','min-height':'0px',
   'max-height':Math.max(1,view.height-pad*2)/zoom+'px','margin-top':'0px','margin-right':'0px','margin-bottom':'0px','margin-left':'0px',
   transform:'none','overflow-y':'auto','box-sizing':'border-box'};
  for(const [property,value] of Object.entries(values))panel.style.setProperty(property,value,'important');
  panel.classList.add('keyboard-input-panel');
  // Scroll the form, never the document or the underlying arena.
  scrollPanelToTarget(panel,field);
 }
 function update(notify=true){
  if(disposed||updating)return;
  updating=true;
  try{
   const next=measure(),field=editable(),before=stable,wasActive=active;
   const rotated=next.orientation!==stable.orientation;
   if(!ctx.touchDevice||!sameWidth(stable,next)||rotated){stable=next;active=false;}
   else if(lostHeight(stable,next)&&(field||active))active=true;
   else{stable=next;active=false;}
   root.__keyboardViewportState={stable:{...stable},active};
   root.classList.toggle('keyboard-open',active);
   if(notify){
    if(wasActive!==active||before.width!==stable.width||before.height!==stable.height)onLayoutChange();
    fitEditor(field);
   }
  }finally{updating=false;}
 }
 const focusOut=()=>queueMicrotask(()=>update());
 const change=()=>update();
 const api={size(){update(false);return {width:stable.width,height:stable.height};},get active(){return active;}};
 ctx.keyboardViewport=api;
 doc.addEventListener('focusin',change);doc.addEventListener('focusout',focusOut);
 win.addEventListener('telegram-viewport-change',change);win.addEventListener('resize',change);win.screen?.orientation?.addEventListener?.('change',change);
 win.visualViewport?.addEventListener('resize',change);win.visualViewport?.addEventListener('scroll',change);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  disposed=true;restorePanel();root.classList.remove('keyboard-open');
  doc.removeEventListener('focusin',change);doc.removeEventListener('focusout',focusOut);
  win.removeEventListener('telegram-viewport-change',change);win.removeEventListener('resize',change);win.screen?.orientation?.removeEventListener?.('change',change);
  win.visualViewport?.removeEventListener('resize',change);win.visualViewport?.removeEventListener('scroll',change);
  if(ctx.keyboardViewport===api)ctx.keyboardViewport=null;
  dispose();
 };
 return api;
}
