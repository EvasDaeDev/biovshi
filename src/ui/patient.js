import {uiIcon} from './icons.js';
import {fighterLabel} from '../game/patients.js';
import {ctx} from '../game/state.js';
import {ROBOT_COLORS} from '../utils/colors.js';
import {statMultiplier,critChance} from '../garage/model.js';
import {prostheticStatSnapshot} from '../garage/prosthetics.js';
export const patientLetter=id=>Number.isInteger(id)&&id>=0&&id<4?'ABCD'[id]:'—';
export const patientName=(id,{short=false}={})=>`<span class="patient-name" style="color:${ROBOT_COLORS[id%4]??'#dff6ff'}">${ctx.mode==='tower'?'':short?'':'Пациент '}${ctx.mode==='tower'?escapeName(fighterLabel(id)):patientLetter(id)}</span>`;
export const SKILLS=[{name:'Скорость',icon:uiIcon('speed')},{name:'Сила',icon:uiIcon('strength')},{name:'Маневренность',icon:uiIcon('mobility')}];
const pointsFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
export const formatSkillPoints=value=>pointsFormat.format(value);
export function skillValue(snapshot,index){
 const points=snapshot.effective[index];
 return `${formatSkillPoints(points)} · ${Math.round((index===1?critChance(points):statMultiplier(points))*100)}%${index===1?' КРИТ':''}`;
}
export function skillHint(snapshot,index){
 const descriptions=['Скорость движения','Шанс критического урона (КРИТ)','Маневренность · скорость поворота'];
 if(!snapshot.count)return descriptions[index];
 const percent=snapshot.modifiers[index]*100;
 const effect=index===1?critChance:statMultiplier;
 const cap=snapshot.effective[index]>=9?'\nДостигнут предел эффекта характеристики.':'';
 return `${SKILLS[index].name}: ${formatSkillPoints(snapshot.base[index])} → ${formatSkillPoints(snapshot.effective[index])}.\nБионические протезы: ${snapshot.count} сегм.\n${percent>0?'+':''}${formatSkillPoints(percent)}% к исходным очкам.\n${descriptions[index]}: ${formatSkillPoints(effect(snapshot.base[index])*100)}% → ${formatSkillPoints(effect(snapshot.effective[index])*100)}%.${cap}`;
}
export function skillHintAttributes(snapshot,index){
 return `class="${snapshot.count?'is-prosthetic':''}" tabindex="${snapshot.count?0:-1}" data-hint-tap data-hint="${escapeName(skillHint(snapshot,index))}"`;
}
export function skillSummary(stats=[3,3,3],prosthetics=[]){
 const snapshot=prostheticStatSnapshot({stats,prosthetics});
 return SKILLS.map((s,i)=>`<span class="skill-summary ${snapshot.count?'is-prosthetic':''}" tabindex="${snapshot.count?0:-1}" data-hint-tap data-hint="${escapeName(skillHint(snapshot,i))}"><span aria-hidden="true">${s.icon}</span> ${formatSkillPoints(snapshot.effective[i])}</span>`).join(' ');
}

const escapeName=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
