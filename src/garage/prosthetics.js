import {CONFIG} from '../config.js';
import {BASE_STATS,normalizeProsthetics} from './model.js';

// Saved builds contain all installed prostheses. In battle only attached parts count.
export function prostheticStatSnapshot(patient,robot=null){
 const base=[...(patient?.stats??BASE_STATS)];
 const installed=normalizeProsthetics(robot?.prosthetics??patient?.prosthetics);
 const missing=new Set(robot?.missingSegments??[]);
 const count=robot?.hasHead===false?0:installed.filter(key=>!missing.has(key)).length;
 const {speedPerSegment,strengthPerSegment,maneuverPerSegment}=CONFIG.prosthetics;
 const modifiers=[speedPerSegment,strengthPerSegment,maneuverPerSegment].map(value=>value*count);
 return {base,count,modifiers,effective:base.map((value,index)=>value*(1+modifiers[index]))};
}
