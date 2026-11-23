import {ctx} from '../game/state.js';

export function initializeBattleGestures(){
 const {root}=ctx,doc=root.ownerDocument;
 // Safari can send native pinch events even when the canvas uses touch-action.
 // Leave the Pointer Events used by the joystick and taps untouched.
 const preventZoom=event=>{
  if(!event.cancelable||root.inert||ctx.settingsOpen||ctx.orientationBlocked||
    ctx.tutorial?.active||ctx.resultsPanel.hidden===false)return;
  if(ctx.startup.phase==='running'||ctx.startup.phase==='spawning')event.preventDefault();
 };
 const types=['gesturestart','gesturechange'];
 for(const type of types)doc.addEventListener(type,preventZoom,{capture:true,passive:false});
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  for(const type of types)doc.removeEventListener(type,preventZoom,true);
  dispose();
 };
}
