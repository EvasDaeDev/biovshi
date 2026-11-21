export function showStartupWelcome(root){
 const welcome=root.querySelector('#startup-welcome'),intro=root.querySelector('#startup-intro');
 const read=root.querySelector('#startup-read-intro'),launch=root.querySelector('#launch-game');
 const dialogs=[welcome,intro];
 const dismissButtons=dialogs.map(dialog=>dialog.querySelector('[data-startup-dismiss]'));

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
  for(const dialog of dialogs)close(dialog);
  launch.focus({preventScroll:true});
 }
 function cancel(event){
  event.preventDefault();
  dismiss();
 }

 read.onclick=()=>{
  close(welcome);
  open(intro,intro.querySelector('h2'));
 };
 for(const button of dismissButtons)button.onclick=dismiss;
 for(const dialog of dialogs)dialog.addEventListener('cancel',cancel);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  read.onclick=null;
  for(const button of dismissButtons)button.onclick=null;
  for(const dialog of dialogs){
   dialog.removeEventListener('cancel',cancel);
   close(dialog);
  }
  dispose();
 };
 open(welcome,read);
}
