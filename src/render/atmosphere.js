import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr } from './svg.js';

const hash=n=>{const value=Math.sin(n*127.1+311.7)*43758.5453;return value-Math.floor(value);};

// Cosmetic clock only: no simulation RNG, timers, or effects on perception.
export function lampBrightness(time,id,reduced=false) {
  if (reduced) return 1;
  const period=8.5+hash(id+1)*5;
  const clock=time+id*1.73,cycle=Math.floor(clock/period),phase=clock-cycle*period;
  const start=2+hash(cycle*37+id*11)*Math.max(1,period-3);
  const duration=.18+hash(cycle*17+id*19)*.13;
  const t=(phase-start)/duration;
  if(t<=0||t>=1)return 1;
  return 1-CONFIG.light.flickerDepth*(.75+.25*hash(cycle+id*7))*Math.sin(Math.PI*t)**2;
}

export function paintAtmosphere() {
  const fighting=ctx.startup.phase==='running';
  for (const [i,node] of (ctx.ambientLights??[]).entries()) {
    const brightness=lampBrightness(fighting?ctx.game.time:0,i+10,ctx.atmosphereReduced);
    attr(node,'opacity',(CONFIG.light.ambientIntensity*brightness).toFixed(3));
  }
  for(const [i,spot] of (ctx.obstacleLightSpots??[]).entries()) {
    const brightness=lampBrightness(fighting?ctx.game.time:0,i+11,ctx.atmosphereReduced);
    attr(spot.glow,'opacity',(CONFIG.light.obstacleLightOpacity*brightness).toFixed(3));
    attr(spot.reveal,'opacity',(CONFIG.light.obstacleLightReveal*brightness).toFixed(3));
  }
}
