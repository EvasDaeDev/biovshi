import { defineConfig } from 'vite';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyRuntimeAssets,verifyRuntimeAssets} from './scripts/runtime-assets.mjs';
import {writeOfflineWorker} from './scripts/offline-build.mjs';
import {buildVersion} from './scripts/build-version.mjs';

function gameBundleFiles(bundle){
  const files=new Set(['index.html','build-info.json']);
  for(const match of bundle['index.html'].source.matchAll(/(?:src|href)="\.\/([^"]+)"/g)){
    if(bundle[match[1]])files.add(match[1]);
  }
  for(const file of files){
    const chunk=bundle[file];
    if(chunk?.type!=='chunk')continue;
    for(const dependency of [...chunk.imports,...chunk.dynamicImports,
      ...chunk.viteMetadata.importedCss,...chunk.viteMetadata.importedAssets]){
      if(bundle[dependency])files.add(dependency);
    }
  }
  return [...files];
}

export default defineConfig(({mode,command})=>{
  const testBuild=mode==='test';
  let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{/* Source archives may not contain Git metadata. */}
  return {
  base: './',
  define: { __OFFLINE_BUILD__:JSON.stringify(command==='build'), __TEST_BUILD__: JSON.stringify(testBuild), __INLINE_ASSETS__: '{}', __BUILD_SOURCE__: JSON.stringify(sourceCommit), __BUILD_VERSION__: JSON.stringify(buildVersion+(testBuild?'-test':'')) },
  publicDir: 'public',
  plugins:[{
    name:'build-channel',
    transformIndexHtml(html){
      if(!testBuild)return html;
      return html.replace('<title>ЭКЦЕПРИ (ECCEPRY) — Гладиаторские бои</title>','<title>ЭКЦЕПРИ (ECCEPRY) · ТЕСТОВАЯ СБОРКА</title>')
        .replace('ПРОТОКОЛ № 001 · ДОПУСК НА АРЕНУ','ТЕСТОВАЯ СБОРКА · БОСС КАЖДЫЙ 5-Й ЭТАЖ');
    },
    generateBundle(){this.emitFile({type:'asset',fileName:'build-info.json',source:JSON.stringify({channel:testBuild?'test':'main',bossEvery:5,sourceCommit})+'\n'});},
    async writeBundle(outputOptions,bundle){
      const root=fileURLToPath(new URL('.',import.meta.url));
      const output=path.resolve(root,outputOptions.dir??'dist');
      const report=await copyRuntimeAssets(path.join(root,'public'),output,{warn:message=>console.warn(message)});
      const missing=[...report.missing,...report.missingLocations];
      if(missing.length)throw Error('Missing runtime source files: '+missing.join(', '));
      const files=[...Object.keys(bundle),...report.files];
      await writeOfflineWorker(output,[...gameBundleFiles(bundle),...report.files]);
      await verifyRuntimeAssets(output,[...files,'offline-worker.js']);
      console.log('Curated runtime assets:',report.copied,'files,',report.bytes,'bytes');
    },
  }],
  build: {
    target: 'es2022', sourcemap: false, copyPublicDir: false,
    rollupOptions:{input:{
      game:fileURLToPath(new URL('./index.html',import.meta.url)),
      locationEditor:fileURLToPath(new URL('./Editors/location-editor.html',import.meta.url)),
      bioEditor:fileURLToPath(new URL('./bio_editor/index.html',import.meta.url)),
      patients:fileURLToPath(new URL('./bio_editor/patients.html',import.meta.url)),
      effects:fileURLToPath(new URL('./bio_editor/effects.html',import.meta.url)),
    }},
  },
  };
});
