import { defineConfig } from 'vite';
import {execFileSync} from 'node:child_process';
import {buildVersion} from './scripts/build-version.mjs';

export default defineConfig(({mode})=>{
  const testBuild=mode==='test';
  let sourceCommit=null;try{sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();}catch{/* Source archives may not contain Git metadata. */}
  return {
  base: './',
  define: { __TEST_BUILD__: JSON.stringify(testBuild), __INLINE_ASSETS__: '{}', __BUILD_VERSION__: JSON.stringify(buildVersion+(testBuild?'-test':'')) },
  plugins:[{
    name:'build-channel',
    transformIndexHtml(html){
      if(!testBuild)return html;
      return html.replace('<title>БИОВШИ — Гладиаторские бои</title>','<title>БИОВШИ · ТЕСТОВАЯ СБОРКА</title>')
        .replace('ПРОТОКОЛ № 001 · ДОПУСК НА АРЕНУ','ТЕСТОВАЯ СБОРКА · БОСС КАЖДЫЙ 2-Й ЭТАЖ');
    },
    generateBundle(){this.emitFile({type:'asset',fileName:'build-info.json',source:JSON.stringify({channel:testBuild?'test':'main',bossEvery:testBuild?2:5,sourceCommit})+'\n'});},
  }],
  build: { target: 'es2022', sourcemap: true },
  };
});
