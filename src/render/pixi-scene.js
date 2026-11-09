import { fittedCamera } from './camera.js';
import { ctx } from '../game/state.js';
import { CONFIG } from '../config.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { loadTextureImage } from '../assets/preload.js';
import { staticArenaImage } from './pixi-static.js';
import { ArenaPostEffects } from './post-effects.js';
import { victoryGold, goldMatrix } from './victory-glow.js';
import { transformMatrix } from './pixi-math.js';

// The hidden SVG is a scene description for the existing animation code, not a
// second renderer. Only changed nodes are synchronized; atlases become native
// Pixi sprites sharing GPU sources. No per-frame SVG serialization or readback.
export class PixiArena {
  constructor(pixi,app) {
    this.p=pixi;this.app=app;this.records=new Map();this.dirty=new Set();
    this.sources=new Map();this.frames=new Map();this.gradients=new Map();this.owned=new Set();
    this.world=new pixi.Container();this.content=new pixi.Container();
    this.app.stage.eventMode='none';this.app.stage.addChild(this.world);
    this.world.addChild(this.content);
    this.disposed=false;this.svg=ctx.svg;
    this.palette={};
    const css=ctx.svg.ownerDocument.defaultView.getComputedStyle(ctx.svg);
    for(const name of ['--night-bg','--night-light','--night-trail','--foreground','--background','--border','--muted-foreground'])
      this.palette[name]=css.getPropertyValue(name).trim();
    this.defaults={fill:'#26312b',stroke:'none',width:1.3,fontSize:12};
  }
  colour(value,fallback='none') {
    return (value||fallback).replace(/var\((--[\w-]+)(?:,[^)]*)?\)/g,(_,name)=>this.palette[name]||'#b7ada1');
  }
  texture(resource,nearest=true) {
    const texture=new this.p.Texture({source:new this.p.ImageSource({resource,scaleMode:nearest?'nearest':'linear',autoGenerateMipmaps:false})});
    this.owned.add(texture);return texture;
  }
  async prepareSources() {
    const urls=[...Object.entries(ASSETS.textures).filter(([key])=>/^robot|liquids|hat/.test(key)).map(([,file])=>assetUrl(file)),...(ctx.liquidAtlasSources??[])];
    await Promise.all([...new Set(urls.filter(Boolean))].map(async url=>{
      try{this.sources.set(url,this.texture(await loadTextureImage(url)));}catch{/* Vector fallback is already prepared by the game. */}
    }));
  }
  async staticLayer(nodes,options={}) {
    const {canvas,x,y,size}=await staticArenaImage(nodes,options);
    const sprite=new this.p.Sprite(this.texture(canvas,false));
    sprite.position.set(x,y);sprite.width=sprite.height=size;return sprite;
  }
  floorSprite(canvas){const sprite=new this.p.Sprite(this.texture(canvas,false));sprite.width=sprite.height=700;return sprite;}
  replaceFloor(canvas){
    if(!this.floor||this.disposed)return;
    const old=this.floor.texture;this.floor.texture=this.texture(canvas,false);this.floor.width=this.floor.height=700;
    this.owned.delete(old);old.destroy(true);this.render();
  }
  rasterizeRemains(nodes,size=1024){
    if(this.disposed||this.contextLost)throw Error('Renderer unavailable');
    // Synchronize descriptions once, then capture only remains in world coordinates.
    this.render();
    const temporary=new this.p.Container(),moved=[],labels=[];
    try{
      for(const node of nodes){
        const object=this.records.get(node)?.object;if(!object?.parent)continue;
        moved.push({object,parent:object.parent,index:object.parent.getChildIndex(object)});
        for(const label of node.querySelectorAll('.robot-label')){
          const visual=this.records.get(label)?.object;if(visual){labels.push([visual,visual.visible]);visual.visible=false;}
        }
        temporary.addChild(object);
      }
      return this.app.renderer.extract.canvas({target:temporary,frame:new this.p.Rectangle(0,0,700,700),resolution:size/700,clearColor:[0,0,0,0],antialias:false});
    }finally{
      for(const item of [...moved].reverse())item.parent.addChildAt(item.object,Math.min(item.index,item.parent.children.length));
      for(const [object,visible] of labels)object.visible=visible;
      temporary.destroy({children:false});
    }
  }
  async prepare() {
    this.svg=ctx.svg;
    await this.prepareSources();
    // Order agrees with the original scene: lights behind walls, oil below actors,
    // darkness above actors, announcements and impact accents above darkness.
    const [walls,floor,obstacles,night,ambient]=await Promise.all([
      this.staticLayer([ctx.svg.querySelector('#tag7hop-walls'),ctx.outlineG],{outset:ctx.CAMERA_OUTSET}),
      ctx.floorCanvas?Promise.resolve(this.floorSprite(ctx.floorCanvas)):this.staticLayer([ctx.arenaContent.querySelector(':scope > rect'),ctx.svg.querySelector('#tag7hop-floor-decals'),ctx.grid],{pixels:1024}),
      this.staticLayer([ctx.svg.querySelector('#tag7hop-obstacle-lights'),ctx.blockG]),
      this.staticLayer([ctx.darkness],{night:true}),
      this.staticLayer([ctx.ambientGlowG],{forceVisible:true}),
    ]);
    this.world.addChildAt(walls,0);
    this.floor=floor;this.content.addChild(floor);
    this.attachRoot(ctx.conesG,this.content);
    this.content.addChild(obstacles);
    for(const root of [ctx.trailsG,ctx.groundG,ctx.oilG,ctx.detachedG,ctx.actorsG,ctx.sparksG,ctx.pulsesG])this.attachRoot(root,this.content);
    this.nightComposition=new this.p.Container();this.nightComposition.addChild(night);
    this.nightLights=new this.p.Container();this.nightComposition.addChild(this.nightLights);
    this.attachRoot(ctx.lightHoles,this.nightLights);
    this.nightTexture=this.p.RenderTexture.create({width:700,height:700,resolution:2});
    this.owned.add(this.nightTexture);
    this.content.addChild(new this.p.Sprite(this.nightTexture));
    this.ambient=ambient;ambient.blendMode='screen';this.content.addChild(ambient);
    for(const root of [ctx.scoreG,ctx.severFlashG,ctx.hitEffects.group])this.attachRoot(root,this.content);
    this.attachRoot(ctx.timerOutput,this.world);
    const clip=new this.p.Graphics().poly(ctx.arenaBoundary.points.flatMap(p=>[p.x,p.y])).fill('#ffffff');
    this.world.addChild(clip);this.content.mask=clip;
    // Observe detached descriptions too. Reset/removal releases native objects.
    this.observer=new ctx.svg.ownerDocument.defaultView.MutationObserver(records=>this.consume(records));
    this.observer.observe(ctx.svg,{attributes:true,childList:true,characterData:true,subtree:true});
    this.canvas=this.app.canvas;this.canvas.id='tag7hop-pixi';
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('aria-label',ctx.svg.getAttribute('aria-label'));
    this.canvas.style.cssText='display:block;width:100%;height:100%;aspect-ratio:auto;touch-action:manipulation;cursor:pointer';
    this.canvas.onclick=ctx.svg.onclick;
    ctx.svg.after(this.canvas);
    ctx.svg.style.setProperty('display','none','important');
    ctx.svg.setAttribute('aria-hidden','true');
    this.resizeObserver=new ResizeObserver(()=>{this.resize();this.render();});
    this.resizeObserver.observe(ctx.stage);this.resize();
    this.canvas.addEventListener('webglcontextlost',this.onLost=e=>{e.preventDefault();this.contextLost=true;});
    this.canvas.addEventListener('webglcontextrestored',this.onRestored=()=>{this.contextLost=false;this.render();});
    try {this.postEffects=new ArenaPostEffects(this.p,this.app,ctx.root);}catch(error){
      this.app.stage.filters=null;this.postEffectsError=error.message;ctx.root.dataset.postEffects='off';console.warn('Arena post effects unavailable:',error);
    }
    this.suspended=false;
    this.render();
  }
  attachRoot(node,parent) {const record=this.create(node,null);parent.addChild(record.object);return record;}
  create(node,parent) {
    if(this.records.has(node))return this.records.get(node);
    const tag=node.tagName;
    const viewport=tag==='svg'&&node.hasAttribute('viewBox')&&node.querySelector('image');
    const gradient=/url\(#/.test(node.getAttribute('fill')||'');
    let visual=null;
    if(viewport||gradient)visual=new this.p.Sprite(this.p.Texture.EMPTY);
    else if(tag==='text')visual=new this.p.Text({text:'',style:{fontFamily:'Arial',fontSize:12,fill:'#ffffff'},resolution:2});
    else if(['path','circle','ellipse','rect','polygon'].includes(tag))visual=new this.p.Graphics();
    const object=new this.p.Container();if(visual)object.addChild(visual);
    const inherited=parent?.style??this.defaults;
    const record={node,object,visual,viewport,parent,style:{...inherited},children:[],tag};
    this.records.set(node,record);
    this.sync(record);
    if(!visual)this.children(record);
    return record;
  }
  children(record) {
    if(record.visual)return;
    const nodes=[...record.node.children].filter(node=>!['title','defs','filter','radialGradient'].includes(node.tagName));
    const next=nodes.map(node=>this.create(node,record));
    // Reparent without destroying: airborne actors change their stacking order.
    for(const child of record.children)if(!next.includes(child))child.object.removeFromParent();
    record.children=next;
    next.forEach((child,index)=>{
      if(child.object.parent!==record.object)record.object.addChildAt(child.object,index);
      else if(record.object.getChildIndex(child.object)!==index)record.object.setChildIndex(child.object,index);
    });
  }
  consume(mutations) {
    for(const mutation of mutations){
      const node=mutation.target.nodeType===3?mutation.target.parentNode:mutation.target;
      const record=this.records.get(node)||this.records.get(node?.parentNode);
      if(record){this.dirty.add(record);if(mutation.type==='childList')record.structureDirty=true;}
      if(mutation.type==='childList')for(const child of mutation.removedNodes)if(child.nodeType===1&&!ctx.svg.contains(child))this.release(child);
    }
  }
  release(node) {
    const record=this.records.get(node);
    if(record){
      for(const child of [...record.children])this.release(child.node);
      this.dirty.delete(record);this.records.delete(node);
      record.object.destroy({children:true});
    }else for(const child of [...node.children])this.release(child);
  }
  cropped(source,x,y,width,height) {
    const key=[source.uid,x,y,width,height].join(':');
    if(!this.frames.has(key)){
      this.frames.set(key,new this.p.Texture({source:source.source,frame:new this.p.Rectangle(x,y,width,height)}));
    }
    return this.frames.get(key);
  }
  radial(value) {
    const id=value.match(/#([^)'" ]+)/)?.[1];
    const gradient=ctx.svg.querySelector('#'+id);if(!gradient)return this.p.Texture.EMPTY;
    const stops=[...gradient.querySelectorAll('stop')].map(stop=>[
      Number(stop.getAttribute('offset')),this.colour(stop.getAttribute('stop-color'),'#000000'),Number(stop.getAttribute('stop-opacity')??1)]);
    const key=JSON.stringify(stops);
    if(!this.gradients.has(key)){
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const draw=canvas.getContext('2d'),ramp=draw.createRadialGradient(128,128,0,128,128,128);
      for(const [at,colour,alpha] of stops){
        // Canvas understands CSS colours; apply alpha without changing the RGB.
        const sample=document.createElement('canvas');sample.width=sample.height=1;
        const c=sample.getContext('2d');c.fillStyle=colour;c.fillRect(0,0,1,1);
        const rgb=c.getImageData(0,0,1,1).data;
        ramp.addColorStop(at,`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
      }
      draw.fillStyle=ramp;draw.fillRect(0,0,256,256);
      this.gradients.set(key,this.texture(canvas,false));
    }
    return this.gradients.get(key);
  }
  sync(record) {
    const {node,object,visual,tag}=record;
    const number=(name,fallback=0)=>Number(node.getAttribute(name)??fallback);
    object.visible=node.getAttribute('display')!=='none'&&node.style.display!=='none';
    object.alpha=number('opacity',1);
    object.setFromMatrix(new this.p.Matrix(...transformMatrix(node.getAttribute('transform')??'')));
    const s=record.style;
    s.fill=this.colour(node.style.fill||node.getAttribute('fill'),record.parent?.style.fill??'#26312b');
    s.stroke=this.colour(node.style.stroke||node.getAttribute('stroke'),record.parent?.style.stroke??'none');
    s.width=number('stroke-width',record.parent?.style.width??1.3);
    // CSS defaults of the few dynamic roots; descendants inherit them.
    if(node===ctx.actorsG){s.fill='#26312b';s.stroke='#b7ada1';s.width=1.3;}
    if(node===ctx.groundG){s.fill='none';s.stroke='#163448';s.width=1;}
    if(node===ctx.trailsG){s.fill='none';s.stroke='none';}
    if(node===ctx.pulsesG){s.fill='none';s.stroke='#a18d78';s.width=1.2;}
    if(node===ctx.sparksG){s.fill='none';s.stroke='#ff397b';s.width=1.2;}
    if(!visual)return;
    if(record.viewport){
      const image=node.querySelector('image'),source=this.sources.get(image?.getAttribute('href'));
      if(source){
        const [x,y,width,height]=node.getAttribute('viewBox').split(/[\s,]+/).map(Number);
        visual.texture=this.cropped(source,x,y,width,height);
        visual.position.set(number('x'),number('y'));visual.width=number('width');visual.height=number('height');
      }else object.visible=false;
      return;
    }
    const fill=node.style.fill||node.getAttribute('fill')||s.fill;
    if(visual instanceof this.p.Sprite){
      visual.texture=this.radial(fill);visual.anchor.set(.5);
      visual.position.set(number('cx'),number('cy'));
      visual.width=number('rx',number('r'))*2;visual.height=number('ry',number('r'))*2;
      // Erase light holes in a GPU render target instead of an SVG luminance mask.
      visual.blendMode=node.closest('#tag7hop-light-holes')?'erase':'normal';return;
    }
    if(tag==='text'){
      const label=node.classList.contains('robot-label'),timer=node===ctx.timerOutput;
      const size=timer?Math.min(12*716/(ctx.fieldSide||700),24)*1.5:label?12*716/(ctx.fieldSide||700):node.classList.contains('crit-label')?10*716/(ctx.fieldSide||700):12;
      const colour=node.style.fill||node.getAttribute('fill')||(timer?'#ffffff':label?'#d3cead':'#d2d5bf');
      const key=[node.textContent,size,colour,node.getAttribute('textLength')].join('|');
      if(record.textKey!==key){
        record.textKey=key;visual.text=node.textContent;
        visual.style={fontFamily:'Arial',fontSize:size,fontWeight:label||!timer?'700':'500',fill:this.colour(colour),
          ...(label?{stroke:{color:'#26312b',width:3,join:'round'}}:{})};
        visual.scale.set(1);
        const length=number('textLength');if(length&&visual.width>length)visual.scale.x=length/visual.width;
      }
      visual.anchor.set(node.getAttribute('text-anchor')==='middle'?.5:0,timer?.5:.8);
      visual.position.set(number('x'),number('y'));return;
    }
    // Transform-only updates never rebuild vector geometry.
    const geometry=[tag,node.getAttribute('d'),node.getAttribute('points'),number('cx'),number('cy'),number('r'),number('rx'),number('ry'),number('x'),number('y'),number('width'),number('height'),s.fill,s.stroke,s.width,node.getAttribute('fill-opacity'),node.getAttribute('stroke-opacity')].join('|');
    if(geometry===record.geometry)return;record.geometry=geometry;visual.clear();
    if(tag==='path'){const d=node.getAttribute('d');if(!d)return;visual.path(new this.p.GraphicsPath(d));}
    if(tag==='circle')visual.circle(number('cx'),number('cy'),number('r'));
    if(tag==='ellipse')visual.ellipse(number('cx'),number('cy'),number('rx'),number('ry'));
    if(tag==='rect')visual.rect(number('x'),number('y'),number('width'),number('height'));
    if(tag==='polygon')visual.poly((node.getAttribute('points')||'').trim().split(/[\s,]+/).map(Number));
    if(s.fill!=='none')visual.fill({color:s.fill,alpha:number('fill-opacity',1)});
    if(s.stroke!=='none'&&s.width>0)visual.stroke({color:s.stroke,width:s.width,alpha:number('stroke-opacity',1),cap:'round',join:'round'});
  }
  victory() {
    const winner=ctx.combat.finished&&ctx.combat.winner!==null?ctx.robots[ctx.combat.winner]:null;
    if(this.halo&&this.halo.robot!==winner){if(!this.halo.sprite.destroyed)this.halo.sprite.destroy();this.halo.texture.destroy(true);this.halo.filter.destroy();this.halo.gold.destroy();this.halo=null;}
    if(!winner)return;
    if(!this.halo){
      const figure=this.records.get(winner.actor.querySelector('[data-robot-figure]'))?.object,actor=this.records.get(winner.actor)?.object;if(!figure||!actor)return;
      const bounds=figure.getLocalBounds(),range=CONFIG.effects.victoryGlowRangeCm;
      const source=this.app.renderer.generateTexture({target:figure,resolution:2});
      // Inflate the silhouette once (~6 cm) before the blur, just like the old
      // SVG morphology. Thin limbs then have a visible halo instead of fading out.
      const spread=new this.p.Container(),radius=range*.2;
      for(let i=0;i<9;i++){
        const copy=new this.p.Sprite(source),angle=i*Math.PI/4;
        copy.position.set(bounds.x+(i<8?Math.cos(angle)*radius:0),bounds.y+(i<8?Math.sin(angle)*radius:0));
        spread.addChild(copy);
      }
      const inflated=spread.getLocalBounds(),x=inflated.x,y=inflated.y;
      const texture=this.app.renderer.generateTexture({target:spread,resolution:2});
      spread.destroy({children:true});source.destroy(true);
      const sprite=new this.p.Sprite(texture);sprite.position.set(x,y);
      const filter=new this.p.BlurFilter({strength:range*4/15*this.world.scale.x,quality:4});
      filter.padding=(range+10)*this.world.scale.x;
      const gold=new this.p.ColorMatrixFilter();
      // Tinting a sprite before a whitening filter produced a white winner.
      // Colourise the blurred alpha last; keep the original patient above it.
      sprite.filters=[filter,gold];sprite.blendMode='normal';actor.addChildAt(sprite,0);
      this.halo={robot:winner,sprite,texture,filter,gold};
    }
    const colour= victoryGold(Math.max(0,ctx.game.time-(ctx.combat.finishedAt??ctx.game.time)));
    this.halo.gold.matrix=goldMatrix(colour);this.halo.sprite.alpha=colour.opacity;
  }
  resize() {
    const width=ctx.fieldWidth||ctx.fieldSide||700,height=ctx.fieldHeight||ctx.fieldSide||700;
    if(this.width===width&&this.height===height)return;
    this.width=width;this.height=height;this.side=Math.min(width,height);
    this.app.renderer.resize(width,height);
    this.postEffects?.resize(width,height);
    for(const record of this.records.values())if(record.tag==='text')this.dirty.add(record);
  }
  render() {
    if(this.disposed||this.suspended||this.contextLost)return;
    this.consume(this.observer?.takeRecords()??[]);
    for(const record of this.dirty){if(record.node!==ctx.svg&&!ctx.svg.contains(record.node))continue;this.sync(record);if(record.structureDirty){record.structureDirty=false;this.children(record);}}
    this.dirty.clear();this.resize();
    const [x,y,size]=ctx.svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    const camera=fittedCamera(this.width,this.height,x,y,size);
    this.world.scale.set(camera.scale);this.world.position.set(camera.x,camera.y);
    this.ambient.visible=ctx.renderProfile?.name!=='light';
    this.victory();
    this.app.renderer.render({container:this.nightComposition,target:this.nightTexture,clear:true});
    this.postEffects?.update(ctx.game.time);
    try {this.app.render();}catch(error){
      if(!this.postEffects?.enabled)throw error;
      // A shader failure must not turn a working WebGL arena back into SVG.
      this.postEffects.fail(error);this.app.render();ctx.refreshPostEffectsControl?.();
    }
  }
  suspend() {
    this.suspended=true;this.observer?.disconnect();this.resizeObserver?.disconnect();
    if(this.canvas){this.canvas.onclick=null;this.canvas.removeEventListener('webglcontextlost',this.onLost);this.canvas.removeEventListener('webglcontextrestored',this.onRestored);}
    this.canvas?.remove();
    this.svg.style.removeProperty('display');this.svg.removeAttribute('aria-hidden');
  }
  clearScene() {
    if(this.halo){this.halo.texture.destroy(true);this.halo.filter.destroy();this.halo.gold.destroy();}
    this.postEffects?.destroy();
    this.nightComposition?.destroy({children:true});
    this.world.destroy({children:true});
    for(const frame of this.frames.values())frame.destroy(false);
    for(const texture of this.owned)texture.destroy(true);
    this.records.clear();this.dirty.clear();this.sources.clear();this.frames.clear();this.gradients.clear();this.owned.clear();
    this.halo=this.postEffects=this.nightComposition=this.nightLights=this.nightTexture=this.floor=this.ambient=null;
    this.width=this.height=null;
  }
  resetScene() {
    this.clearScene();
    this.world=new this.p.Container();this.content=new this.p.Container();
    this.app.stage.addChild(this.world);this.world.addChild(this.content);
  }
  destroy() {
    if(this.disposed)return;this.disposed=true;this.suspend();this.clearScene();
    this.app.destroy({removeView:true},{children:true});
  }
}

export async function initializePixiArena() {
  const win=ctx.svg.ownerDocument.defaultView;
  if(new URL(win.location.href).searchParams.get('renderer')==='svg')return null;
  // DOM-only tests and older embedded browsers retain the previous renderer.
  if(!win.WebGLRenderingContext&&!win.WebGL2RenderingContext)return null;
  const svg=ctx.svg;
  const pixi=await import('pixi.js');
  // Use Pixi's CSP-compatible uniform sync; keep the site's existing CSP intact.
  await import('pixi.js/unsafe-eval');
  if(ctx.disposed||ctx.svg!==svg)return null;
  const parked=ctx.parkedArenaRenderer;
  ctx.parkedArenaRenderer=null;
  const app=parked?.app??new pixi.Application();let arena=parked;
  try{
    if(parked)parked.resetScene();
    else await app.init({width:ctx.fieldWidth||ctx.fieldSide||700,height:ctx.fieldHeight||ctx.fieldSide||700,preference:'webgl',
      autoStart:false,sharedTicker:false,autoDensity:true,resolution:Math.min(win.devicePixelRatio||1,CONFIG.rendering.maxPixelRatio),
      antialias:true,backgroundAlpha:0,eventMode:'none',powerPreference:'high-performance'});
    arena??=new PixiArena(pixi,app);await arena.prepare();
    if(ctx.disposed||ctx.svg!==svg){arena.destroy();return null;}
    ctx.arenaRenderer=arena;ctx.root.dataset.renderer='pixi-webgl';
    const dispose=ctx.root.__disposeTag;
    ctx.root.__disposeTag=()=>{
      if(ctx.keepArenaRenderer&&!arena.contextLost){arena.suspend();ctx.parkedArenaRenderer=arena;}
      else arena.destroy();
      ctx.arenaRenderer=null;dispose();
    };
    return arena;
  }catch(error){
    if(arena)arena.destroy();else if(app.renderer)app.destroy({removeView:true},{children:true});
    console.warn('PixiJS unavailable; SVG fallback:',error);return null;
  }
}
