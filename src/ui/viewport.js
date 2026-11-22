import {ctx} from '../game/state.js';
import {contentViewport} from './geometry.js';

// Keep one landscape layout. Only shrink it when its minimum usable size
// cannot fit; CSS pixels, not the device's physical pixel count, matter here.
export function viewportLayout(width,height,gutter=12) {
  const availableWidth=Math.max(1,width-gutter*2),availableHeight=Math.max(1,height-gutter*2);
  const scale=Math.min(1,availableWidth/1000,availableHeight/620);
  return {scale,width:availableWidth/scale,height:height/scale};
}
export function fitInterface(){
  const win=ctx.root.ownerDocument.defaultView;
  const raw=ctx.keyboardViewport?.size()??{width:win.visualViewport?.width||win.innerWidth,height:win.visualViewport?.height||win.innerHeight};
  const viewport=ctx.platform?.viewport(raw)??raw;
  ctx.layoutViewport=viewport;
  const layout=viewportLayout(viewport.width,viewport.height,ctx.platform?.isTelegram?0:12);
  ctx.layoutScale=layout.scale;
  for(const side of ['top','right','bottom','left'])ctx.root.style.setProperty('--telegram-layout-'+side,((viewport[side]||0)/layout.scale)+'px');
  ctx.root.style.setProperty('--interface-scale',String(layout.scale));
  ctx.root.style.zoom=String(layout.scale);
  ctx.root.style.width=(ctx.arenaExpanded?viewport.width/layout.scale:layout.width)+'px';
  ctx.root.style.setProperty('--game-height',layout.height+'px');
  ctx.root.classList.toggle('compact-layout',layout.width<1120);
  // A wide iPad still needs the touch toolbar; width alone cannot identify it.
  ctx.root.classList.toggle('mobile-layout',Boolean(ctx.touchDevice));

  // Dialogs use visible screen coordinates, independent of the arena's zoom.
  const sheet=contentViewport(win);
  const fitSheets=Boolean(ctx.touchDevice||ctx.platform?.isTelegram||sheet.width<=950||sheet.height<=540);
  ctx.root.classList.toggle('fit-sheets',fitSheets);
  ctx.root.style.setProperty('--sheet-layout-width',win.innerWidth+'px');
  ctx.root.style.setProperty('--sheet-layout-height',win.innerHeight+'px');
  const gaps={top:sheet.y,left:sheet.x,right:win.innerWidth-sheet.x-sheet.width,bottom:win.innerHeight-sheet.y-sheet.height};
  for(const [side,value] of Object.entries(gaps))
    ctx.root.style.setProperty('--sheet-offset-'+side,Math.max(0,value)+'px');
}
