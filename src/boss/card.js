import {ctx} from '../game/state.js';
import {patientName} from '../ui/patient.js';
import {skinMatrix} from '../render/robot-skin.js';
import {ik} from '../utils/math.js';
import {limbKey} from '../robot/body.js';
const boneCache=new Map();
export function bossPortraitBones(body){
 const id=body.variant.id;
 if(boneCache.has(id))return boneCache.get(id);
 const bones=[];
 for(const l of body.limbs){
  const index=l.anchor??(l.kind==='arm'?0:body.spineSegments);
  const a={x:-index*10+(l.kind==='arm'?3:-5),y:l.side*(l.kind==='arm'?15:12)};
  const end={x:-index*10+(l.kind==='arm'?30:-28),y:l.side*(l.anchor===undefined?(l.kind==='arm'?27:31):(l.kind==='arm'?35:40))};
  const pose=ik(a,end,...(l.kind==='arm'?[27,29]:[32,33]),l.kind==='arm'?l.side:-l.side);
  bones.push({key:limbKey(l)+'-upper',a,b:pose.joint},{key:limbKey(l)+'-lower',a:pose.joint,b:pose.end});
 }
 for(let i=body.spineSegments-1;i>=0;i--)bones.push({key:'spine-'+i,a:{x:-i*10,y:0},b:{x:-(i+1)*10,y:0}});
 bones.push({key:'head',a:{x:15,y:0},b:{x:35,y:0}});
 const result=bones.map(bone=>({...bone,part:body.skinParts[bone.key],matrix:skinMatrix(bone.a,bone.b,body.skinParts[bone.key])}));
 boneCache.set(id,result);return result;
}
export function paintBossCard(card,robot){
 if(card.card.dataset.boss!=='true'){
  card.card.dataset.boss='true';
  card.card.querySelector('.robot-card-name strong').innerHTML=patientName(robot.id,{short:true});
  for(const node of [card.strength,card.speed,card.maneuver]){
   node.innerHTML='<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="fill:currentColor;image-rendering:pixelated"><path d="M4 1h8v1h2v2h1v6h-2v2h-2v3H5v-3H3v-2H1V4h1V2h2zM3 5v4h4V5zm6 0v4h4V5zM7 10v2h2v-2zM6 13v2h1v-2zm3 0v2h1v-2z" fill-rule="evenodd"/></svg>';
   const field=node.parentElement;field.dataset.hint='Параметры босса неизвестны';field.setAttribute('aria-label','Параметры босса неизвестны');field.classList.remove('is-prosthetic');
  }
 }
 card.trauma.hidden=true;
}
export function bossAction(robot){
 if(!robot.visible)return 'Ожидает выхода на арену';
 if(!robot.mobile)return robot.knockoutCause==='blood-loss'?'Уничтожен · потеря крови':'Уничтожен';
 const deadline=ctx.combat.unarmedDeadline[robot.id];
 if(deadline!==null)return `Теряет кровь · ${Math.ceil(Math.max(0,deadline-ctx.game.time))} с`;
 return null;
}
