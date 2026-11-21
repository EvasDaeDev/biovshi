import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {arenaCapacity,arenaDefinition,arenaPicker,emergencyArena,loadLocations,randomArenaId} from '../src/game/arenas.js';
import {locationPassages,mirrorModes,mirroredObjects,parseLocation,wallPoints} from '../src/game/location-geometry.js';
import {ensureTowerFloorPlan,validTowerFloorPlan} from '../src/tower/floors.js';
import {newTower,normalizeTower} from '../src/tower/model.js';
import {copyRuntimeAssets} from '../scripts/runtime-assets.mjs';

const blank=(id='custom')=>({id,name:'Новая арена',version:1,size:700,capacity:6,minPassage:120,objects:[]});
const box=(x,y,width,height)=>({kind:'obstacle',points:[[x,y],[x+width,y],[x+width,y+height],[x,y+height]]});
const base='https://example.test/biovshi/test/locations/';
const manifest=active=>({version:1,active});
const fetchFrom=(files,requests=[])=>async (url,{cache})=>{
 assert.equal(url.href,base+url.pathname.split('/').at(-1));
 assert.equal(cache,'no-store');
 const filename=url.pathname.split('/').at(-1);
 requests.push(filename);
 const value=files[filename];
 return value===undefined?{ok:false,status:404}:{ok:true,json:async()=>structuredClone(value)};
};
test('each reflection can be enabled alone and two axes create four unique copies',()=>{
 const original=box(100,150,40,60);
 const bounds=(objects)=>objects.map(({points})=>[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))]);
 for(const [x,y,expected] of [
  [false,false,[[100,150]]],[true,false,[[100,150],[560,150]]],
  [false,true,[[100,150],[100,490]]],[true,true,[[100,150],[560,150],[100,490],[560,490]]],
 ]){
  const objects=mirroredObjects(original,700,mirrorModes(x,y));
  assert.deepEqual(bounds(objects),expected);
  assert.doesNotThrow(()=>parseLocation({...blank(),objects}));
 }
 assert.equal(mirroredObjects(box(300,325,100,50),700,mirrorModes(true,true)).length,1);
});
test('passage uses shortest geometric distances for walls, obstacles and the boundary',()=>{
 const wall={kind:'wall',points:wallPoints([20,200],[160,200],20)};
 const map={...blank(),objects:[wall,box(230,240,100,60),box(560,450,40,40)]};
 const gaps=locationPassages(parseLocation(map).location);
 assert.equal(gaps[0].width,20);
 assert.equal(gaps[0].second,null);
 const gap=gaps.find(g=>g.first===1&&g.second===0);
 assert.ok(Math.abs(gap.width-Math.hypot(70,30))<1e-7);
 assert.deepEqual(gap.from,[230,240]);
 assert.deepEqual(gap.to,[160,210]);
 const attached={...blank(),objects:[box(15,0,35,100),box(50,0,35,100)]};
 assert.equal(locationPassages(attached).some(g=>g.first===1&&g.second===0),false);
 assert.equal(locationPassages(attached)[0].width,15);
});
test('JSON import round-trips valid geometry and rejects invalid figures and obstructed starts',()=>{
 const input={...blank(),objects:[box(100,150,40,60)]};
 const once=parseLocation(input);
 assert.deepEqual(parseLocation(JSON.parse(JSON.stringify(once.location))),once);
 assert.equal(once.spawns.length,4);
 assert.equal(once.patrol.length,6);
 assert.throws(()=>parseLocation({...input,objects:[box(-20,100,30,30)]}),/координат/);
 const corners=input.objects[0].points;
 assert.throws(()=>parseLocation({...input,objects:[{kind:'obstacle',points:[corners[0],corners[2],corners[1],corners[3]]}]}),/пересекаться/);
 assert.deepEqual(parseLocation({...input,objects:[{kind:'obstacle',points:corners.toReversed()}]}).location.objects,input.objects);
 assert.throws(()=>parseLocation({...input,spawns:[[120,170],[350,60],[350,640],[640,350]]}),/Стартовым/);
});
test('object pivot survives export and reflects with its geometry',()=>{
 const object={...box(100,150,40,60),pivot:[110,140]};
 const objects=mirroredObjects(object,{width:700,height:500},mirrorModes(true,true));
 assert.deepEqual(objects.map(o=>o.pivot),[[110,140],[590,140],[110,360],[590,360]]);
 const parsed=parseLocation({...blank(),width:700,height:500,objects}).location;
 assert.deepEqual(JSON.parse(JSON.stringify(parsed)).objects,objects);
});
test('role-specific spawn points round-trip and reject overlaps or obstructed points',()=>{
 const map={...blank(),objects:[box(320,320,60,60)],towerSpawns:{player:[180,150],opponents:[[500,160],[520,520]]}};
 const parsed=parseLocation(map).location;
 assert.deepEqual(parsed.towerSpawns,map.towerSpawns);
 assert.deepEqual(parseLocation(JSON.parse(JSON.stringify(parsed))).location,parsed);
 assert.throws(()=>parseLocation({...map,towerSpawns:{player:[10,10]}}),/Точкам старта Башни/);
 assert.throws(()=>parseLocation({...map,towerSpawns:{player:[180,150],opponents:[[185,150]]}}),/Точкам старта Башни/);
 assert.throws(()=>parseLocation({...map,towerSpawns:{opponents:[[340,350]]}}),/Точкам старта Башни/);
});
test('launch refresh follows active IDs, skips missing and malformed files and ignores stale catalogs',async()=>{
 const files={'active.json':manifest(['custom','missing','broken','../ward','custom','another']),
  'custom.json':{...blank(),name:'<b>Локация</b>'},'broken.json':{...blank('broken'),capacity:11},
  'another.json':blank('another')};
 const requests=[],warnings=[];
 const options={fetcher:fetchFrom(files,requests),warn:(...args)=>warnings.push(args)};
 const loaded=await loadLocations(base,options);
 assert.deepEqual(Object.keys(loaded),['custom','another']);
 assert.deepEqual(requests,['active.json','custom.json','missing.json','broken.json','another.json']);
 assert.equal(warnings.length,3);
 assert.equal(randomArenaId(.1),'custom');
 assert.equal(randomArenaId(.9),'another');
 assert.match(arenaPicker(),/&lt;b&gt;Локация&lt;\/b&gt;/);
 assert.equal(arenaCapacity('custom'),6);
 files['active.json']=manifest(['another']);
 assert.deepEqual(Object.keys(await loadLocations(base,options)),['another']);
 assert.equal(arenaDefinition('custom').id,'another');
 files['active.json']=manifest([]);
 assert.deepEqual(Object.keys(await loadLocations(base,options)),[emergencyArena.id]);
});
test('Tower preserves the encounter and DMS checkpoint if an active arena is removed',async()=>{
 const run=newTower(0);
 run.level=12;run.wins=11;
 const original=ensureTowerFloorPlan(run,()=>.2);
 run.arenaRerolls=2;run.rewarded=[1];run.insurance.checkpoint={level:12,floorPlan:structuredClone(original)};
 const before=structuredClone(original);
 const files={'active.json':manifest(['tiny','new-map']),
  'tiny.json':{...blank('tiny'),capacity:2},'new-map.json':{...blank('new-map'),capacity:10}};
 const options={fetcher:fetchFrom(files),warn:()=>{}};
 await loadLocations(base,options);
 normalizeTower(run);
 for(const plan of [run.floorPlan,run.insurance.checkpoint.floorPlan]){
  assert.equal(validTowerFloorPlan(plan,run.level),true);
  assert.deepEqual(plan.options,before.options.map(o=>({...o,arenaId:'new-map'})));
 }
 assert.equal(run.arenaRerolls,2);
 assert.deepEqual(run.rewarded,[1]);
 files['active.json']=manifest(['tiny']);
 await loadLocations(base,options);
 normalizeTower(run);
 assert.equal(run.floorPlan.options[0].arenaId,emergencyArena.id);
 assert.equal(validTowerFloorPlan(run.floorPlan,run.level),true);
 const boss={level:5};
 assert.equal(ensureTowerFloorPlan(boss,()=>.2).options[0].arenaId,emergencyArena.id);
 files['active.json']=manifest(['tiny','new-map']);
 await loadLocations(base,options);
 normalizeTower(run);
 assert.equal(run.floorPlan.options[0].arenaId,'new-map');
 assert.equal(ensureTowerFloorPlan({level:5},()=>.2).options[0].arenaId,'new-map');
});
test('build copies the active list and its location files',async()=>{
 const work=await fs.mkdtemp(fileURLToPath(new URL('../node_modules/.biovshi-locations-',import.meta.url)));
 try{
  const source=path.join(work,'public'),output=path.join(work,'dist');
  await fs.mkdir(path.join(source,'locations'),{recursive:true});
  const files={'active.json':manifest(['enabled','missing','../off']),'enabled.json':blank('enabled'),'off.json':blank('off')};
  await Promise.all(Object.entries(files).map(([file,data])=>fs.writeFile(path.join(source,'locations',file),JSON.stringify(data))));
  const warnings=[];
  await copyRuntimeAssets(source,output,{warn:message=>warnings.push(message)});
  assert.deepEqual((await fs.readdir(path.join(output,'locations'))).sort(),['active.json','enabled.json']);
  assert.ok(warnings.some(message=>message.includes('locations/missing.json')));
 }finally{await fs.rm(work,{recursive:true,force:true});}
});
