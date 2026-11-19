// Consistent landscape navigation: Back is a screen transition; Close belongs
// to native popups and never performs a screen transition.
import {ctx} from '../game/state.js';
import {bettingOpen} from '../betting/ui.js';
import {openMenu} from '../tower/ui.js';

export function initializeGameNavigation(){
 const root=ctx.root,doc=root.ownerDocument;
 const back=root.querySelector('#game-nav-back');
 const nav=root.querySelector('#game-navigation');
 const launch=root.querySelector('#launch-overlay');
 const tower=root.querySelector('#tower-preparation');
 const betting=root.querySelector('#bet-overlay');
 const results=root.querySelector('#gladiator-results');
 let screen='menu';
 const resolve=()=>{
  if(ctx.settingsOpen)return screen;
  if(!launch.hidden)return 'menu';
  if(!tower.hidden)return 'tower';
  if(!betting.hidden)return betting.dataset.view==='garage'?'garage':
   betting.querySelector('#bet-setup-form')?'setup':'betting';
  if(!results.hidden)return 'results';
  return 'arena';
 };
 const update=()=>{
  screen=resolve();
  back.hidden=screen==='menu'||screen==='arena';
  back.setAttribute('aria-label',screen==='garage'?'Назад к ставкам':
   screen==='tower'?'Назад в главное меню':
   screen==='setup'?'Назад на предыдущий экран':
   screen==='betting'?'Назад в главное меню':'Назад');
  nav.dataset.screen=screen;
 };
 back.onclick=()=>{
  if(ctx.settingsOpen||back.hidden)return;
  if(root.querySelector('#tower-module-replacement[open],#tower-upgrade-window[open],.betting-input-dialog[open]'))return;
  const current=resolve();
  if(current==='garage'){bettingOpen();return;}
  if(current==='setup'){
   if(ctx.afterSetup==='menu'||!ctx.betting){openMenu();return;}
   bettingOpen();return;
  }
  if(current==='betting'||current==='tower'||current==='results')openMenu();
 };
 const observer=new doc.defaultView.MutationObserver(update);
 for(const node of [launch,tower,betting,results]){
  if(node)observer.observe(node,{attributes:true,attributeFilter:['hidden','data-view']});
 }
 observer.observe(root.querySelector('#bet-content'),{childList:true});
 const key=event=>{
  if(event.key!=='Escape'||event.defaultPrevented||ctx.settingsOpen)return;
  if(doc.querySelector('dialog[open]'))return;
  if(resolve()!=='garage')return;
  event.preventDefault();back.click();
 };
 doc.addEventListener('keydown',key);
 update();
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  observer.disconnect();doc.removeEventListener('keydown',key);
  back.onclick=null;dispose();
 };
 return {update};
}
