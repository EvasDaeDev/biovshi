// Keep absolute floor IDs in storage. Only labels and base stat arithmetic
// use cycle-local progress. Excel-style letters never stop at Z.
export function towerCycleInfo(level){
 const index=Math.floor((level-1)/30),floor=(level-1)%30+1;
 let n=index,label='';
 while(n>0){n--;label=String.fromCharCode(65+n%26)+label;n=Math.floor(n/26);}
 return {index,floor,label,display:label?`${label}-${String(floor).padStart(2,'0')}`:String(floor)};
}
export const towerFloorLabel=level=>towerCycleInfo(level).display;
export const towerCycleWins=level=>(Math.max(1,level)-1)%30;
export const towerCycleTitle=index=>index===1?'СГОВОР':index===2?'ТРАВЛЯ':index===3?'ОРГАНИЗОВАННАЯ ПРЕСТУПНОСТЬ':'СМЕШАННЫЕ ПОКАЗАНИЯ';
