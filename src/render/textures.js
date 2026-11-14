import { CONFIG } from '../config.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { ctx } from '../game/state.js';
import { el } from './svg.js';
import { bakeStaticLighting } from './atmosphere.js';
import { loadTextureImage } from '../assets/preload.js';
import { tintPixels } from './texture-tint.js';
import { coolantRgb } from '../utils/colors.js';

const tintCache = new Map();
const TILE_CM = 100; // One complete texture repeats every metre in world coordinates.

async function tintedTexture(url, colour, strength) {
  const key = [url, colour, strength, CONFIG.rendering.textureMaxSize, CONFIG.rendering.texturePixelated].join('|');
  if (!tintCache.has(key)) {
    const pending = (async () => {
      const image = await loadTextureImage(url);
      // A fixed-size tile, independent of screen density and zoom.
      const scale = Math.min(1, CONFIG.rendering.textureMaxSize / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const drawing = canvas.getContext('2d', { willReadFrequently: true });
      if (!drawing) throw new Error('Texture canvas is unavailable');
      drawing.imageSmoothingEnabled = !CONFIG.rendering.texturePixelated;
      drawing.fillStyle = colour;
      drawing.fillRect(0, 0, 1, 1);
      const rgb = drawing.getImageData(0, 0, 1, 1).data.slice(0, 3);
      drawing.clearRect(0, 0, canvas.width, canvas.height);
      drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
      const pixels = drawing.getImageData(0, 0, canvas.width, canvas.height);
      tintPixels(pixels.data, rgb, strength);
      drawing.putImageData(pixels, 0, 0);
      return canvas.toDataURL('image/png');
    })();
    tintCache.set(key, pending);
    pending.catch(() => tintCache.delete(key));
  }
  return tintCache.get(key);
}

export async function applyTextures() {
  const svg = ctx.svg;
  const defs = ctx.defs;
  const jobs = [
    ['arenaFloor', [ctx.arenaContent.querySelector(':scope > rect')], CONFIG.rendering.floorTintColor, CONFIG.rendering.floorTintStrength],
    ['arenaWall', [...defs.querySelectorAll('#texture-arenaWall image')], CONFIG.rendering.wallTintColor, CONFIG.rendering.wallTintStrength],
    ['obstacle', [...defs.querySelectorAll('#texture-obstacle image')], CONFIG.rendering.wallTintColor, CONFIG.rendering.wallTintStrength],
  ];
  for (const [key, targets, colour, strength] of jobs) {
    const url = assetUrl(ASSETS.textures[key]);
    if (!url || !targets[0] || ctx.textureAssets?.[key]?.loaded===false) continue;
    try {
      const source = await tintedTexture(url, colour, strength);
      if (svg !== ctx.svg || !svg.isConnected || ctx.disposed) return;
      if (key !== 'arenaFloor') {
        for (const node of targets) { node.setAttribute('href',source); node.setAttribute('opacity','1'); }
        continue;
      }
      const id = 'texture-' + key;
      svg.querySelector('#' + id)?.remove();
      const pattern = el('pattern', {
        id, patternUnits:'userSpaceOnUse', x:0, y:0, width:TILE_CM, height:TILE_CM,
      }, defs);
      el('image', {
        href:source, width:TILE_CM, height:TILE_CM, preserveAspectRatio:'none',
        style:CONFIG.rendering.texturePixelated ? 'image-rendering:crisp-edges;image-rendering:pixelated' : '',
      }, pattern);
      for (const node of targets) node.style.fill = 'url(#' + id + ')';
    } catch (error) {
      if (key !== 'arenaFloor') for (const node of targets) node.setAttribute('opacity','1');
      // Keep the original floor if a file fails; the fight must still start.
      console.warn('Arena texture:', error);
    }
  }
  const liquidUrl=assetUrl(ASSETS.textures.liquids);
  // Recolour once at load time. Full-strength luminance tint removes the red hue
  // while retaining the sprite's texture and alpha; it is not RGB multiplication.
  if(liquidUrl&&ctx.textureAssets?.liquids?.loaded!==false)try {
    const coolant=await Promise.all([0,1/3,2/3,1].map(level=>
      tintedTexture(liquidUrl,`rgb(${coolantRgb(level).join(' ')})`,1)));
    if(svg!==ctx.svg||!svg.isConnected||ctx.disposed)return;
    ctx.coolantAtlasSources=coolant;
  } catch(error) {console.warn('Coolant texture:',error);}
  if(liquidUrl&&ctx.textureAssets?.liquids?.loaded!==false)try {
    const dry=await Promise.all([1/3,2/3,1].map(level=>
      tintedTexture(liquidUrl,CONFIG.oil.spriteDryColor,level*CONFIG.oil.spriteDryStrength)));
    if(svg!==ctx.svg||!svg.isConnected||ctx.disposed)return;
    ctx.liquidAtlasSources=[liquidUrl,...dry];
    ctx.settledOilDrops=new WeakSet();
  } catch(error) {console.warn('Liquid texture:',error);}
  try{if(ctx.renderProfile?.name!=='light')await bakeStaticLighting();}catch(error){console.warn('Static lighting:',error);}
}
