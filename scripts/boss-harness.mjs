import {newArtifactCollection} from '../src/tower/artifacts.js';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {initializeGame} from '../src/game/initialize.js';
import {ctx} from '../src/game/state.js';
import {ASSETS} from '../src/assets/manifest.js';
import {betNewSession} from '../src/betting/ledger.js';
import {earnedStats} from '../src/garage/model.js';
import {towerFor} from '../src/tower/model.js';
import {installTowerUI} from '../src/tower/ui.js';
import {advanceStartup} from '../src/game/session.js';
export function startBossScenario({variant='brute',arena='ward',floor=5,seed=1234,textured=true,ordinary=false}={}){
 const oldRandom=Math.random;let state=seed>>>0;
 Math.random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const dom=new JSDOM(fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),{url:'https://boss-experiment.test/',pretendToBeVisual:true});
 for(const key of ['document','localStorage','Event'])globalThis[key]=dom.window[key];
 globalThis.matchMedia=()=>({matches:false});globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
 ctx.arenaRenderer=null;ctx.towerPlayer=0;
 const session=betNewSession(['Испытатель'],1000),tower=towerFor(session,0);
 Object.assign(tower,{level:floor,wins:floor-1,record:floor-1,stats:earnedStats(floor-1),artifacts:newArtifactCollection(floor-1)});
 if(ordinary)tower.legacyBossFloor=true;
 else tower.bossEncounter={floor,variant,texture:'assets/textures/robots/boss/b_01.png'};
 const textures=Object.fromEntries(Object.keys(ASSETS.textures).map(key=>[key,{loaded:textured}]));
 initializeGame({session,entry:'tower',tower:structuredClone(tower),arenaId:arena,textures});
 installTowerUI();document.querySelector('#tower-fight').click();advanceStartup(20);ctx.paused=false;ctx.orientationBlocked=false;ctx.settingsOpen=false;
 return {dom,session,tower,boss:ctx.robots[1],player:ctx.robots[0],close(){ctx.root?.__disposeTag?.();dom.window.close();Math.random=oldRandom;ctx.mode='spectator';}};
}
