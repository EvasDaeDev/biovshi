import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { path } from '../utils/math.js';
import { nearbyLightOutline, visionOutline } from '../systems/perception.js';
import { renderProfile } from './performance.js';
import { attr } from './svg.js';
import { lampBrightness } from './atmosphere.js';

export function paintLighting(robotState) {
  const spawning=ctx.startup.phase==='spawning';
  const time=spawning?ctx.startup.elapsed:ctx.game.time;
  const brightness=lampBrightness(ctx.game.time,robotState.id,robotState.reduced)*(robotState.spawnVisual?.opacity??1);
  for(const node of [robotState.vision,robotState.lightBeam])
    attr(node,'opacity',brightness.toFixed(3));
  for(const node of [robotState.pool,robotState.nearLight])
    attr(node,'opacity',(brightness*CONFIG.light.nearbyIntensity).toFixed(3));
  const profile = renderProfile();
  const eye = robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0);
  const origin = robotState.visiblePoint(eye);
  const center = robotState.visiblePoint(robotState.api.center);
  const heading = robotState.headFrame.angle + robotState.visualRotation();
  const hasHead = robotState.hasHead();
  const previous = robotState.lightCache;
  const force = !previous || previous.profile !== profile || previous.hasHead !== hasHead || previous.spawning !== spawning || time < previous.time;
  const beamMoved=!previous||previous.x!==origin.x||previous.y!==origin.y||previous.heading!==heading;
  const nearMoved=!previous||previous.cx!==center.x||previous.cy!==center.y;
  if (!force && ((!beamMoved&&!nearMoved) || time-previous.time+1e-8<profile.lightInterval)) return;
  if(force||beamMoved){
    const beam=hasHead?path([origin,...visionOutline(origin,heading,robotState.visionAngle(),profile.coneSamples)])+' Z':'';
    attr(robotState.vision,'d',beam);attr(robotState.lightBeam,'d',beam);
    for(const gradient of [robotState.beamFade,robotState.beamTint]){
      attr(gradient,'cx',origin.x);attr(gradient,'cy',origin.y);
    }
  }
  if(force||nearMoved){
    const near=path(nearbyLightOutline(center,profile.nearSamples))+' Z';
    attr(robotState.nearLight,'d',near);attr(robotState.pool,'d',near);
    for(const gradient of [robotState.gradient,robotState.poolGradient]){
      attr(gradient,'cx',center.x);attr(gradient,'cy',center.y);
    }
  }
  robotState.lightCache = { profile, hasHead, spawning, time, x:origin.x, y:origin.y, cx:center.x, cy:center.y, heading };
}
