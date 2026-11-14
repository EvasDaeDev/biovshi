import {screenRect} from '../ui/geometry.js';
import {fittedCamera} from '../render/camera.js';
import {planPath} from '../systems/navigation.js';
import {coreClearCircle} from '../systems/collision.js';
import {ctx} from '../game/state.js';
import {CONFIG} from '../config.js';
// Extra clearance lets the rig turn at path corners without clipping its limbs.
const navigationPadding=()=>140*ctx.scale;
export function controlledIntent(robot){
  if(ctx.towerControlMode==='direction'){
    const goal=ctx.towerDestination;
    const moving=Boolean(goal&&Math.hypot(goal.x-robot.x,goal.y-robot.y)>8);
    if(goal&&!moving)goal.arrived=true;
    return {manual:true,navigate:true,navigationPadding:navigationPadding(),mode:moving?'идёт к точке':'удерживает позицию',
      speed:moving?CONFIG.movement.chaseSpeedCm:0,goal:goal?{x:goal.x,y:goal.y}:{x:robot.x,y:robot.y},lookPoint:null,brake:!moving};
  }
  const {x=0,y=0}=ctx.towerInput??{},length=Math.hypot(x,y),moving=length>.12;
  return {manual:true,mode:moving?'управляется':'ожидает команды',speed:moving?CONFIG.movement.chaseSpeedCm*Math.min(1,length):0,
    goal:moving?{x:robot.x+x/length*80,y:robot.y+y/length*80}:{x:robot.x,y:robot.y},
    lookPoint:null,brake:!moving};
}
export function installTowerInput(){
  const keys=new Set(),doc=ctx.root.ownerDocument,win=doc.defaultView;
  ctx.towerInput={x:0,y:0};ctx.towerDestination=null;
  const stick=doc.getElementById('tower-stick'),knob=stick.querySelector('span');let pointer=null;
  stick.hidden=ctx.towerControlMode==='direction';
  const marker=doc.createElement('div');marker.id='tower-direction-marker';marker.hidden=true;marker.setAttribute('aria-hidden','true');ctx.stage.append(marker);
  const clearDestination=()=>{ctx.towerDestination=null;marker.hidden=true;const robot=ctx.robots[0];robot?.cancelNavigation();};
  ctx.clearTowerDestination=clearDestination;
  const active=()=>ctx.mode==='tower'&&ctx.startup.phase==='running'&&!ctx.paused&&!ctx.settingsOpen&&!ctx.orientationBlocked&&!ctx.tutorial?.active&&!ctx.combat.finished;
  const reset=()=>{
    const captured=pointer;pointer=null;keys.clear();ctx.towerInput={x:0,y:0};knob.style.transform='translate(0px,0px)';
    if(captured!==null&&stick.hasPointerCapture?.(captured))stick.releasePointerCapture(captured);
  };
  const update=()=>{ctx.towerInput={x:Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA')),y:Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'))};};
  const key=e=>{
    if(e.type==='keyup'&&keys.has(e.code)){keys.delete(e.code);update();return;}
    if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.type==='keyup'){keys.delete(e.code);update();return;}
    if(!active()||ctx.towerControlMode==='direction')return;e.preventDefault();keys.add(e.code);update();
  };
  const move=e=>{if(e.pointerId!==pointer||!active()||ctx.towerControlMode==='direction')return;const b=screenRect(stick),dx=(e.clientX-b.left-b.width/2)/(b.width*.35),dy=(e.clientY-b.top-b.height/2)/(b.height*.35),n=Math.max(1,Math.hypot(dx,dy));ctx.towerInput={x:dx/n,y:dy/n};knob.style.transform=`translate(${dx/n*45}px,${dy/n*45}px)`;};
  // The first finger owns the stick until release. Other fingers remain free
  // to operate UI controls; their release/cancel events must not stop movement.
  stick.onpointerdown=e=>{
    if(pointer!==null||!active()||ctx.towerControlMode==='direction'||e.button!==0)return;
    e.preventDefault();pointer=e.pointerId;stick.setPointerCapture(pointer);move(e);
  };
  const release=e=>{if(e.pointerId===pointer)reset();};
  stick.onpointermove=move;stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=release;
  const click=event=>{
    if(ctx.towerControlMode!=='direction'||!active()||event.button!==0||!['svg','canvas'].includes(event.target.tagName.toLowerCase())&&!event.target.closest('svg'))return;
    const surface=ctx.arenaRenderer?.canvas??ctx.svg;
    const point=arenaPoint(event,surface);
    if(!point)return;
    const destination=ctx.towerDestination;
    const bounds=screenRect(surface),camera=currentProjection();
    const touchRadius=12*ctx.fieldWidth/bounds.width/camera.scale;
    if(destination&&!destination.arrived&&Math.hypot(point.x-destination.x,point.y-destination.y)<=Math.max(10*ctx.scale,touchRadius)){
      clearDestination();return;
    }
    const robot=ctx.robots[0];
    if(!coreClearCircle(point,24*ctx.scale))return;
    const route=planPath(robot,point,navigationPadding());
    const goal=route.at(-1);
    if(!goal||Math.hypot(goal.x-robot.x,goal.y-robot.y)<4&&Math.hypot(point.x-robot.x,point.y-robot.y)>8)return;
    clearDestination();ctx.towerDestination={x:goal.x,y:goal.y,arrived:false};
    paintMarker();
  };
  const paintMarker=()=>{
    const goal=ctx.towerDestination;
    marker.hidden=ctx.towerControlMode!=='direction'||!goal||goal.arrived||ctx.combat.finished;
    if(marker.hidden)return;
    const projection=currentProjection(),diameter=20*ctx.scale*projection.scale;
    marker.style.left=(goal.x*projection.scale+projection.x)+'px';
    marker.style.top=(goal.y*projection.scale+projection.y)+'px';
    marker.style.width=marker.style.height=diameter+'px';
  };
  ctx.paintTowerMarker=paintMarker;ctx.stage.addEventListener('click',click);
  doc.addEventListener('keydown',key);doc.addEventListener('keyup',key);win.addEventListener('blur',reset);doc.addEventListener('visibilitychange',reset);
  const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{reset();clearDestination();marker.remove();ctx.stage.removeEventListener('click',click);ctx.paintTowerMarker=null;ctx.clearTowerDestination=null;ctx.clearTowerInput=null;doc.removeEventListener('keydown',key);doc.removeEventListener('keyup',key);win.removeEventListener('blur',reset);doc.removeEventListener('visibilitychange',reset);stick.onpointerdown=stick.onpointermove=stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=null;dispose();};
  ctx.clearTowerInput=reset;
}

function currentProjection(){
  const [x,y,size]=ctx.svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
  return fittedCamera(ctx.fieldWidth,ctx.fieldHeight,x,y,size);
}
export function arenaPoint(event,surface){
  const bounds=screenRect(surface);
  if(!bounds.width||!bounds.height)return null;
  const camera=currentProjection();
  return {x:((event.clientX-bounds.left)*ctx.fieldWidth/bounds.width-camera.x)/camera.scale,
    y:((event.clientY-bounds.top)*ctx.fieldHeight/bounds.height-camera.y)/camera.scale};
}
