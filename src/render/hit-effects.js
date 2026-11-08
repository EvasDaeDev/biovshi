import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';
import { renderProfile } from './performance.js';

const STAR='M-1-9H1V-4H3V-7H5V-5H7V-3H4V-1H9V1H4V3H7V5H5V7H3V4H1V9H-1V4H-3V7H-5V5H-7V3H-4V1H-9V-1H-4V-3H-7V-5H-5V-7H-3V-4H-1Z';
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};

export function hitParticle(seed,index,direction,severed) {
  const n=seed+index*131,angle=direction+(hash(n)-.5)*1.6;
  const speed=(80+hash(n+1)*70)*(severed?1.2:1);
  return {
    vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed-35,
    width:2+Math.floor(hash(n+2)*3),height:1+Math.floor(hash(n+3)*3),
    life:CONFIG.effects.hitLifeSec*(severed?1.35:1)*(.7+.3*hash(n+4)),
    colour:index===0?'#dfb782':['#b51519','#7b090d','#de3031'][Math.floor(hash(n+5)*3)],
  };
}

export function initializeHitEffects() {
  ctx.svg.querySelector('#tag7hop-hit-effects')?.remove();
  const group=el('g',{
    id:'tag7hop-hit-effects','pointer-events':'none',stroke:'none','shape-rendering':'crispEdges',
  },ctx.arenaContent);
  ctx.hitEffects={group,slots:[],serial:0};
}

function allocatePool() {
  const state=ctx.hitEffects;
  if(state.slots.length)return;
  for(let i=0;i<CONFIG.effects.hitPoolLimit;i++) {
    const node=el('g',{display:'none','data-hit-slot':i},state.group);
    const flash=el('g',{},node);
    el('path',{d:STAR,fill:'#d9b47b'},flash);
    el('rect',{x:-2,y:-2,width:4,height:4,fill:'#fff3cf'},flash);
    const particles=Array.from({length:Math.max(CONFIG.effects.hitParticles,CONFIG.effects.severParticles)},()=>
      el('rect',{display:'none'},node));
    node.appendChild(flash);
    state.slots.push({node,flash,particles,effect:null});
  }
}

export function spawnHitEffect(x,y,direction,severed=false) {
  if(!CONFIG.effects.hitEffects||!ctx.hitEffects)return;
  allocatePool();
  const state=ctx.hitEffects,now=ctx.game.time;
  if(!state.slots.length)return;
  const slot=state.slots.find(s=>!s.effect||now-s.effect.born>=s.effect.life)??
    state.slots.reduce((oldest,s)=>s.effect.born<oldest.effect.born?s:oldest);
  const requested=severed?CONFIG.effects.severParticles:CONFIG.effects.hitParticles;
  const count=Math.min(slot.particles.length,renderProfile().name==='light'?Math.ceil(requested/2):requested);
  const seed=(ctx.seed??0)+state.serial++*173;
  slot.effect={born:now,life:CONFIG.effects.hitLifeSec*(severed?1.35:1),severed,
    particles:Array.from({length:count},(_,i)=>hitParticle(seed,i,direction,severed))};
  attr(slot.node,'transform',`translate(${x} ${y})`);
  attr(slot.node,'data-severed',severed);
  attr(slot.node,'display','');
  // Install the first visible frame immediately; later paints advance only cosmetics.
  paintSlot(slot,now);
}

function paintSlot(slot,time) {
  const effect=slot.effect;
  if(!effect)return;
  const age=time-effect.born;
  if(age<0||age>=effect.life){attr(slot.node,'display','none');slot.effect=null;return;}
  const flashLife=CONFIG.effects.hitFlashSec*(effect.severed?1.3:1);
  const flash=age<flashLife;
  attr(slot.flash,'display',flash?'':'none');
  if(flash) {
    attr(slot.flash,'opacity',(1-age/flashLife).toFixed(3));
    attr(slot.flash,'transform','scale('+((effect.severed?1.35:1)*(.9+.3*age/flashLife)).toFixed(3)+')');
  }
  slot.particles.forEach((node,i)=>{
    const p=effect.particles[i],visible=p&&age<p.life;
    attr(node,'display',visible?'':'none');
    if(!visible)return;
    const q=age/p.life,size=1-.35*q;
    attr(node,'x',Math.round(p.vx*age));
    attr(node,'y',Math.round(p.vy*age+180*age*age));
    attr(node,'width',Math.max(1,Math.round(p.width*size)));
    attr(node,'height',Math.max(1,Math.round(p.height*size)));
    attr(node,'fill',p.colour);
    attr(node,'opacity',Math.min(1,(1-q)*4).toFixed(3));
  });
}

export function paintHitEffects() {
  for(const slot of ctx.hitEffects?.slots??[])paintSlot(slot,ctx.game.time);
}

export function resetHitEffects() {
  for(const label of ctx.critLabels??[])label.node.remove();ctx.critLabels=[];
  if(!ctx.hitEffects)return;
  ctx.hitEffects.serial=0;
  for(const slot of ctx.hitEffects.slots){slot.effect=null;attr(slot.node,'display','none');}
}
