import {ROBOT_COLORS} from '../utils/colors.js';
export const patientLetter=id=>Number.isInteger(id)&&id>=0&&id<4?'ABCD'[id]:'—';
export const patientName=(id,{short=false}={})=>`<span class="patient-name" style="color:${ROBOT_COLORS[id]??'#dff6ff'}">${short?'':'Пациент '}${patientLetter(id)}</span>`;
export const SKILLS=[{name:'Скорость',icon:'→'},{name:'Сила',icon:'💪'},{name:'Маневренность',icon:'↻'}];
export function skillSummary(stats=[3,3,3]){return SKILLS.map((s,i)=>`<span class="skill-summary" title="${s.name}"><span aria-hidden="true">${s.icon}</span> ${stats[i]}</span>`).join(' ');}
