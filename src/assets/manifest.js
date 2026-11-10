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
  sounds: {
    // Patient voices are separate from the impact and severing effects.
    manPain1: 'assets/sounds/combat/man_pain/hurt_01.mp3',
    manPain2: 'assets/sounds/combat/man_pain/hurt_04.mp3',
    manPain3: 'assets/sounds/combat/man_pain/hurt_05.mp3',
    womanPain1: 'assets/sounds/combat/woman_pain/female_hurt_01.ogg',
    womanPain2: 'assets/sounds/combat/woman_pain/female_hurt_02.ogg',
    womanPain3: 'assets/sounds/combat/woman_pain/female_hurt_03.ogg',
    womanPain4: 'assets/sounds/combat/woman_pain/female_hurt_04.ogg',
    womanPain5: 'assets/sounds/combat/woman_pain/female_hurt_05.ogg',
    womanPain6: 'assets/sounds/combat/woman_pain/female_hurt_06.ogg',
    womanPain7: 'assets/sounds/combat/woman_pain/female_hurt_07.ogg',
    pounce: 'assets/sounds/effects/56_Attack_03.ogg',
    hit: 'assets/sounds/effects/hit_1.mp3',
    crit: 'assets/sounds/effects/crit_hit_1.mp3',
    death: 'assets/sounds/effects/death_body_1.mp3',
    detach1: 'assets/sounds/effects/detach_limb_1.mp3',
    detach2: 'assets/sounds/effects/detach_limb_2.mp3',
    victory: 'assets/sounds/effects/end_01.mp3',
    miss1: 'assets/sounds/effects/miss_1.mp3',
    miss2: 'assets/sounds/effects/miss_2.mp3',
    crawl: 'assets/sounds/effects/slow_death_run.mp3',
    drag: 'assets/sounds/effects/step_1.mp3',
    step: 'assets/sounds/effects/step_1.mp3',
    music: 'assets/sounds/music/music_01.mp3',
  },
};
export function assetUrl(file) {
  if (!file) return null;
  const inline = typeof __INLINE_ASSETS__ === 'undefined' ? {} : __INLINE_ASSETS__;
  return inline[file] ?? (import.meta.env?.BASE_URL ?? './') + file;
}
