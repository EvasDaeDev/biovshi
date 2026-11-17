// Include surgery and mutation replacements in the Pixi atlas source pool.
export function arenaSpriteAtlasUrls(textures,resolve){
 const names=/^(?:robot|towerSurgery_|towerMutation_|liquids|hat|flashlight)/;
 return Object.entries(textures).filter(([key])=>names.test(key))
  .map(([,path])=>resolve(path)).filter(Boolean);
}
export function resolveArenaSpriteSource(sources,requested,fallback){
 return sources.get(requested)??(fallback?sources.get(fallback):undefined);
}
