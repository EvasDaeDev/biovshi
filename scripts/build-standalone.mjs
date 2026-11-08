import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ASSETS } from '../src/assets/manifest.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2' };
const assets = {};
// Inline only runtime assets. Artist references and atlas guides are not used
// by the game, and embedding them needlessly inflates the standalone download.
for (const relative of new Set([...Object.values(ASSETS.textures),...Object.values(ASSETS.sounds)].filter(Boolean))) {
  const type=mime[path.extname(relative).toLowerCase()];
  if(!type)throw new Error('Unsupported inline asset: '+relative);
  assets[relative]='data:'+type+';base64,'+(await fs.readFile(path.join(root,'public',relative))).toString('base64');
}
const result = await build({ root, configFile: false, define: { __INLINE_ASSETS__: JSON.stringify(assets), 'import.meta.env.BASE_URL': JSON.stringify('./') }, build: { write: false, target: 'es2022', minify: true, lib: { entry: path.join(root,'src/main.js'), name: 'Biovshi', formats: ['iife'] } } });
const outputs = Array.isArray(result) ? result.flatMap(r=>r.output) : result.output;
const code = outputs.find(o=>o.type==='chunk').code;
let html = await fs.readFile(path.join(root,'index.html'),'utf8');
for (const match of [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)]) {
  const css = await fs.readFile(path.join(root, match[1].replace(/^\//,'')), 'utf8');
  html = html.replace(match[0], '<style>'+css+'</style>');
}
html = html.replace(/<script type="module" src="[^"]+"><\/script>/, () => '<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
await fs.mkdir(path.join(root,'dist'),{recursive:true});
await fs.writeFile(path.join(root,'dist/biovshi.html'),html);
console.log('Standalone: dist/biovshi.html (textures and sounds embedded)');
