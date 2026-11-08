import { CONFIG } from '../config.js';
import { attr } from './svg.js';

// Decorative circles only. AI visibility lives in robot/perception.js and does
// not read these gradients. No visibility polygons or obstacle rays are drawn.
export function paintLighting(robot) {
  const opacity=(robot.spawnVisual?.opacity??1)*CONFIG.light.nearbyIntensity;
  attr(robot.pool,'opacity',opacity.toFixed(3));
  attr(robot.nearLight,'opacity',opacity.toFixed(3));
  const center=robot.visiblePoint(robot.api.center);
  const transform=`translate(${center.x} ${center.y})`;
  attr(robot.pool,'transform',transform);
  attr(robot.nearLight,'transform',transform);
}
