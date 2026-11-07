import { ctx } from '../game/state.js';
import { path } from '../utils/math.js';
import { nearbyLightOutline, visionOutline } from '../systems/perception.js';
import { renderProfile } from './performance.js';
import { attr } from './svg.js';
import { CONFIG } from '../config.js';
import { lampBrightness } from './atmosphere.js';
import { featheredBeamPaths } from './beam-feather.js';

export function paintLighting(robotState) {
  const brightness=lampBrightness(ctx.game.time,robotState.id,robotState.reduced);
  for(const node of [robotState.vision,robotState.pool,robotState.lightBeam,robotState.nearLight])
    attr(node,'opacity',brightness.toFixed(3));
  const profile = renderProfile();
  const eye = robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0);
  const origin = robotState.visiblePoint(eye);
  const center = robotState.visiblePoint(robotState.api.center);
  const heading = robotState.headFrame.angle + robotState.visualRotation();
  const hasHead = robotState.hasHead();
  const previous = robotState.lightCache;
  const force = !previous || previous.profile !== profile || previous.hasHead !== hasHead || ctx.game.time < previous.time;
  const moved = !previous || previous.x !== origin.x || previous.y !== origin.y ||
    previous.cx !== center.x || previous.cy !== center.y || previous.heading !== heading;
  if (!force && (!moved || ctx.game.time - previous.time + 1e-8 < profile.lightInterval)) return;
  const count=profile.name==='light'?3:5;
  const outline=hasHead?visionOutline(origin,heading,robotState.visionAngle(),profile.coneSamples):[];
  const beams=hasHead?featheredBeamPaths(origin,heading,outline,robotState.visionAngle(),count,CONFIG.light.beamFeather):[];
  // The pool and the darkness mask use the exact same geometry: trace it once.
  const near = path(nearbyLightOutline(center, profile.nearSamples)) + ' Z';
  robotState.beamLayers.forEach((layer,i)=>{
    for(const node of [layer.vision,layer.mask]) {
      attr(node,'display',i<count?'':'none');
      attr(node,'d',beams[i]??'');
    }
    if(i<count) {
      attr(layer.vision,'opacity',1/count);
      attr(layer.mask,'opacity',1/(count-i));
    }
  });
  attr(robotState.nearLight, 'd', near);
  attr(robotState.pool, 'd', near);
  for (const gradient of [robotState.gradient, robotState.poolGradient]) {
    attr(gradient, 'cx', center.x);
    attr(gradient, 'cy', center.y);
  }
  for (const gradient of [robotState.beamFade, robotState.beamTint]) {
    attr(gradient, 'cx', origin.x);
    attr(gradient, 'cy', origin.y);
  }
  robotState.lightCache = { profile, hasHead, time:ctx.game.time, x:origin.x, y:origin.y, cx:center.x, cy:center.y, heading };
}
