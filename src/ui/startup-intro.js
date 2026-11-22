export function showStartupIntro(root){
 const intro=root.querySelector('#startup-intro');
 const forward=intro.querySelector('[data-paper-dismiss]');
 const launch=root.querySelector('#launch-game');
 let pressedBackdrop=false;

 function close(){
  if(!intro.open)return;
  if(typeof intro.close==='function')intro.close();
  else intro.removeAttribute('open');
 }
 function dismiss(){
  pressedBackdrop=false;
  close();
  launch.focus({preventScroll:true});
 }
 function cancel(event){
  event.preventDefault();
  dismiss();
 }
 function isIntroBackdrop(event){
  // Native dialogs retarget backdrop clicks to the dialog itself.
  if(event.target!==intro)return false;
  const {left,right,top,bottom}=intro.getBoundingClientRect();
  return event.clientX<left||event.clientX>=right||event.clientY<top||event.clientY>=bottom;
 }
 function onIntroPointerDown(event){
  pressedBackdrop=event.button===0&&isIntroBackdrop(event);
 }
 function onIntroClick(event){
  const dismissFromBackdrop=pressedBackdrop&&isIntroBackdrop(event);
  pressedBackdrop=false;
  if(dismissFromBackdrop)dismiss();
 }

 forward.onclick=dismiss;
 intro.addEventListener('cancel',cancel);
 intro.addEventListener('pointerdown',onIntroPointerDown);
 intro.addEventListener('click',onIntroClick);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  forward.onclick=null;
  intro.removeEventListener('cancel',cancel);
  intro.removeEventListener('pointerdown',onIntroPointerDown);
  intro.removeEventListener('click',onIntroClick);
  close();
  dispose();
 };

 if(typeof intro.showModal==='function')intro.showModal();
 else intro.setAttribute('open','');
 intro.querySelector('h2').focus({preventScroll:true});
 intro.scrollTop=0;
}
