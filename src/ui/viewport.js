import {ctx} from '../game/state.js';

// Keep one landscape layout. Only shrink it when its minimum usable size
// cannot fit; CSS pixels, not the device's physical pixel count, matter here.
export function viewportLayout(width,height) {
  const availableWidth=Math.max(1,width-24),availableHeight=Math.max(1,height-24);
  const scale=Math.min(1,availableWidth/1000,availableHeight/620);
  return {scale,width:availableWidth/scale,height:height/scale};
}
export function fitInterface(){
  const win=ctx.root.ownerDocument.defaultView;
  const raw=ctx.keyboardViewport?.size()??{width:win.visualViewport?.width||win.innerWidth,height:win.visualViewport?.height||win.innerHeight};
  const viewport=ctx.platform?.viewport(raw)??raw;
  ctx.layoutViewport=viewport;
  const layout=viewportLayout(viewport.width,viewport.height);
  ctx.layoutScale=layout.scale;
  for(const side of ['top','right','bottom','left'])ctx.root.style.setProperty('--telegram-layout-'+side,((viewport[side]||0)/layout.scale)+'px');
  ctx.root.style.setProperty('--interface-scale',String(layout.scale));
  ctx.root.style.zoom=String(layout.scale);
  ctx.root.style.width=(ctx.arenaExpanded?viewport.width/layout.scale:layout.width)+'px';
  ctx.root.style.setProperty('--game-height',layout.height+'px');
  ctx.root.classList.toggle('compact-layout',layout.width<1120);
  // A wide iPad still needs the touch toolbar; width alone cannot identify it.
  ctx.root.classList.toggle('mobile-layout',Boolean(ctx.touchDevice));
}
