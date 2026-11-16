import {CONFIG} from '../config.js';
import {ctx} from '../game/state.js';

// Each new arena / round shifts hue by at least 45 degrees on the colour wheel.
export function nextAmbientHue(previous=null,random=Math.random()){
 const r=Number.isFinite(random)?Math.max(0,Math.min(1-Number.EPSILON,random)):0;
 return previous==null?r*360:(previous+45+r*270)%360;
}

// Keep the original ambient light's saturation and lightness. Only hue changes.
export function ambientHueColor(base,hue){
 const rgb=[1,3,5].map(i=>parseInt(base.slice(i,i+2),16)/255);
 const hi=Math.max(...rgb),lo=Math.min(...rgb),d=hi-lo;
 const lightness=(hi+lo)/2;
 const saturation=d===0?0:d/(1-Math.abs(2*lightness-1));
 return 'hsl('+((hue%360+360)%360).toFixed(2)+' '+(saturation*100).toFixed(2)+'% '+(lightness*100).toFixed(2)+'%)';
}
export function selectArenaAmbient(random=Math.random()){
 ctx.ambientHue=nextAmbientHue(ctx.ambientHue,random);
 ctx.ambientColor=ambientHueColor(CONFIG.light.ambientColor,ctx.ambientHue);
 return ctx.ambientColor;
}
export function rerollArenaAmbient(random=Math.random()){
 selectArenaAmbient(random);
 const group=ctx.ambientGlowG;
 if(!group)return;
 // Compare with the source colour captured when this arena was prepared.
 const shift=((ctx.ambientHue-ctx.ambientBakedHue+540)%360)-180;
 if(group.dataset.rasterized==='true'){
  // The SVG fallback can recolour its existing bitmap without rerasterizing.
  group.style.filter='hue-rotate('+shift.toFixed(2)+'deg)';
 }else{
  for(const polygon of group.querySelectorAll('polygon'))polygon.setAttribute('stroke',ctx.ambientColor);
 }
 for(const stop of ctx.defs?.querySelectorAll('#tag7hop-obstacle-glow stop')??[])
  stop.setAttribute('stop-color',ctx.ambientColor);
 ctx.arenaRenderer?.setAmbientHue?.(shift);
}
