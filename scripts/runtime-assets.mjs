import fs from 'node:fs/promises';
import path from 'node:path';
import {ASSETS} from '../src/assets/manifest.js';
import {validLocationId} from '../src/game/location-geometry.js';

// Only gameplay resources, installation icons and pinned Telegram SDK are
// shipped. Never copy arbitrary public/ files (including artist sources).
export const EXTRA_RUNTIME_ASSETS=[
  'assets/textures/UI/icons/app_ico_64.png',
  'assets/textures/UI/icons/app_ico_512.png',
  'manifest.webmanifest',
  'vendor/telegram-web-app-65.js',
  'vendor/telegram-web-app-65.json',
];
export const FORBIDDEN_RUNTIME_PATH=/(^|\/)\_src(\/|$)|\.psd$/i;
export const requiredRuntimePaths=()=>[...new Set([
  ...Object.values(ASSETS.textures),
  ...Object.values(ASSETS.sounds),
  ...EXTRA_RUNTIME_ASSETS,
].filter(Boolean))].sort();

export function assertRuntimePath(file){
  if(typeof file!=='string'||!file||file.startsWith('/')||
      file.includes('\\')||file.split('/').some(part=>part==='..'||part==='.'||!part)||
      FORBIDDEN_RUNTIME_PATH.test(file))
    throw Error('Disallowed runtime resource: '+file);
  return file;
}

export async function copyRuntimeAssets(sourceRoot,destinationRoot,{warn=()=>{}}={}){
  let copied=0,bytes=0;
  const missing=[],missingLocations=[];
  const locations=[];
  const manifestPath='locations/active.json';
  try{
    const raw=await fs.readFile(path.join(sourceRoot,manifestPath),'utf8');
    locations.push(manifestPath);
    const manifest=JSON.parse(raw);
    if(manifest?.version!==1||!Array.isArray(manifest.active)||manifest.active.length>128)
      throw Error('Invalid location manifest');
    for(const id of new Set(manifest.active.filter(validLocationId)))locations.push('locations/'+id+'.json');
  }catch(error){
    if(error.code!=='ENOENT')warn('Could not read active locations: '+error.message);
  }
  for(const relative of [...requiredRuntimePaths(),...locations]){
    assertRuntimePath(relative);
    const source=path.join(sourceRoot,relative);
    let info;
    try{info=await fs.stat(source);}
    catch(error){
      if(error.code!=='ENOENT')throw error;
      (relative.startsWith('locations/')?missingLocations:missing).push(relative);continue;
    }
    if(!info.isFile())throw Error('Runtime asset is not a file: '+relative);
    const destination=path.join(destinationRoot,relative);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.copyFile(source,destination);
    bytes+=info.size;copied++;
  }
  if(missing.length)warn('Optional atlas files not found: '+missing.join(', '));
  if(missingLocations.length)warn('Active locations not found: '+missingLocations.join(', '));
  return {copied,bytes,missing};
}

export async function verifyRuntimeAssets(directory){
  const root=path.resolve(directory);
  const expected=new Set(requiredRuntimePaths());
  const found=[];
  async function walk(folder,prefix=''){
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      const relative=prefix?prefix+'/'+entry.name:entry.name;
      if(FORBIDDEN_RUNTIME_PATH.test(relative))throw Error('Artist source leaked into build: '+relative);
      if(entry.isDirectory())await walk(path.join(folder,entry.name),relative);
      else if(entry.isFile())found.push(relative);
    }
  }
  await walk(root);
  const unexpected=found.filter(file=>{
    // Vite emits hashed scripts/styles, manifest and build info.
    if(!file.startsWith('assets/')&&!file.startsWith('vendor/'))return false;
    return !expected.has(file)&&!/^assets\/[^/]+\.(?:js|css|js\.map|css\.map)$/.test(file);
  });
  if(unexpected.length)throw Error('Unexpected packaged assets: '+unexpected.join(', '));
  return {fileCount:found.length,unexpected};
}
