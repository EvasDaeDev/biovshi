export function listenForBackdropDismissal(dialog,dismiss){
 let pressedBackdrop=false;

 function isBackdrop(event){
  // A native dialog retargets pointer events on its backdrop to the dialog.
  if(event.target!==dialog)return false;
  const {left,right,top,bottom}=dialog.getBoundingClientRect();
  return event.clientX<left||event.clientX>=right||event.clientY<top||event.clientY>=bottom;
 }
 function pointerDown(event){
  pressedBackdrop=event.button===0&&isBackdrop(event);
 }
 function pointerCancel(){
  pressedBackdrop=false;
 }
 function click(event){
  const dismissFromBackdrop=pressedBackdrop&&isBackdrop(event);
  pressedBackdrop=false;
  if(dismissFromBackdrop&&dialog.open)dismiss();
 }

 dialog.addEventListener('pointerdown',pointerDown);
 dialog.addEventListener('pointercancel',pointerCancel);
 dialog.addEventListener('click',click);
 return ()=>{
  dialog.removeEventListener('pointerdown',pointerDown);
  dialog.removeEventListener('pointercancel',pointerCancel);
  dialog.removeEventListener('click',click);
 };
}
