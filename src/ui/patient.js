import {fighterLabel} from '../game/patients.js';
import {ctx} from '../game/state.js';
import {ROBOT_COLORS} from '../utils/colors.js';
export const patientLetter=id=>Number.isInteger(id)&&id>=0&&id<4?'ABCD'[id]:'—';
export const patientName=(id,{short=false}={})=>`<span class="patient-name" style="color:${ROBOT_COLORS[id%4]??'#dff6ff'}">${ctx.mode==='tower'?'':short?'':'Пациент '}${ctx.mode==='tower'?escapeName(fighterLabel(id)):patientLetter(id)}</span>`;
export const SKILLS=[{name:'Скорость',icon:'→'},{name:'Сила',icon:'💪'},{name:'Маневренность',icon:'↻'}];
export function skillSummary(stats=[3,3,3]){return SKILLS.map((s,i)=>`<span class="skill-summary" title="${s.name}"><span aria-hidden="true">${s.icon}</span> ${stats[i]}</span>`).join(' ');}

const escapeName=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
