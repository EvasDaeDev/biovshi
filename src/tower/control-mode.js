import {storageKey} from '../build-channel.js';
import {ctx} from '../game/state.js';
const STORAGE=storageKey('biovshi.tower-control.v1');
export function loadControlMode(storage=globalThis.localStorage){
  try{return storage?.getItem(STORAGE)==='direction'?'direction':'control';}catch{return 'control';}
}
export function setControlMode(mode){
  ctx.clearTowerInput?.();ctx.clearTowerDestination?.();
  ctx.towerControlMode=mode==='direction'?'direction':'control';
  try{ctx.root.ownerDocument.defaultView.localStorage.setItem(STORAGE,ctx.towerControlMode);}catch{/* Optional persistence. */}
  const stick=ctx.root.querySelector('#tower-stick');
  if(stick)stick.hidden=ctx.towerControlMode==='direction';
}
