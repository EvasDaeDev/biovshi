import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { CONFIG } from '../src/config.js';

export async function prepareTexture(input, output, { maxSize = 256, pixelated = true } = {}) {
  if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 4096) throw new Error('textureMaxSize must be an integer from 1 to 4096');
  const data = await sharp(input)
    .rotate()
    .resize({ width:maxSize, height:maxSize, fit:'inside', withoutEnlargement:true,
      kernel:pixelated ? sharp.kernel.nearest : sharp.kernel.lanczos3 })
    .webp({ lossless:true, effort:6 })
    .toBuffer();
  await fs.mkdir(path.dirname(output), { recursive:true });
  await fs.writeFile(output, data);
  return { bytes:data.length, ...(await sharp(data).metadata()) };
}

async function main() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const source = path.join(root, '_src/texture-inputs/textures');
  const destination = path.join(root, 'public/assets/textures');
  const outputs = new Set();
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, { withFileTypes:true })) {
      const input = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(input); continue; }
      if (!/\.(png|jpe?g|webp)$/i.test(entry.name)) continue;
      const relative = path.relative(source, input).replace(/\.[^.]+$/, '.webp');
      if (outputs.has(relative)) throw new Error('Duplicate texture output: ' + relative);
      outputs.add(relative);
      const result = await prepareTexture(input, path.join(destination, relative), {
        maxSize:CONFIG.rendering.textureMaxSize,
        pixelated:CONFIG.rendering.texturePixelated,
      });
      console.log(relative + ': ' + result.width + '×' + result.height + ', ' + result.bytes + ' bytes, lossless WebP');
    }
  }
  await walk(source);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
