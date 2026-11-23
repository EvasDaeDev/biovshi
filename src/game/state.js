/** Shared state for one arena. Initialized in initialize.js; importing modules has no DOM side effects. */
export const ctx = {};

// The local viewpoint can differ between browsers in the same LAN match.
export function arenaViewPlayerId() {
  if (ctx.mode === 'tower') return 0;
  return ctx.mode === 'multiplayer' ? ctx.multiplayer.fighters.findIndex(fighter => fighter.control === 'local') : -1;
}
