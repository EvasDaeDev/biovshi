import {CONFIG} from '../config.js';
// World coordinates are centimetres. Positive angles follow screen clockwise.
const regularPolygon=(sides,radius)=>Array.from({length:sides},(_,i)=>{
 const angle=-Math.PI/2+i*2*Math.PI/sides;
 return {x:350+Math.cos(angle)*radius,y:350+Math.sin(angle)*radius};
});
const annulusBoundary=regularPolygon(16,300);

export const ARENAS=Object.freeze({
  ward:{id:'ward',name:'Операционная · 7 × 7 м',size:700,left:0,top:0,cut:CONFIG.arena.cornerCutCm,obstacles:CONFIG.arena.obstacles,preview:'4,0 96,0 100,4 100,96 96,100 4,100 0,96 0,4'},
  ring:{id:'ring',name:'Ринг · 4 × 4 м',size:400,left:150,top:150,cut:400/(2+Math.sqrt(2)),obstacles:[],preview:'29.29,0 70.71,0 100,29.29 100,70.71 70.71,100 29.29,100 0,70.71 0,29.29'},
  annulus:{id:'annulus',name:'Кольцо · Ø 6 м',size:600,left:50,top:50,
    points:annulusBoundary,obstacles:[{left:250,right:450,top:250,bottom:450,points:regularPolygon(64,100)}],
    spawnPoints:regularPolygon(4,220),patrolPoints:regularPolygon(8,210),
    preview:annulusBoundary.map(p=>`${(p.x-50)/6},${(p.y-50)/6}`).join(' ')}
});
export function randomArenaId(value=Math.random()){const ids=Object.keys(ARENAS);return ids[Math.min(ids.length-1,Math.max(0,Math.floor(value*ids.length)))];}
export const arenaDefinition=id=>ARENAS[id]??ARENAS.ward;
export function arenaDiagram(arena){
 const project=p=>`${(p.x-arena.left)/arena.size*100},${(p.y-arena.top)/arena.size*100}`;
 const obstacles=arena.obstacles.map(b=>b.points?`<polygon class="arena-obstacle" points="${b.points.map(project).join(' ')}"/>`:`<rect class="arena-obstacle" x="${(b.left-arena.left)/arena.size*100}" y="${(b.top-arena.top)/arena.size*100}" width="${(b.right-b.left)/arena.size*100}" height="${(b.bottom-b.top)/arena.size*100}"/>`).join('');
 return `<svg viewBox="-5 -5 110 110" aria-hidden="true"><polygon points="${arena.preview}"/>${obstacles}</svg>`;
}
export function arenaPicker(selected='ward'){
 const current=arenaDefinition(selected);
 return `<details class="arena-picker"><summary aria-label="Выбор арены">${arenaDiagram(current)}${current.name}</summary><div class="arena-options">${Object.values(ARENAS).map(arena=>`<button type="button" data-arena="${arena.id}" aria-pressed="${arena.id===current.id}">${arenaDiagram(arena)}${arena.name}</button>`).join('')}</div></details>`;
}
