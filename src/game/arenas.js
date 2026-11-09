import {CONFIG} from '../config.js';
export const ARENAS=Object.freeze({
  ward:{id:'ward',name:'Операционная · 7 × 7 м',size:700,left:0,top:0,cut:CONFIG.arena.cornerCutCm,obstacles:CONFIG.arena.obstacles,preview:'4,0 96,0 100,4 100,96 96,100 4,100 0,96 0,4'},
  ring:{id:'ring',name:'Ринг · 4 × 4 м',size:400,left:150,top:150,cut:400/(2+Math.sqrt(2)),obstacles:[],preview:'29.29,0 70.71,0 100,29.29 100,70.71 70.71,100 29.29,100 0,70.71 0,29.29'}
});
export const arenaDefinition=id=>ARENAS[id]??ARENAS.ward;
export function arenaDiagram(arena){
 const obstacles=arena.obstacles.map(b=>b.points?`<polygon class="arena-obstacle" points="${b.points.map(p=>p.x/7+','+p.y/7).join(' ')}"/>`:`<rect class="arena-obstacle" x="${b.left/7}" y="${b.top/7}" width="${(b.right-b.left)/7}" height="${(b.bottom-b.top)/7}"/>`).join('');
 return `<svg viewBox="-5 -5 110 110" aria-hidden="true"><polygon points="${arena.preview}"/>${obstacles}</svg>`;
}
export function arenaPicker(selected='ward'){
 const current=arenaDefinition(selected);
 return `<details class="arena-picker"><summary aria-label="Выбор арены">${arenaDiagram(current)}${current.name}</summary><div class="arena-options">${Object.values(ARENAS).map(arena=>`<button type="button" data-arena="${arena.id}" aria-pressed="${arena.id===current.id}">${arenaDiagram(arena)}${arena.name}</button>`).join('')}</div></details>`;
}
