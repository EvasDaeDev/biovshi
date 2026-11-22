import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {assertRuntimePath,requiredRuntimePaths,copyRuntimeAssets,verifyRuntimeAssets} from '../scripts/runtime-assets.mjs';

test('runtime resource inventory includes dynamic Tower atlases and install assets',()=>{
  const paths=requiredRuntimePaths();
  assert.ok(paths.includes('assets/textures/robots/upgrades/ar_mod_piston.png'));
  assert.ok(paths.includes('assets/textures/robots/upgrades/ar_surg_brace.png'));
  assert.ok(paths.includes('assets/textures/UI/icons/app_ico_512.png'));
  assert.ok(paths.includes('vendor/telegram-web-app-65.js'));
  for(const file of paths)assert.equal(assertRuntimePath(file),file);
  for(const file of ['_src/x.png','assets/_src/a.png','assets/source.psd','../outside.png','/absolute.png'])
    assert.throws(()=>assertRuntimePath(file));
});

test('runtime packager copies allowlisted assets, not PSD or nested _src',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'biovshi-pack-'));
  const source=path.join(dir,'public'),dist=path.join(dir,'dist');
  try{
    const paths=requiredRuntimePaths(),known=paths[0];
    for(const [filename,value] of [...paths.map(file=>[file,'runtime']),['assets/textures/UI/_src/icons.png','do not ship'],['assets/textures/UI/artist.psd','do not ship']]){
      const destination=path.join(source,filename);
      await fs.mkdir(path.dirname(destination),{recursive:true});
      await fs.writeFile(destination,value);
    }
    const report=await copyRuntimeAssets(source,dist);
    assert.equal(report.copied,paths.length);
    assert.equal(await fs.readFile(path.join(dist,known),'utf8'),'runtime');
    assert.deepEqual((await verifyRuntimeAssets(dist)).unexpected,[]);
    await fs.unlink(path.join(dist,known));
    await assert.rejects(()=>verifyRuntimeAssets(dist),/Missing packaged assets/);
    await fs.writeFile(path.join(dist,known),'runtime');
    await fs.writeFile(path.join(dist,'archive.docx'),'editor source');
    await assert.rejects(()=>verifyRuntimeAssets(dist),/Unexpected packaged assets: archive.docx/);
    await fs.unlink(path.join(dist,'archive.docx'));
    await fs.mkdir(path.join(dist,'assets/_src'),{recursive:true});
    await fs.writeFile(path.join(dist,'assets/_src/should-fail.png'),'invalid');
    await assert.rejects(()=>verifyRuntimeAssets(dist),/Artist source leaked/);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
