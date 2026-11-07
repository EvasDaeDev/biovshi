import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { clamp, smooth } from '../utils/math.js';

const LANDED = Object.freeze({x:0,y:0,scale:1,opacity:1,airborne:false});

// Startup has its own clock: combat time stays at zero until everyone lands.
// These offsets never enter the physical pose, collision capsules or game RNG.
export function spawnAppearance(robot) {
  if (robot.spawnAt == null || ctx.startup.phase !== 'spawning') return LANDED;
  const duration = CONFIG.startup.spawnDurationSec;
  const q = duration > 0 ? clamp((ctx.startup.elapsed-robot.spawnAt)/duration,0,1) : 1;
  if (q >= 1) return LANDED;
  if (robot.reduced) return {x:0,y:0,scale:1,opacity:smooth(q),airborne:true};
  let edge = null, distance = Infinity;
  for (const plane of ctx.arenaPlanes) {
    const length = Math.hypot(plane.nx,plane.ny);
    const d = (plane.c-plane.nx*robot.start.x-plane.ny*robot.start.y)/length;
    if (d < distance) {distance=d;edge=plane;}
  }
  const remaining = (1-q)**3;
  const length = Math.hypot(edge.nx,edge.ny);
  const travel = (distance+CONFIG.startup.spawnEdgeOutsetCm)*remaining;
  return {
    x:edge.nx/length*travel,y:edge.ny/length*travel,
    scale:1+(CONFIG.startup.spawnScale-1)*remaining,
    opacity:smooth(q),airborne:true,
  };
}
