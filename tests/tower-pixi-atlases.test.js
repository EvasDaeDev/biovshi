import test from 'node:test';
import assert from 'node:assert/strict';
import {ASSETS} from '../src/assets/manifest.js';
import {arenaSpriteAtlasUrls,resolveArenaSpriteSource} from '../src/render/pixi-sources.js';
import {TOWER_MUTATION_ATLAS,TOWER_SURGERY_ATLAS} from '../src/tower/upgrade-appearance.js';
test('Pixi preloads all surgery and mutation atlas replacements',()=>{
 const urls=new Set(arenaSpriteAtlasUrls(ASSETS.textures,path=>path));
 for(const [id,path] of Object.entries(TOWER_SURGERY_ATLAS))
  assert.ok(urls.has(path),'missing surgery '+id);
 for(const [id,path] of Object.entries(TOWER_MUTATION_ATLAS))
  assert.ok(urls.has(path),'missing mutation '+id);
 for(const key of ['robotA','robotB','robotC','robotD','robotAndroid'])
  assert.ok(urls.has(ASSETS.textures[key]),'missing robot '+key);
});
test('WebGL uses original sprite if replacement is unavailable',()=>{
 const base={name:'base'},replacement={name:'replacement'};
 const loaded=new Map([['base.png',base],['replacement.png',replacement]]);
 assert.equal(resolveArenaSpriteSource(loaded,'replacement.png','base.png'),replacement);
 loaded.delete('replacement.png');
 assert.equal(resolveArenaSpriteSource(loaded,'replacement.png','base.png'),base);
 assert.equal(resolveArenaSpriteSource(loaded,'missing.png','other.png'),undefined);
});
