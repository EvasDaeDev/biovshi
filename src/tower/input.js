import {ctx} from '../game/state.js';
import {CONFIG} from '../config.js';
export function towerMovementActive(id){
  const input=ctx.towerInput??{};
  return ctx.mode==='tower'&&id===0&&Math.max(Math.hypot(input.x??0,input.y??0),Math.abs(input.drive??0),Math.abs(input.turn??0))>.12;
}
export function controlledIntent(robot){
  const input=ctx.towerInput??{};
  if(input.drive!==undefined){
    const drive=input.drive,turn=input.turn??0;
    return {manual:true,manualDrive:drive,manualTurn:turn,mode:drive||turn?'управляется':'ожидает команды',
      speed:Math.abs(drive)*CONFIG.movement.chaseSpeedCm,
      goal:{x:robot.x+Math.cos(robot.angle)*80,y:robot.y+Math.sin(robot.angle)*80},lookPoint:null,brake:drive===0};
  }
  const {x=0,y=0}=ctx.towerInput??{},length=Math.hypot(x,y),moving=length>.12;
  return {manual:true,mode:moving?'управляется':'ожидает команды',speed:moving?CONFIG.movement.chaseSpeedCm*Math.min(1,length):0,
    goal:moving?{x:robot.x+x/length*80,y:robot.y+y/length*80}:{x:robot.x,y:robot.y},
    lookPoint:null,brake:!moving};
}
export function installTowerInput(){
  const keys=new Set(),doc=ctx.root.ownerDocument,win=doc.defaultView;
  ctx.towerInput={x:0,y:0};
  const stick=doc.getElementById('tower-stick'),knob=stick.querySelector('span');let pointer=null;
  const active=()=>ctx.startup.phase==='running'&&!ctx.paused&&!ctx.settingsOpen&&!ctx.orientationBlocked&&!ctx.combat.finished;
  const reset=()=>{keys.clear();pointer=null;ctx.towerInput={x:0,y:0};knob.style.transform='translate(0px,0px)';};
  const update=()=>{ctx.towerInput={drive:Number(keys.has('ArrowUp')||keys.has('KeyW'))-Number(keys.has('ArrowDown')||keys.has('KeyS')),turn:Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'))};};
  const key=e=>{
    if(e.type==='keyup'&&keys.has(e.code)){keys.delete(e.code);update();return;}
    if(!['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.type==='keyup'){keys.delete(e.code);update();return;}
    if(!active())return;e.preventDefault();keys.add(e.code);update();
  };
  const move=e=>{if(e.pointerId!==pointer||!active())return;const b=stick.getBoundingClientRect(),dx=(e.clientX-b.left-b.width/2)/(b.width*.35),dy=(e.clientY-b.top-b.height/2)/(b.height*.35),n=Math.max(1,Math.hypot(dx,dy));ctx.towerInput={x:dx/n,y:dy/n};knob.style.transform=`translate(${dx/n*30}px,${dy/n*30}px)`;};
  stick.onpointerdown=e=>{if(!active())return;pointer=e.pointerId;stick.setPointerCapture(pointer);move(e);};
  stick.onpointermove=move;stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=reset;
  doc.addEventListener('keydown',key);doc.addEventListener('keyup',key);win.addEventListener('blur',reset);doc.addEventListener('visibilitychange',reset);
  const dispose=ctx.root.__disposeTag;ctx.root.__disposeTag=()=>{reset();doc.removeEventListener('keydown',key);doc.removeEventListener('keyup',key);win.removeEventListener('blur',reset);doc.removeEventListener('visibilitychange',reset);stick.onpointerdown=stick.onpointermove=stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=null;dispose();};
  ctx.clearTowerInput=reset;
}
