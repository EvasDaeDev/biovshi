import fs from 'node:fs/promises';
import path from 'node:path';
import {ASSETS} from '../src/assets/manifest.js';
import {validLocationId} from '../src/game/location-geometry.js';

const latinAndCyrillic=['cyrillic','latin','latin-ext'];
export const FONT_RUNTIME_ASSETS=[
  ...latinAndCyrillic.map(subset=>'fonts/KellySlab-'+subset+'.woff2'),
  ...['IBMPlexMono-regular','IBMPlexMono-italic','IBMPlexMono-bold','RubikDistressed'].flatMap(face=>
    [...latinAndCyrillic,'cyrillic-ext'].map(subset=>'fonts/'+face+'-'+subset+'.woff2')),
  ...['KellySlab','IBMPlexMono','RubikDistressed'].map(family=>'fonts/'+family+'-OFL.txt'),
];

// Only gameplay resources, installation icons, fonts and pinned Telegram SDK are
// shipped. Never copy arbitrary public/ files (including artist sources).
export const EXTRA_RUNTIME_ASSETS=[
  'assets/textures/UI/icons/app_ico_64.png',
  'assets/textures/UI/icons/app_ico_512.png',
  'manifest.webmanifest',
  'vendor/telegram-web-app-65.js',
  'vendor/telegram-web-app-65.json',
  ...FONT_RUNTIME_ASSETS,
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
  const files=[],missing=[],missingLocations=[];
  const locations=[];
  const manifestPath='locations/active.json';
  try{
    const raw=await fs.readFile(path.join(sourceRoot,manifestPath),'utf8');
    const manifest=JSON.parse(raw);
    if(manifest?.version!==1||!Array.isArray(manifest.active)||manifest.active.length>128)
      throw Error('Invalid location manifest');
    locations.push(manifestPath);
    for(const id of new Set(manifest.active.filter(validLocationId)))locations.push('locations/'+id+'.json');
  }catch(error){
    missingLocations.push(manifestPath);
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
    if(!info.isFile()||info.size===0)throw Error('Invalid runtime file: '+relative);
    const destination=path.join(destinationRoot,relative);
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await fs.copyFile(source,destination);
    files.push(relative);bytes+=info.size;copied++;
  }
  if(missing.length)warn('Runtime files not found: '+missing.join(', '));
  if(missingLocations.length)warn('Active locations not found: '+missingLocations.join(', '));
  return {copied,bytes,files,missing,missingLocations};
}

export async function verifyRuntimeAssets(directory,expectedFiles=requiredRuntimePaths()){
  const root=path.resolve(directory);
  const expected=new Set(expectedFiles);
  const found=[];
  async function walk(folder,prefix=''){
    for(const entry of await fs.readdir(folder,{withFileTypes:true})){
      const relative=prefix?prefix+'/'+entry.name:entry.name;
      if(FORBIDDEN_RUNTIME_PATH.test(relative))throw Error('Artist source leaked into build: '+relative);
      if(entry.isDirectory())await walk(path.join(folder,entry.name),relative);
      else if(entry.isFile())found.push(relative);
      else throw Error('Unsupported packaged entry: '+relative);
    }
  }
  await walk(root);
  const unexpected=found.filter(file=>!expected.has(file));
  if(unexpected.length)throw Error('Unexpected packaged assets: '+unexpected.join(', '));
  const inventory=new Set(found);
  const missing=[...expected].filter(file=>!inventory.has(file));
  if(missing.length)throw Error('Missing packaged assets: '+missing.join(', '));
  return {fileCount:found.length,unexpected};
}
