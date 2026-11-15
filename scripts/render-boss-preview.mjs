// Render the actual SVG skin/pose. This is an anatomy sheet, not a browser screenshot.
import fs from 'node:fs';
import sharp from 'sharp';
import {startBossScenario} from './boss-harness.mjs';
import {BOSS_VARIANTS} from '../src/boss/config.js';
const panels=[];
for(const variant of BOSS_VARIANTS){
 const f=startBossScenario({variant:variant.id,arena:'ring',seed:4101});
 try{
  const r=f.boss;r.paint(0);const copy=r.actor.cloneNode(true);copy.querySelector('.robot-label')?.remove();
  const actor=copy.outerHTML.replace(/href="\.\/([^\"]+)"/g,(_,file)=>'href="data:image/png;base64,'+fs.readFileSync(new URL('../public/'+file,import.meta.url)).toString('base64')+'"');
  const c=r.center,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="300"><rect width="440" height="300" fill="#282722"/><text x="20" y="28" font-family="DejaVu Sans" font-size="18" fill="#d7c7a8">${variant.name}</text><svg x="0" y="40" width="440" height="260" viewBox="${c.x-90} ${c.y-70} 180 140">${actor}</svg></svg>`;
  panels.push({input:await sharp(Buffer.from(svg)).png().toBuffer(),left:panels.length%2*440,top:Math.floor(panels.length/2)*300});
 }finally{f.close();}
}
await sharp({create:{width:880,height:600,channels:4,background:'#282722'}}).composite(panels).png().toFile(new URL('../docs/experiments/boss-anatomies.png',import.meta.url).pathname);
