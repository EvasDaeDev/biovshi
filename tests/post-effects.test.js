import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {Container,RenderLayer,UniformGroup,Rectangle,Filter,DOMAdapter} from 'pixi.js';
import {CONFIG} from '../src/config.js';
import {ctx} from '../src/game/state.js';
import {ArenaPostEffects,POST_EFFECTS_STORAGE,POST_VERTEX,POST_FRAGMENT,postEffectUniforms,
  readPostEffectsPreference,savePostEffectsPreference,validatePostShader,filmExposure} from '../src/render/post-effects.js';
import {initializeDiagnostics} from '../src/render/diagnostics.js';
import {PixiArena} from '../src/render/pixi-scene.js';

function setup(){
  const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://effects.test/'});
  globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
  globalThis.matchMedia=()=>({matches:false});
  ctx.root=document.getElementById('robot-tag-hops-v22');ctx.svg=document.getElementById('tag7hop-field');
  ctx.info=document.getElementById('tag7hop-info');ctx.game={time:8};ctx.seed=314159;ctx.paused=true;
  ctx.fieldSide=700;ctx.renderProfile={name:'full'};ctx.combat={finished:false};ctx.arenaRenderer=null;
  ctx.root.__disposeTag=()=>{};
  return dom;
}
function engine(){
  const filters=[];
  const p={Container,RenderLayer,UniformGroup,Rectangle,Filter:{from(options){
    const filter={...options,enabled:true,glProgram:options.gl,destroy(){this.destroyed=true;}};
    filters.push(filter);return filter;
  }}};
  const app={stage:new Container(),screen:{width:700,height:700},renderer:{resolution:2,resize(){},render(){}},render(){}};
  return {p,app,filters};
}

