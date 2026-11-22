import {listenForBackdropDismissal} from './dialog-backdrop.js';

export function showStartupIntro(root){
 const intro=root.querySelector('#startup-intro');
 const forward=intro.querySelector('[data-paper-dismiss]');
 const launch=root.querySelector('#launch-game');

 function close(){
  if(!intro.open)return;
  if(typeof intro.close==='function')intro.close();
  else intro.removeAttribute('open');
 }
 function dismiss(){
  close();
  root.dataset.introDismissed='';
  launch.focus({preventScroll:true});
 }
 function cancel(event){
  event.preventDefault();
  dismiss();
 }

 forward.onclick=dismiss;
 intro.addEventListener('cancel',cancel);
 const removeBackdropListener=listenForBackdropDismissal(intro,dismiss);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  forward.onclick=null;
  intro.removeEventListener('cancel',cancel);
  removeBackdropListener();
  close();
  dispose();
 };

 if(typeof intro.showModal==='function')intro.showModal();
 else intro.setAttribute('open','');
 intro.querySelector('h2').focus({preventScroll:true});
 intro.scrollTop=0;
}
