import {ctx} from '../game/state.js';

export function initializeGameGestures(){
 const {root}=ctx,doc=root.ownerDocument,win=doc.defaultView;
 let previous=null;
 const prevent=event=>{if(event.cancelable)event.preventDefault();};
 const remember=event=>{previous=event.touches?.length===1?event.touches[0]:null;};
 const canScrollUp=node=>node instanceof win.HTMLElement&&node.scrollTop>0&&
  (node===doc.scrollingElement||/^(auto|scroll|overlay)$/.test(win.getComputedStyle(node).overflowY));
 const touchMove=event=>{
  if(!event.touches)return;
  const start=previous;
  remember(event);
  if(event.touches.length>1){prevent(event);return;}
  if(!start||!previous||start.identifier!==previous.identifier)return;
  const dx=previous.clientX-start.clientX,dy=previous.clientY-start.clientY;
  if(dy>Math.abs(dx)&&!event.composedPath().some(canScrollUp))prevent(event);
 };

 // Mobile WebKit can hand off a gesture even with touch-action and
 // overscroll-behavior set. Cancel touch defaults without taking over pointers.
 doc.addEventListener('gesturestart',prevent,{capture:true,passive:false});
 doc.addEventListener('gesturechange',prevent,{capture:true,passive:false});
 doc.addEventListener('touchstart',remember,{capture:true,passive:true});
 doc.addEventListener('touchmove',touchMove,{capture:true,passive:false});
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  doc.removeEventListener('gesturestart',prevent,true);
  doc.removeEventListener('gesturechange',prevent,true);
  doc.removeEventListener('touchstart',remember,true);
  doc.removeEventListener('touchmove',touchMove,true);
  dispose();
 };
}