test('film look preserves the calibrated optics and one-pass texture budget',()=>{
  const u=postEffectUniforms();
  assert.equal(CONFIG.postEffects.unsharpAmount,.8);assert.equal(CONFIG.postEffects.unsharpRadiusPx,1);
  assert.equal(CONFIG.postEffects.filmGrain,.7);assert.equal(CONFIG.postEffects.distortion,-7);
   assert.ok(Math.abs(u.uLook[3]-.0126)<1e-7,'film grain uniform is half of the former 1.4 intensity');
  assert.equal(CONFIG.postEffects.redCyan,-35);assert.equal(CONFIG.postEffects.blueYellow,29);
  assert.equal(CONFIG.postEffects.vignetteAmount,-76);assert.equal(CONFIG.postEffects.vignetteMidpoint,50);
  assert.ok(Math.abs(u.uOptics[0]-.0175)<1e-7);
  assert.ok(u.uOptics[1]<0&&u.uOptics[2]>0,'opposite fringes');
  assert.equal(u.uOptics[3],960);assert.ok(Math.abs(u.uVignette[0]-.76)<1e-7);
  assert.equal(u.uVignette[1],.5);
  assert.equal([...POST_FRAGMENT.matchAll(/\bsampleArena\(/g)].length-1,11,'fixed texture-read budget');
  assert.ok(POST_VERTEX.includes('uOutputFrame.zw * uInputSize.zw'),'pooled texture padding is accounted for');
  assert.ok(POST_FRAGMENT.includes('vScreenCoord * 2.0 - 1.0'),'lens and vignette stay anchored to the screen');
});

test('one filter covers the entire arena viewport, keeps Retina resolution and is fully bypassed when disabled',()=>{
  const dom=setup(),{p,app,filters}=engine(),scene=new Container(),labels=new RenderLayer();app.stage.addChild(scene,labels);
  const post=new ArenaPostEffects(p,app,ctx.root,scene),seed=ctx.seed;
  assert.equal(filters.length,1);assert.deepEqual(scene.filters,[post.filter]);
  assert.ok(!app.stage.filters?.length,'the filter does not affect the text layer');
  assert.equal(post.filter.resolution,2);assert.equal(post.filter.padding,0);
  assert.deepEqual([scene.filterArea.x,scene.filterArea.y,scene.filterArea.width,scene.filterArea.height],[0,0,700,700]);
  post.resize(375,375);assert.equal(scene.filterArea.width,375);
  post.update(8.5);assert.equal(post.uniforms.uniforms.uGrainTime,102);
  const exposure=post.uniforms.uniforms.uExposure;
  assert.equal(exposure,filmExposure(8.5));post.update(8.5);
  assert.equal(post.uniforms.uniforms.uExposure,exposure,'paused time freezes exposure');
  const uniforms=post.uniforms,filter=post.filter;
  post.setEnabled(false);post.update(9);
  assert.equal(scene.filters,null);assert.equal(scene.filterArea,null);
  assert.equal(post.uniforms.uniforms.uGrainTime,102,'disabled effects perform no uniform animation');
  assert.equal(post.uniforms.uniforms.uExposure,exposure);
  for(let i=0;i<100;i++){post.setEnabled(true);post.setEnabled(false);}
  post.setEnabled(true);assert.equal(filters.length,1);assert.equal(post.filter,filter);assert.equal(post.uniforms,uniforms);
  assert.deepEqual(app.stage.children,[scene,labels]);assert.equal(ctx.seed,seed);
  post.destroy();post.destroy();assert.equal(filter.destroyed,true);assert.equal(scene.filters,null);
  app.stage.destroy({children:true});dom.window.close();
});

test('post effect preference persists and blocked storage does not block startup',()=>{
  const dom=setup();assert.equal(readPostEffectsPreference(),true);
  savePostEffectsPreference(false);assert.equal(localStorage.getItem(POST_EFFECTS_STORAGE),'off');
  const {p,app}=engine(),post=new ArenaPostEffects(p,app,ctx.root);
  assert.equal(post.enabled,false);assert.equal(app.stage.filters,null);
  savePostEffectsPreference(true);assert.equal(readPostEffectsPreference(),true);
  const storage=globalThis.localStorage;globalThis.localStorage={getItem(){throw new Error('blocked');},setItem(){throw new Error('blocked');}};
  assert.equal(readPostEffectsPreference(),CONFIG.postEffects.enabled);assert.doesNotThrow(()=>savePostEffectsPreference(false));
  globalThis.localStorage=storage;post.destroy();app.stage.destroy({children:true});dom.window.close();
});

test('post-effects switch works on pause while patient cards remain visible and game time unchanged',()=>{
  const dom=setup(),{p,app,filters}=engine(),post=new ArenaPostEffects(p,app,ctx.root);let renders=0;
  ctx.arenaRenderer={postEffects:post,render(){renders++;}};
  initializeDiagnostics();
  const controls=document.querySelectorAll('.render-diagnostics input');
  assert.equal(controls.length,1,'patient cards do not have a visibility switch');
  const effects=controls[0];
  assert.ok(effects.closest('label').classList.contains('post-effects-control'));
  assert.equal(effects.checked,true);assert.equal(effects.disabled,false);
  const cards=document.getElementById('tag7hop-roles').outerHTML;
  const game=JSON.stringify(ctx.game),seed=ctx.seed;
  effects.checked=false;effects.dispatchEvent(new dom.window.Event('change'));
  assert.equal(app.stage.filters,null);assert.equal(ctx.root.dataset.postEffects,'off');
  assert.equal(localStorage.getItem(POST_EFFECTS_STORAGE),'off');assert.equal(renders,1);
  assert.equal(ctx.telemetryEnabled,true);
  assert.equal(ctx.root.querySelector('.tag7hop-sidebar-wrap').style.visibility,'');
  effects.checked=true;effects.dispatchEvent(new dom.window.Event('change'));
  assert.equal(post.enabled,true);assert.equal(filters.length,1);assert.equal(renders,2);
  assert.equal(JSON.stringify(ctx.game),game);assert.equal(ctx.seed,seed);assert.equal(ctx.paused,true);
  assert.equal(document.getElementById('tag7hop-roles').outerHTML,cards);
  ctx.root.__disposeTag();post.destroy();ctx.arenaRenderer=null;app.stage.destroy({children:true});dom.window.close();
});

test('a failed post pass is bypassed without discarding the WebGL arena; reduced motion freezes grain',()=>{
  const dom=setup(),{p,app}=engine();globalThis.matchMedia=()=>({matches:true});
  const arena=new PixiArena(p,app);arena.ambient=new Container();arena.nightComposition=new Container();
  arena.postEffects=new ArenaPostEffects(p,app,ctx.root,arena.scene);
  arena.postEffects.update(100);assert.equal(arena.postEffects.uniforms.uniforms.uGrainTime,0);assert.equal(arena.postEffects.uniforms.uniforms.uExposure,1);
  let renders=0,refreshes=0;
  app.render=()=>{renders++;if(arena.scene.filters)throw new Error('shader failure');};
  ctx.refreshPostEffectsControl=()=>{refreshes++;};const warning=console.warn;console.warn=()=>{};
  try{arena.render();}finally{console.warn=warning;}
  assert.equal(renders,2);assert.equal(refreshes,1);assert.equal(arena.postEffects.available,false);
  assert.equal(arena.scene.filters,null);assert.equal(ctx.root.dataset.postEffects,'off');
  arena.postEffects.setEnabled(true);assert.equal(arena.postEffects.enabled,false);
  arena.postEffects.destroy();arena.nightComposition.destroy();app.stage.destroy({children:true});
  ctx.refreshPostEffectsControl=null;dom.window.close();
});

test('one-time device shader validation frees its temporary resources on success and failure',()=>{
  for(const failure of [null,'compile','link']){
    const shaders=[],programs=[],deletedShaders=[],deletedPrograms=[];
    const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,
      createShader(type){const shader={type};shaders.push(shader);return shader;},shaderSource(){},compileShader(){},
      getShaderParameter(shader){return !(failure==='compile'&&shader.type===2);},getShaderInfoLog(){return 'bad shader';},
      createProgram(){const program={};programs.push(program);return program;},attachShader(){},linkProgram(){},
      getProgramParameter(){return failure!=='link';},getProgramInfoLog(){return 'bad link';},
      deleteShader(shader){deletedShaders.push(shader);},deleteProgram(program){deletedPrograms.push(program);}};
    if(failure)assert.throws(()=>validatePostShader(gl,{vertex:POST_VERTEX,fragment:POST_FRAGMENT}));
    else validatePostShader(gl,{vertex:POST_VERTEX,fragment:POST_FRAGMENT});
    assert.deepEqual(deletedShaders,shaders);assert.deepEqual(deletedPrograms,programs);
  }
});


