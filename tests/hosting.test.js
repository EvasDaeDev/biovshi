import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));

test('entry, styles and all module imports resolve inside a GitHub Pages repository subpath', () => {
  const base=new URL('https://example.github.io/biovshi/');
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const entries=[...html.matchAll(/<(?:link|script)\b[^>]*\b(?:href|src)="([^"]+)"/g)].map(m=>m[1]);
  assert.ok(entries.length>=5);
  const visited=new Set();
  function check(reference,parent) {
    const url=new URL(reference,parent);
    assert.ok(url.href.startsWith(base.href),`Resource escapes repository: ${url.href}`);
    if(visited.has(url.href))return;
    visited.add(url.href);
    const relative=decodeURIComponent(url.pathname.slice(base.pathname.length));
    const sourceFile=path.join(root,relative);
    // Vite serves public/ at the site root and copies it unchanged into dist/.
    const file=fs.existsSync(sourceFile)?sourceFile:path.join(root,'public',relative);
    assert.ok(fs.statSync(file).isFile(),`Missing resource: ${url.href}`);
    if(file.endsWith('.js')){
      const code=fs.readFileSync(file,'utf8');
      for(const m of code.matchAll(/\bimport\s+(?:[^'";]+?\s+from\s*)?['"]([^'"]+)['"]/g))check(m[1],url);
    }
  }
  for(const reference of entries)check(reference,base);
  assert.ok(visited.size>35,'Traverse the full module graph');
});
