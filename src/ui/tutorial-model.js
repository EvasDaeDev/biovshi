import {storageKey} from '../build-channel.js';
export const TUTORIAL_STORAGE=storageKey('biovshi.tutorial.v1');
export const freshTutorial=()=>({version:1,enabled:true,completed:[],steps:{}});
export function readTutorial(storage){
 try{
  const value=JSON.parse(storage?.getItem(TUTORIAL_STORAGE));
  if(value?.version!==1||typeof value.enabled!=='boolean'||!Array.isArray(value.completed)||!value.steps||typeof value.steps!=='object')return freshTutorial();
  return {version:1,enabled:value.enabled,completed:value.completed.filter(v=>typeof v==='string'),steps:Object.fromEntries(Object.entries(value.steps).filter(([,n])=>Number.isInteger(n)&&n>=0))};
 }catch{return freshTutorial();}
}
export function writeTutorial(storage,state){try{storage?.setItem(TUTORIAL_STORAGE,JSON.stringify(state));}catch{/* Optional local persistence. */}}

export function tutorialChapter(c,{ignoreBlocked=false}={}){
 const root=c.root,visible=id=>{const node=root.querySelector(id);return node&&!node.hidden;};
 if(!ignoreBlocked&&(c.settingsOpen||c.orientationBlocked||root.inert))return null;
 if(visible('#launch-overlay'))return 'menu';
 if(visible('#tower-preparation'))return 'tower-ready';
 if(visible('#bet-overlay')){
  if(root.querySelector('#bet-setup-form'))return 'setup';
  return c.betOverlay.dataset.view==='garage'?'garage':'betting';
 }
 if(visible('#gladiator-results'))return c.mode==='tower'?'tower-results':'betting-results';
 if(c.startup.phase==='running'&&!c.combat.finished)return c.mode==='tower'?'tower':'spectator';
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