test('real Pixi filter preparation keeps shared uniform precision identical across shader stages',()=>{
  const dom=setup(),adapter=DOMAdapter.get();
  DOMAdapter.set({...adapter,createCanvas:()=>({getContext:()=>({
    getShaderPrecisionFormat:()=>({precision:23}),isContextLost:()=>false,
  })})});
  const {app}=engine();let post;
  try {
    // Use the actual Filter.from and GlProgram preprocessors, not the filter mock.
    post=new ArenaPostEffects({Container,UniformGroup,Rectangle,Filter},app,ctx.root);
    assert.equal(post.available,true);assert.equal(post.enabled,true);
    const {vertex,fragment}=post.filter.glProgram;
    assert.match(fragment,/precision highp float/,'grain needs highp where the device supports it');
    const uniforms=source=>{
      const precision=source.match(/precision (highp|mediump|lowp) float/)[1];
      return new Map([...source.matchAll(/uniform\s+(?:(highp|mediump|lowp)\s+)?(\w+)\s+(\w+)\s*;/g)]
        .map(([,qualifier,type,name])=>[name,{type,precision:qualifier??precision}]));
    };
    const a=uniforms(vertex),b=uniforms(fragment);let shared=0;
    for(const [name,value] of a)if(b.has(name)){shared++;assert.deepEqual(b.get(name),value,name+' must link in GLSL ES');}
    assert.equal(shared,2);
    assert.match(fragment,/#define texture texture2D/,'verify the GLSL ES version actually used by Pixi');
  } finally {
    post?.destroy();app.stage.destroy({children:true});DOMAdapter.set(adapter);dom.window.close();
  }
});

test('exposure wanders smoothly inside its bound and is deterministic without combat randomness',()=>{
 const seed=ctx.seed;
 let previous=filmExposure(0),low=previous,high=previous;
 for(let i=1;i<6000;i++){
  const time=i/60,value=filmExposure(time);
  assert.ok(Math.abs(value-1)<=CONFIG.postEffects.exposureDrift);
  assert.ok(Math.abs(value-previous)<.0005,'no abrupt frame-to-frame flicker');
  assert.equal(value,filmExposure(time));
  low=Math.min(low,value);high=Math.max(high,value);previous=value;
 }
 assert.ok(high-low>.004);assert.equal(ctx.seed,seed);assert.equal(filmExposure(10,0),1);
});
