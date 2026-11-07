import { wrap } from '../utils/math.js';
import { CONFIG } from "../config.js";
import { sightClear } from "../systems/collision.js";
import { ctx } from "../game/state.js";
export function robotCanSee(robotState, p) {
  if (!robotState.hasHead()) return false;
  const e = robotState.local(robotState.headFrame, 25, 0);
  const d = Math.hypot(p.x - e.x, p.y - e.y);
  const heading = robotState.headFrame.angle;
  // Ближний свет даёт круговой обзор от центра корпуса; стены его перекрывают.
  const center = robotState.api.center;
  const nearby = Math.hypot(p.x - center.x, p.y - center.y) <= CONFIG.light.nearbyRadiusCm && sightClear(center, p);
  const forward = d <= CONFIG.vision.rangeCm && Math.abs(wrap(Math.atan2(p.y - e.y, p.x - e.x) - heading)) <= robotState.visionAngle() / 2 && sightClear(e, p);
  return nearby || forward;
}
