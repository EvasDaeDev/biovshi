import {COIN_SCALE} from '../betting/coins.js';
import {BOSS_FLOOR_INTERVAL,TEST_BUILD} from '../build-channel.js';
import {isBossFloor} from '../boss/config.js';
export const ARTIFACT_COUNT=4;
export const PIECES_PER_ARTIFACT=4;
export const ARTIFACT_PIECE_COUNT=ARTIFACT_COUNT*PIECES_PER_ARTIFACT;
export const ARTIFACT_NAMES=['Мишка','Компьютер','Грааль','Водка и огурец'];

// Collection v2 is independent of the lifetime record and survives run resets.
export const ARTIFACT_COMPLETION_REWARD=333*COIN_SCALE;
export function newArtifactCollection(){return {version:2,bossEvery:BOSS_FLOOR_INTERVAL,pieces:[],bossWins:{},rewardedArtifacts:[]};}
export function migrateArtifactInterval(collection){
 const old=collection.bossEvery??(TEST_BUILD?2:5);
 if(![2,5].includes(old)||!collection.bossWins||typeof collection.bossWins!=='object'||Array.isArray(collection.bossWins))return false;
 const entries=Object.entries(collection.bossWins);
 if(!entries.every(([floor])=>/^[1-9]\d*$/.test(floor)&&Number.isSafeInteger(Number(floor))&&Number(floor)%old===0))return false;
 collection.bossWins=Object.fromEntries(entries.map(([floor,wins])=>[Number(floor)/old*BOSS_FLOOR_INTERVAL,wins]));
 collection.bossEvery=BOSS_FLOOR_INTERVAL;return old!==BOSS_FLOOR_INTERVAL;
}
export function artifactComplete(collection,artifact){
 return Array.from({length:PIECES_PER_ARTIFACT},(_,part)=>artifact*PIECES_PER_ARTIFACT+part).every(id=>collection.pieces.includes(id));
}
export function drawArtifactPiece(collection,random=Math.random){
 const remaining=Array.from({length:ARTIFACT_PIECE_COUNT},(_,id)=>id).filter(id=>!collection.pieces.includes(id));
 if(!remaining.length)return null;
 const piece=remaining[Math.floor(random()*remaining.length)];
 collection.pieces.push(piece);return piece;
}
// Each repeat victory against this specific boss floor removes 30% of
// the remaining drop probability. There is no minimum probability floor.
// The same saved bossWins counter controls both fragment and segment drops.
export const bossRepeatDropChance=previousWins=>.7**previousWins;
export function artifactDropChance(collection,floor){
 if(collection.pieces.length===ARTIFACT_PIECE_COUNT)return 0;
 return bossRepeatDropChance(collection.bossWins[floor]??0);
}
export function awardBossArtifact(collection,floor,random=Math.random){
 const chance=artifactDropChance(collection,floor);
 collection.bossWins[floor]=(collection.bossWins[floor]??0)+1;
 return chance>0&&random()<chance?drawArtifactPiece(collection,random):null;
}
export function validArtifactCollection(collection,record){
 if(collection?.version!==2||collection.bossEvery!==BOSS_FLOOR_INTERVAL||!Array.isArray(collection.pieces)||collection.pieces.length>ARTIFACT_PIECE_COUNT
  ||new Set(collection.pieces).size!==collection.pieces.length
  ||!collection.pieces.every(id=>Number.isInteger(id)&&id>=0&&id<ARTIFACT_PIECE_COUNT)
  ||!collection.bossWins||typeof collection.bossWins!=='object'||Array.isArray(collection.bossWins)
  ||!Array.isArray(collection.rewardedArtifacts)||new Set(collection.rewardedArtifacts).size!==collection.rewardedArtifacts.length
  ||!collection.rewardedArtifacts.every(id=>Number.isInteger(id)&&id>=0&&id<ARTIFACT_COUNT&&artifactComplete(collection,id)))return false;
 const entries=Object.entries(collection.bossWins);
 if(!entries.every(([floor,wins])=>/^[1-9]\d*$/.test(floor)&&Number.isSafeInteger(Number(floor))&&isBossFloor(Number(floor))&&Number.isSafeInteger(wins)&&wins>=1))return false;
 const victories=entries.reduce((sum,[,wins])=>sum+wins,0);
 return Number.isSafeInteger(victories)&&collection.pieces.length<=victories;
}
