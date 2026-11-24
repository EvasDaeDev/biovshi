// Consistent landscape navigation: Back is a screen transition; Close belongs
// to native popups and never performs a screen transition.
import {ctx} from '../game/state.js';
import {bettingOpen,bettingSetup,bettingReadDraft} from '../betting/ui.js';
import {garageOpen} from '../garage/ui.js';
import {openMenu} from '../tower/ui.js';

export function initializeGameNavigation(){
 const root=ctx.root,doc=root.ownerDocument;
 const back=root.querySelector('#game-nav-back');
 const nav=root.querySelector('#game-navigation');
 const settings=root.querySelector('#game-nav-settings');
 const toolbar=root.querySelector('.atmosphere-controls');
 const launch=root.querySelector('#launch-overlay');
 const tower=root.querySelector('#tower-preparation');
 const betting=root.querySelector('#bet-overlay');
 const results=root.querySelector('#gladiator-results');
 let screen='menu',previousScreens=[],suppressNext=null;
 const resolve=()=>{
  if(ctx.settingsOpen)return screen;
  if(!launch.hidden)return 'menu';
  if(!tower.hidden)return 'tower';
  if(!betting.hidden)return betting.dataset.view==='garage'?'garage':
   betting.querySelector('#bet-setup-form')?'setup':'betting';
  if(!results.hidden)return 'results';
  return 'arena';
 };
 const previousFor=current=>{
  // Arena and final results are not reversible view transitions.
  if(current==='tower'||current==='results')return 'menu';
  const last=previousScreens.at(-1);
  if(current==='garage'&&['betting','setup'].includes(last))return last;
  if(current==='betting'&&['garage','setup'].includes(last))return last;
  if(current==='setup'&&['betting','garage'].includes(last))return last;
  return 'menu';
 };
 const update=()=>{
  const next=resolve();
  if(next!==screen){
   if(next===suppressNext)suppressNext=null;
   else if(next==='menu'||next==='arena'||next==='results')previousScreens=[];
   else if(!['arena','results'].includes(screen)&&previousScreens.at(-1)!==screen)
    previousScreens.push(screen);
   if(previousScreens.length>12)previousScreens=previousScreens.slice(-12);
   screen=next;
  }
  const target=previousFor(screen);
  back.hidden=screen==='menu'||screen==='arena';
  back.setAttribute('aria-label',target==='menu'?'Назад в главное меню':
   target==='betting'?'Назад к ставкам':
   target==='garage'?'Назад в процедурную':'Назад к созданию игры');
  nav.dataset.screen=screen;
  const settingsHost=screen==='arena'?toolbar:nav;
  if(settings.parentElement!==settingsHost)settingsHost.append(settings);
  syncNativeBack();
 };
 const protectedDialog='.paper-dialog[open],#game-action-confirm[open],#tower-module-replacement[open],#tower-upgrade-window[open],.betting-input-dialog[open],#tower-cycle-notice[open]';
 const nativeBackDialogs='.paper-dialog[open],#game-action-confirm[open],#tower-module-replacement[open],#tower-upgrade-window[open],.betting-input-dialog[open],#game-tutorial[open]';
 const syncNativeBack=()=>ctx.platform?.setBackAvailable?.(
  ctx.settingsOpen||!back.hidden||Boolean(root.querySelector(nativeBackDialogs))
 );

 back.onclick=()=>{
  update(); // MutationObserver may not have processed the last screen change yet.
  if(ctx.settingsOpen||back.hidden||root.querySelector(protectedDialog))return;
  const current=resolve(),destination=previousFor(current);
  // Keep any partially edited bet slip before opening a different screen.
  if(current==='betting'&&betting.querySelector('#bet-stakes-form')){
   ctx.betDraft={session:ctx.betting,round:ctx.betting.round,
    bets:bettingReadDraft(),arenaId:ctx.selectedArenaId};
  }
  const popped=destination!=='menu'?previousScreens.pop():null;
  suppressNext=destination;
  if(destination==='betting'){bettingOpen();}
  else if(destination==='garage'){garageOpen();}
  else if(destination==='setup'){bettingSetup();}
  else if(!openMenu()){
   suppressNext=null;
   if(popped)previousScreens.push(popped);
   return;
  }
  update();
 };
 // Telegram owns the system Back gesture. Always unwind the topmost popup
 // before navigating the underlying screen; the 30-floor cycle notice is
 // mandatory and must be acknowledged with its own Continue action.
 const telegramBack=()=>{
  // The loading overlay belongs to document.body, outside the scaled root.
  // Never let native Back navigate the game under a pending loading screen.
  const loading=doc.querySelector('#texture-loading[aria-busy]');
  if(loading){loading.querySelector('.loading-dismiss:not([hidden])')?.click();return;}
  if(doc.getElementById('battle-transition'))return;
  if(root.querySelector('#landscape-required[open],#tower-cycle-notice[open]'))return;
  if(root.querySelector('#game-action-confirm[open]')){root.querySelector('#game-action-confirm-close,.game-action-confirm-close')?.click();return;}
  const paperDialog=root.querySelector('.paper-dialog[open]');
  if(paperDialog){paperDialog.querySelector('[data-paper-dismiss]').click();return;}
  if(root.querySelector('#game-tutorial[open]')){root.querySelector('#game-tutorial .tutorial-skip')?.click();return;}
  if(root.querySelector('#tower-module-replacement[open]')){root.querySelector('.tower-replacement-close')?.click();return;}
  if(root.querySelector('.betting-input-dialog[open]')){root.querySelector('.betting-input-dialog [data-cancel]')?.click();return;}
  if(ctx.settingsOpen){root.querySelector('#arena-settings-close')?.click();return;}
  if(root.querySelector('#tower-upgrade-window[open]')){root.querySelector('#tower-upgrade-window .tower-upgrade-close')?.click();return;}
  back.click();
 };
 root.addEventListener('telegram-game-back',telegramBack);
 const observer=new doc.defaultView.MutationObserver(records=>{
  if(records.some(record=>record.attributeName==='open'))syncNativeBack();
  update();
 });
 for(const node of [launch,tower,betting,results]){
  if(node)observer.observe(node,{attributes:true,attributeFilter:['hidden','data-view']});
 }
 observer.observe(root.querySelector('#bet-content'),{childList:true});
 observer.observe(root,{subtree:true,attributes:true,attributeFilter:['open']});
 observer.observe(root.querySelector('#arena-settings'),{attributes:true,attributeFilter:['hidden']});
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
  root.removeEventListener('telegram-game-back',telegramBack);
  ctx.platform?.setBackAvailable?.(false);
  if(settings.parentElement!==nav)nav.append(settings);
  back.onclick=null;dispose();
 };
 return {update};
}
