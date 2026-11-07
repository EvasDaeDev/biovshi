// Paths are relative to public/. Use null to keep the current appearance and silence.
export const ASSETS = {
  textures: {
    arenaFloor: 'assets/textures/arena/floor_01.webp',
    floorDecals: 'assets/textures/arena/floor_decals.png',
    arenaWall: 'assets/textures/arena/wall_01.webp',
    obstacle: 'assets/textures/arena/wall_02.webp',
    liquids: 'assets/textures/arena/liquids.png',
    robotA: 'assets/textures/robots/r_01.png',
    robotB: 'assets/textures/robots/r_02.png',
    robotC: 'assets/textures/robots/r_03.png',
    robotD: 'assets/textures/robots/r_04.png',
  },
  sounds: { hit: null, 'segment-broken': null, 'robot-immobilized': null, 'combat-end': null },
};
export function assetUrl(file) {
  if (!file) return null;
  const inline = typeof __INLINE_ASSETS__ === 'undefined' ? {} : __INLINE_ASSETS__;
  return inline[file] ?? (import.meta.env?.BASE_URL ?? './') + file;
}
