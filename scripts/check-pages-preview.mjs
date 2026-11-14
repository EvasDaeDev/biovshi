// Validate the combined artifact before publishing either URL.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export function checkPagesPreview(directory){
 const root=path.resolve(directory),preview=path.join(root,'test');
 assert.ok(fs.statSync(path.join(root,'index.html')).isFile(),'Stable entry is present');
 const html=fs.readFileSync(path.join(preview,'index.html'),'utf8');
 assert.match(html,/ТЕСТОВАЯ СБОРКА/);assert.match(html,/БОСС КАЖДЫЙ 2-Й ЭТАЖ/);
 const info=JSON.parse(fs.readFileSync(path.join(preview,'build-info.json'),'utf8'));
 assert.equal(info.channel,'test');assert.equal(info.bossEvery,2);
 const base=new URL('https://example.github.io/biovshi/test/');
 for(const match of html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)){
  const url=new URL(match[1],base);assert.ok(url.href.startsWith(base.href),'Test resource escapes /test/: '+url.href);
  const relative=decodeURIComponent(url.pathname.slice(base.pathname.length));assert.ok(fs.statSync(path.join(preview,relative)).isFile(),'Missing test resource: '+relative);
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(preview,'manifest.webmanifest'),'utf8'));
 assert.equal(new URL(manifest.scope,base).href,base.href);assert.equal(new URL(manifest.start_url,base).href,base.href);
 return info;
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)console.log(JSON.stringify(checkPagesPreview(process.argv[2]??'site')));
