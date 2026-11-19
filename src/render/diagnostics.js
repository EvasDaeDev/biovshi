import { savePostEffectsPreference } from './post-effects.js';
import { ctx } from '../game/state.js';

export function timed(name,work) {
  return work();
}
export function initializeDiagnostics() {
  ctx.telemetryEnabled=true;
  const details=document.createElement('section');details.className='render-diagnostics';
  details.innerHTML='<label class="post-effects-control"><input type="checkbox"> Постэффекты</label><p class="post-effects-note" role="status"></p>';
  ctx.root.querySelector('#arena-settings-content').replaceChildren(details);
  const effects=details.querySelector('.post-effects-control input');
  const refreshEffects=()=>{
    const post=ctx.arenaRenderer?.postEffects;
    effects.checked=Boolean(post?.enabled);effects.disabled=!post?.available;
    effects.title=post?.available?'Резкость, зерно, искажение, цветовое расхождение и виньетка':
      ctx.arenaRenderer?'Постобработка не запустилась: '+(post?.error??ctx.arenaRenderer.postEffectsError??'ошибка фильтра'):'Постэффекты доступны при рендере WebGL';
    effects.closest('label').title=effects.title;
    details.querySelector('.post-effects-note').textContent=effects.disabled?effects.title:'';
    ctx.root.dataset.postEffects=effects.checked?'on':'off';
  };
  ctx.refreshPostEffectsControl=refreshEffects;refreshEffects();
  effects.onchange=()=>{
    ctx.arenaRenderer?.postEffects?.setEnabled(effects.checked);
    savePostEffectsPreference(effects.checked);
    ctx.arenaRenderer?.render();refreshEffects();
  };
  // Patient cards are essential combat HUD and are no longer optional.
  // Ignore old ?telemetry=0 links and clear any stale hidden-card styling.
  ctx.telemetryEnabled=true;
  ctx.root.classList.remove('cards-hidden');
  ctx.root.querySelector('.tag7hop-sidebar-wrap').style.removeProperty('visibility');
  ctx.telemetryDirty=true;
  ctx.diagnostics=null;ctx.updateDiagnostics=null;
  const dispose=ctx.root.__disposeTag;
  ctx.root.__disposeTag=()=>{details.remove();ctx.diagnostics=null;ctx.updateDiagnostics=null;ctx.telemetryEnabled=true;ctx.refreshPostEffectsControl=null;dispose();delete ctx.root.dataset.postEffects;ctx.root.classList.remove('cards-hidden');};
}
