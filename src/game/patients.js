import {ctx} from './state.js';
export const patientGarage=()=>ctx.mode==='tower'?ctx.towerGarage:ctx.betting?.garage;
export const patientSkin=id=>ctx.mode==='tower'&&id===0?ctx.towerRun.patient:id%4;
export const fighterLabel=id=>ctx.mode==='tower'?(id===0?ctx.betting.players[ctx.towerPlayer].name:`ИИ ${id}`):String.fromCharCode(65+id);
