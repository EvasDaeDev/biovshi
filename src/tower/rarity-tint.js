// Pure visual-only rarity palette; no gameplay dependencies.
const COLOURS=[null,'#60a95b','#4b94d2','#9b6acd','#e5a44b','#d84a3e'];
export function towerRarityMatrix(rank){
 const colour=COLOURS[rank];if(!colour)return null;
 const channels=[1,3,5].map(at=>parseInt(colour.slice(at,at+2),16)/255*.2);
 return [.8,0,0,0,channels[0],0,.8,0,0,channels[1],0,0,.8,0,channels[2],0,0,0,1,0];
}
