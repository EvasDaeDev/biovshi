// Paths are relative to public/. Use null to keep the current appearance and silence.
export const ASSETS = {
  textures: {
    arenaFloor: 'assets/textures/arena/floor_01.webp',
    floorDecals: 'assets/textures/arena/floor_decals.png',
    arenaWall: 'assets/textures/arena/wall_01.webp',
    obstacle: 'assets/textures/arena/wall_02.webp',
    liquids: 'assets/textures/arena/liquids.png',
    hat1: 'assets/textures/robots/decor/head/1.png',
    hat2: 'assets/textures/robots/decor/head/2.png',
    hat3: 'assets/textures/robots/decor/head/3.png',
    hat4: 'assets/textures/robots/decor/head/4.png',
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
