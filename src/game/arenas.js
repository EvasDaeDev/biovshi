import {trackResource} from '../assets/resource-status.js';
import {CONFIG} from '../config.js';
import ward from '../../public/locations/ward.json' with {type:'json'};
import ring from '../../public/locations/ring.json' with {type:'json'};
import annulus from '../../public/locations/annulus.json' with {type:'json'};
import sluice from '../../public/locations/sluice.json' with {type:'json'};
import zigzag from '../../public/locations/zigzag.json' with {type:'json'};
import columns from '../../public/locations/columns.json' with {type:'json'};
import throat from '../../public/locations/throat.json' with {type:'json'};
import {convexParts,locationBoundary,locationDimensions,parseLocation,validLocationId} from './location-geometry.js';

function buildArena(raw,id){
 const {location,spawns,patrol}=parseLocation(raw,{id,spawnMargin:CONFIG.startup.spawnMarginCm});
 const {name,capacity}=location,{width,height}=locationDimensions(location);
 const size=Math.max(width,height),left=(700-width)/2,top=(700-height)/2;
 const toWorld=([x,y])=>({x:x+left,y:y+top});
 return {id,name,size,width,height,left,top,capacity,points:locationBoundary(location).map(toWorld),
  obstacles:location.objects.map(({kind,points})=>{
   const polygon=vertices=>{
    const world=vertices.map(toWorld);
    return {points:world,left:Math.min(...world.map(p=>p.x)),right:Math.max(...world.map(p=>p.x)),
     top:Math.min(...world.map(p=>p.y)),bottom:Math.max(...world.map(p=>p.y))};
   };
   const parts=convexParts(points);
   return {kind,...polygon(points),...(parts.length>1?{parts:parts.map(polygon)}:{})};
  }),
  spawnPoints:spawns.map(toWorld),patrolPoints:patrol.map(toWorld),
  ...(location.towerSpawns?{towerSpawns:{
   player:location.towerSpawns.player?toWorld(location.towerSpawns.player):null,
   opponents:(location.towerSpawns.opponents??[]).map(toWorld),
  }}:{})};
}
const defaults=Object.fromEntries([ward,ring,annulus,sluice,zigzag,columns,throat].map(raw=>[raw.id,buildArena(raw,raw.id)]));
export const TOWER_ARENA_CAPACITY=Object.freeze(Object.fromEntries(Object.values(defaults).map(a=>[a.id,a.capacity])));
export const emergencyArena={...defaults.ward,id:'fallback-ward'};
export let ARENAS=Object.freeze(Object.assign(Object.create(null),defaults));

export async function loadLocations(base,{fetcher=fetch,warn=console.warn}={}){
 if(new URL(base).protocol==='file:')return ARENAS;
 const read=(file,validate)=>trackResource(String(new URL(file,base)),async()=>{
  const response=await fetcher(new URL(file,base),{cache:'no-store',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error(file+' · HTTP '+response.status);
  return validate(await response.json());
 });
 const active=Object.create(null);
 try{
  const manifest=await read('active.json',data=>{
   if(data?.version!==1||!Array.isArray(data.active)||data.active.length>128)
    throw Error('Некорректный список активных локаций.');
   return data;
  });
  const ids=[...new Set(manifest.active)].filter(id=>{
   if(validLocationId(id))return true;
   warn('Пропущен недопустимый идентификатор локации.',id);
   return false;
  });
  const entries=await Promise.allSettled(ids.map(async id=>read(id+'.json',data=>buildArena(data,id))));
  for(const [i,result] of entries.entries()){
   if(result.status==='fulfilled')active[ids[i]]=result.value;
   else warn('Локация '+ids[i]+' пропущена.',result.reason);
  }
  if(!Object.keys(active).length){
   warn('Нет доступных активных локаций. Используется резервная Операционная.');
   active[emergencyArena.id]=emergencyArena;
  }
 }catch(error){
  warn('Используются встроенные локации.',error);
  Object.assign(active,defaults);
 }
 ARENAS=Object.freeze(active);
 return ARENAS;
}
export const randomArenaId=(value=Math.random())=>suitableArenaId(0,value);
export function suitableArenaId(minimum,value=Math.random()){
 const ids=Object.keys(ARENAS).filter(id=>ARENAS[id].capacity>=minimum);
 if(!ids.length)return emergencyArena.id;
 return ids[Math.min(ids.length-1,Math.max(0,Math.floor(value*ids.length)))];
}
export const arenaDefinition=id=>ARENAS[id]??(id===emergencyArena.id?emergencyArena:ARENAS.ward??Object.values(ARENAS)[0]);
export const hasArena=id=>typeof id==='string'&&(Object.hasOwn(ARENAS,id)||id===emergencyArena.id);
export const arenaCapacity=id=>hasArena(id)?arenaDefinition(id).capacity:0;
export function arenaDiagram(arena){
 const {width,height,size,left,top}=arena;
 const project=p=>`${(p.x-left+(size-width)/2)/size*100},${(p.y-top+(size-height)/2)/size*100}`;
 const obstacles=arena.obstacles.map(b=>`<polygon class="arena-obstacle" points="${b.points.map(project).join(' ')}"/>`).join('');
 return `<svg viewBox="-5 -5 110 110" aria-hidden="true"><polygon points="${arena.points.map(project).join(' ')}"/>${obstacles}</svg>`;
}
const safeName=name=>name.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export function arenaPicker(selected='ward'){
 const current=arenaDefinition(selected);
 return `<details class="arena-picker"><summary aria-label="Выбор арены">${arenaDiagram(current)}${safeName(current.name)}</summary><div class="arena-options">${Object.values(ARENAS).map(arena=>`<button type="button" data-arena="${arena.id}" aria-pressed="${arena.id===current.id}">${arenaDiagram(arena)}${safeName(arena.name)}</button>`).join('')}</div></details>`;
}
