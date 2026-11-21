export function showStartupWelcome(root){
 const welcome=root.querySelector('#startup-welcome'),intro=root.querySelector('#startup-intro');
 const read=root.querySelector('#startup-read-intro'),launch=root.querySelector('#launch-game');
 const dialogs=[welcome,intro];
 const dismissButtons=dialogs.map(dialog=>dialog.querySelector('[data-startup-dismiss]'));
 let pressedBackdrop=false;

 function open(dialog,focus){
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  focus.focus({preventScroll:true});
  dialog.scrollTop=0;
 }
 function close(dialog){
  if(!dialog.open)return;
  if(typeof dialog.close==='function')dialog.close();
  else dialog.removeAttribute('open');
 }
 function dismiss(){
  pressedBackdrop=false;
  for(const dialog of dialogs)close(dialog);
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

 read.onclick=()=>{
  close(welcome);
  open(intro,intro.querySelector('h2'));
 };
 for(const button of dismissButtons)button.onclick=dismiss;
 for(const dialog of dialogs)dialog.addEventListener('cancel',cancel);
 intro.addEventListener('pointerdown',onIntroPointerDown);
 intro.addEventListener('click',onIntroClick);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  read.onclick=null;
  intro.removeEventListener('pointerdown',onIntroPointerDown);
  intro.removeEventListener('click',onIntroClick);
  for(const button of dismissButtons)button.onclick=null;
  for(const dialog of dialogs){
   dialog.removeEventListener('cancel',cancel);
   close(dialog);
  }
  dispose();
 };
 open(welcome,read);
}
