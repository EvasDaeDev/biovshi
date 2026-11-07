import { ctx } from './state.js';

// Pause/visibility transitions start a new wall-clock interval. Background time
// must never be replayed as a burst of attacks when the player returns.
export function resetFrameClock() {
  ctx.last = null;
  ctx.debt = 0;
  ctx.cameraDebt = 0;
}
