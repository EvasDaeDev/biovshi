import { ctx } from '../game/state.js';
import { clamp } from '../utils/math.js';
import { CONFIG } from '../config.js';
import { attr } from './svg.js';

// Decorative circles only. AI visibility lives in robot/perception.js and does
// not read these gradients. No visibility polygons or obstacle rays are drawn.
export function paintLighting(robot) {
  const age=ctx.game.time-(robot.lightHitAt??-Infinity);
  const flash=age>=0?1-clamp(age/CONFIG.light.hitFadeSec,0,1):0;
  const opacity=(robot.spawnVisual?.opacity??1)*CONFIG.light.nearbyIntensity*(1+CONFIG.light.hitBoost*flash);
  attr(robot.pool,'opacity',opacity.toFixed(3));
  attr(robot.nearLight,'opacity',opacity.toFixed(3));
  const center=robot.visiblePoint(robot.api.center);
  const transform=`translate(${center.x} ${center.y})`;
  attr(robot.pool,'transform',transform);
  attr(robot.nearLight,'transform',transform);
}
