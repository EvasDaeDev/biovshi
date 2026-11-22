import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const hash=value=>createHash('sha256').update(value).digest('hex');

export async function writeOfflineWorker(output,files){
  const worker=await fs.readFile(new URL('./offline-worker.js',import.meta.url),'utf8');
  const entries=await Promise.all([...new Set(files)].sort().map(async file=>
    [file,hash(await fs.readFile(path.join(output,file)))]));
  const list=JSON.stringify(entries);
  await fs.writeFile(path.join(output,'offline-worker.js'),
    'const OFFLINE_VERSION='+JSON.stringify(hash(worker+list))+';\nconst OFFLINE_FILES='+list+';\n'+worker);
}
