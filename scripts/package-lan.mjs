import {mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {build} from 'esbuild';
import {zipSync} from 'fflate';

export async function packageLan(root, output, gameFiles) {
  const {metafile, outputFiles} = await build({
    absWorkingDir: root,
    entryPoints: ['server/lan-launcher.mjs'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    legalComments: 'eof',
    write: false,
    metafile: true,
    // Bundled CommonJS dependencies can still load built-in Node modules.
    banner: {js: "import {createRequire} from 'node:module'; const require = createRequire(import.meta.url);"},
  });

  const packages = new Set(['pixi.js']);
  for (const filename of Object.keys(metafile.inputs)) {
    const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(filename);
    if (match) packages.add(match[1]);
  }

  const sources = [
    ['Start-LAN.bat', 'server/Start-LAN.bat'],
    ['server/settings.json', 'server/settings.json'],
    ...['index.html', 'panel.css', 'panel.js'].map(file =>
      ['server/lan-panel/' + file, 'server/lan-panel/' + file]),
    ['LICENSE', 'LICENSE'],
    ['CREDITS.md', 'CREDITS.md'],
  ];
  for (const name of packages) {
    const folder = path.join('node_modules', name);
    for (const file of await readdir(path.join(root, folder))) {
      if (/^(licen[cs]e|notice|copying)(\..*)?$/i.test(file)) {
        sources.push(['licenses/' + name + '/' + file, path.join(folder, file)]);
      }
    }
  }

  const prefix = 'ECCEPRY-LAN/';
  const entries = await Promise.all([
    ...sources.map(async ([name, source]) => [prefix + name, await readFile(path.join(root, source))]),
    ...[...new Set(gameFiles)].map(async file =>
      [prefix + 'game/' + file, await readFile(path.join(output, file))]),
  ]);
  const files = Object.fromEntries(entries);
  files[prefix + 'server/lan-launcher.mjs'] = outputFiles[0].contents;
  const destination = path.join(output, 'lan');
  await mkdir(destination, {recursive: true});
  const zip = zipSync(files, {level: 6});
  await writeFile(path.join(destination, 'ECCEPRY-LAN.zip'), zip);
  console.log('LAN archive:', zip.length, 'bytes');
}
