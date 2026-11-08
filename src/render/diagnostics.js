import { savePostEffectsPreference } from './post-effects.js';
import { ctx } from '../game/state.js';

export function timed(name,work) {
  const stats=ctx.diagnostics;
  if(!stats?.enabled)return work();
  const start=performance.now();
  try{return work();}finally{const sample=stats.samples[name]??={ms:0,count:0};sample.ms+=performance.now()-start;sample.count++;}
}
export function initializeDiagnostics() {
  ctx.telemetryEnabled=true;
  const details=document.createElement('section');details.className='render-diagnostics';
  details.innerHTML='<label><input type="checkbox" checked> Телеметрия</label><label class="post-effects-control"><input type="checkbox"> Постэффекты</label><details class="performance-details" open><summary>Диагностика производительности</summary><output></output></details>';
  ctx.root.querySelector('#arena-settings-content').replaceChildren(details);
  const performanceDetails=details.querySelector('.performance-details');
  const [toggle,effects]=details.querySelectorAll('input'),output=details.querySelector('output');
  const refreshEffects=()=>{
    const post=ctx.arenaRenderer?.postEffects;
    effects.checked=Boolean(post?.enabled);effects.disabled=!post?.available;
    effects.title=post?.available?'Резкость, зерно, искажение, цветовое расхождение и виньетка':
      ctx.arenaRenderer?'Постобработка не запустилась: '+(post?.error??ctx.arenaRenderer.postEffectsError??'ошибка фильтра'):'Постэффекты доступны при рендере WebGL';
    effects.closest('label').title=effects.title;
    ctx.root.dataset.postEffects=effects.checked?'on':'off';
  };
  ctx.refreshPostEffectsControl=refreshEffects;refreshEffects();
  effects.onchange=()=>{
    ctx.arenaRenderer?.postEffects?.setEnabled(effects.checked);
    savePostEffectsPreference(effects.checked);
    ctx.arenaRenderer?.render();refreshEffects();
  };
  const panel=ctx.root.querySelector('.tag7hop-sidebar-wrap');
  const setTelemetry=enabled=>{
    ctx.telemetryEnabled=enabled;toggle.checked=enabled;
    panel.style.visibility=enabled?'':'hidden';
    ctx.telemetryDirty=true;
  };
  toggle.onchange=()=>setTelemetry(toggle.checked);
  const query=new URL(ctx.svg.ownerDocument.defaultView.location.href).searchParams;
  setTelemetry(query.get('telemetry')!=='0');
  // Retain the latest active measurements: opening Settings pauses the fight.
  const stats=ctx.diagnostics={enabled:true,samples:{},last:0};
  output.textContent=(ctx.arenaRenderer?'PixiJS · WebGL':'SVG · резервный рендер')+' · замеры появятся во время боя';
  const update=now=>{
    if(!stats.enabled||ctx.paused||ctx.settingsOpen||document.hidden||ctx.startup?.phase!=='running'||now-stats.last<1000)return;
    stats.last=now;
    const value=name=>{const s=stats.samples[name];return s?(s.ms/s.count).toFixed(2):'0.00';};
    output.textContent=`${ctx.arenaRenderer?'PixiJS · WebGL':'SVG · резервный рендер'} | симуляция ${value('simulation')} мс | подготовка ${value('animation')} мс | WebGL ${value('webgl')} мс | карточки ${value('telemetry')} мс`;
    stats.samples={};
  };
  performanceDetails.ontoggle=()=>{stats.enabled=performanceDetails.open;stats.samples={};stats.last=0;};
  ctx.updateDiagnostics=update;
  const dispose=ctx.root.__disposeTag;
  ctx.root.__disposeTag=()=>{details.remove();ctx.diagnostics=null;ctx.updateDiagnostics=null;ctx.telemetryEnabled=true;ctx.refreshPostEffectsControl=null;dispose();delete ctx.root.dataset.postEffects;};
}
