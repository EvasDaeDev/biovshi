// Paths are relative to public/. Use null to keep the current appearance and silence.
export const ASSETS = {
  textures: { arenaFloor: 'assets/textures/arena/floor_01.webp', obstacle: null },
  sounds: { hit: null, 'segment-broken': null, 'robot-immobilized': null, 'combat-end': null },
};
export function assetUrl(file) {
  if (!file) return null;
  const inline = typeof __INLINE_ASSETS__ === 'undefined' ? {} : __INLINE_ASSETS__;
  return inline[file] ?? (import.meta.env?.BASE_URL ?? './') + file;
}
