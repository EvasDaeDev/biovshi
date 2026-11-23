// Validate the combined artifact before publishing either URL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export function checkPagesPreview(directory){
 const root=path.resolve(directory),preview=path.join(root,'test');
 assert.ok(fs.statSync(path.join(root,'index.html')).isFile(),'Stable entry is present');
 const html=fs.readFileSync(path.join(preview,'index.html'),'utf8');
 assert.match(html,/ТЕСТОВАЯ СБОРКА/);assert.match(html,/БОСС КАЖДЫЙ 5-Й ЭТАЖ/);
 const info=JSON.parse(fs.readFileSync(path.join(preview,'build-info.json'),'utf8'));
 assert.equal(info.channel,'test');assert.equal(info.bossEvery,5);
 if(html.includes('./vendor/telegram-web-app-65.js')){
  const sdk=fs.readFileSync(path.join(preview,'vendor/telegram-web-app-65.js'));
  const metadata=JSON.parse(fs.readFileSync(path.join(preview,'vendor/telegram-web-app-65.json'),'utf8'));
  assert.equal(createHash('sha256').update(sdk).digest('hex'),metadata.sha256,'Published Telegram SDK matches its pinned official source');
 }
 const base=new URL('https://example.github.io/biovshi/test/');
 const editorPath='Editors/location-editor.html';
 const editor=fs.readFileSync(path.join(preview,editorPath),'utf8');
 assert.match(editor,/<title>Редактор локаций/);
 const moduleEntry=/<script type="module"[^>]*src=/;
 const pages=[[html,base]];
 if(moduleEntry.test(editor))pages.push([editor,new URL(editorPath,base)]);
 else{
  assert.match(editor,/<meta http-equiv="refresh" content="0; url=\.\.\/bio_editor\/"/);
  for(const editorFile of ['index.html','patients.html','effects.html']){
   const relative='bio_editor/'+editorFile;
   const content=fs.readFileSync(path.join(preview,relative),'utf8');
   assert.match(content,moduleEntry);
   pages.push([content,new URL(relative,base)]);
  }
 }
 if(info.lanPage){
  assert.equal(info.lanPage,'lan/');
  const lan=fs.readFileSync(path.join(preview,info.lanPage,'index.html'),'utf8');
  assert.match(lan,/<title>ЭКЦЕПРИ · Игра по локальной сети/);
  assert.match(lan,/href="http:\/\/127\.0\.0\.1:8081\/lan\/"/);
  pages.push([lan,new URL(info.lanPage,base)]);
 }
 for(const [page,pageUrl] of pages){
  for(const match of page.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)){
   const url=new URL(match[1],pageUrl);assert.ok(url.href.startsWith(base.href),'Test resource escapes /test/: '+url.href);
   const relative=decodeURIComponent(url.pathname.slice(base.pathname.length));assert.ok(fs.statSync(path.join(preview,relative)).isFile(),'Missing test resource: '+relative);
  }
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(preview,'manifest.webmanifest'),'utf8'));
 assert.equal(new URL(manifest.scope,base).href,base.href);assert.equal(new URL(manifest.start_url,base).href,base.href);
 return info;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)console.log(JSON.stringify(checkPagesPreview(process.argv[2]??'site')));
