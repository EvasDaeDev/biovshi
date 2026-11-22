import {storageKey} from '../build-channel.js';
import {towerCycleInfo} from '../tower/cycles.js';
import {hasBoss} from '../boss/config.js';
export const TUTORIAL_STORAGE=storageKey('biovshi.tutorial.v1');
export const freshTutorial=()=>({version:1,enabled:true,completed:[],steps:{},seen:{}});
const validSteps=value=>Object.fromEntries(Object.entries(value&&typeof value==='object'?value:{}).filter(([,n])=>Number.isInteger(n)&&n>=0));
export function readTutorial(storage){
 try{
  const value=JSON.parse(storage?.getItem(TUTORIAL_STORAGE));
  if(value?.version!==1||typeof value.enabled!=='boolean'||!Array.isArray(value.completed)||!value.steps||typeof value.steps!=='object')return freshTutorial();
  return {version:1,enabled:value.enabled,completed:value.completed.filter(v=>typeof v==='string'),steps:validSteps(value.steps),seen:validSteps(value.seen)};
 }catch{return freshTutorial();}
}
export function writeTutorial(storage,state){try{storage?.setItem(TUTORIAL_STORAGE,JSON.stringify(state));}catch{/* Optional local persistence. */}}

export function tutorialChapter(c,{ignoreBlocked=false}={}){
 const root=c.root,visible=id=>{const node=root.querySelector(id);return node&&!node.hidden;};
 if(!ignoreBlocked&&(c.settingsOpen||c.orientationBlocked||root.inert||root.querySelector('.paper-dialog[open], #tower-cycle-notice[open], #game-action-confirm[open], #tower-module-replacement[open]')))return null;
 if(visible('#launch-overlay'))return 'menu';
 if(visible('#tower-preparation')){
  if(visible('#tower-upgrade-window[open]'))return 'tower-shelter';
  const run=c.betting?.towers?.[c.towerPlayer]??c.towerRun;
  if(run&&hasBoss(run))return 'tower-boss-ready';
  if(run&&towerCycleInfo(run.level).floor>=19)return 'tower-late';
  return 'tower-ready';
 }
 if(visible('#bet-overlay')){
  if(root.querySelector('#bet-setup-form'))return 'setup';
  return c.betOverlay.dataset.view==='garage'?'garage':'betting';
 }
 if(visible('#gladiator-results')){
  if(c.mode!=='tower')return 'betting-results';
  return root.querySelector('.tower-segment-reward')?'tower-loot':'tower-results';
 }
 if(c.startup.phase==='running'&&!c.combat.finished){
  if(c.mode!=='tower')return 'spectator';
  return c.towerRun&&hasBoss(c.towerRun)?'tower-boss':'tower';
 }
 return null;
}

const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
// Coordinates are viewport CSS pixels, outside the game's zoomed root.
export function tutorialPlacement(bounds,size,target,obstacles=[]){
 const pad=10,width=Math.min(size.width,Math.max(1,bounds.width-pad*2)),height=Math.min(size.height,Math.max(1,bounds.height-pad*2));
 const candidates=['bottom-right','bottom-left','top-right','top-left'].map(corner=>({
  corner,x:bounds.x+(corner.endsWith('right')?bounds.width-width-pad:pad),
  y:bounds.y+(corner.startsWith('bottom')?bounds.height-height-pad:pad),width,height
 }));
 const score=box=>overlap(box,target)*100+obstacles.reduce((sum,o)=>sum+overlap(box,o),0);
 return candidates.reduce((best,box)=>score(box)<score(best)?box:best);
}
