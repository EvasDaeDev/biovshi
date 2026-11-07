import { build } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.ogg':'audio/ogg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.woff2':'font/woff2' };
const assets = {};
async function collect(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (mime[path.extname(file).toLowerCase()]) assets[path.relative(path.join(root,'public'), file).split(path.sep).join('/')] = 'data:' + mime[path.extname(file).toLowerCase()] + ';base64,' + (await fs.readFile(file)).toString('base64');
  }
}
await collect(path.join(root,'public/assets'));
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
