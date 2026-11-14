// Older WebKit returns CSS-zoom-local rectangles. Modern browsers return
// viewport rectangles. Detect the behavior rather than guessing from a UA.
const legacyRects=new WeakMap();
export function hasUnscaledZoomRects(doc){
  if(legacyRects.has(doc))return legacyRects.get(doc);
  if(!doc.body)return false;
  const probe=doc.createElement('div');
  probe.style.cssText='position:fixed;left:0;top:0;width:10px;height:10px;zoom:2;visibility:hidden;pointer-events:none;contain:strict';
  doc.body.append(probe);
  let width;
  try{width=probe.getBoundingClientRect().width;}finally{probe.remove();}
  const legacy=width>0&&Math.abs(width-10)<.1;
  legacyRects.set(doc,legacy);
  return legacy;
}
export function effectiveZoom(node){
  const win=node.ownerDocument.defaultView;
  let zoom=1;
  for(let element=node;element;element=element.parentElement){
    const value=win.getComputedStyle(element).getPropertyValue('zoom').trim();
    const number=parseFloat(value),factor=value.endsWith('%')?number/100:number;
    if(Number.isFinite(factor)&&factor>0)zoom*=factor;
  }
  return zoom;
}
export function screenRect(node){
  const rect=node.getBoundingClientRect();
  const zoom=hasUnscaledZoomRects(node.ownerDocument)?effectiveZoom(node):1;
  if(zoom===1)return rect;
  const left=rect.left*zoom,top=rect.top*zoom,width=rect.width*zoom,height=rect.height*zoom;
  return {x:left,y:top,left,top,right:left+width,bottom:top+height,width,height};
}
export function visibleViewport(win){
  const view=win.visualViewport;
  return {x:view?.offsetLeft??0,y:view?.offsetTop??0,width:view?.width||win.innerWidth,height:view?.height||win.innerHeight};
}
// Native dialogs can have a different origin after viewport scrolling/zooming.
// Keep screen geometry separate from CSS positions inside the overlay.
export function localPoint(point,origin){return {x:point.x-origin.left,y:point.y-origin.top};}
export function scrollPanelToTarget(panel,target){
  const item=screenRect(target),box=screenRect(panel);
  const zoom=panel.offsetHeight>0?box.height/panel.offsetHeight:effectiveZoom(panel);
  if(!zoom)return;
  const top=box.top+panel.clientTop*zoom,bottom=top+panel.clientHeight*zoom;
  if(item.height>bottom-top||item.top<top)panel.scrollTop+=(item.top-top)/zoom;
  else if(item.bottom>bottom)panel.scrollTop+=(item.bottom-bottom)/zoom;
}
