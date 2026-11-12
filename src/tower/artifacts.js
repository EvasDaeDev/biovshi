export const ARTIFACT_COUNT=4;
export const PIECES_PER_ARTIFACT=4;
export const ARTIFACT_PIECE_COUNT=ARTIFACT_COUNT*PIECES_PER_ARTIFACT;
export const ARTIFACT_NAMES=['Мишка','Кубок','Телевизор','Водка и огурец'];

// Floors are cleared consecutively, so the lifetime record also identifies
// every previously rewarded floor. Pieces survive run resets with that record.
export function drawArtifactPiece(collection,random=Math.random){
 const remaining=Array.from({length:ARTIFACT_PIECE_COUNT},(_,id)=>id).filter(id=>!collection.pieces.includes(id));
 if(!remaining.length)return null;
 const piece=remaining[Math.floor(random()*remaining.length)];
 collection.pieces.push(piece);return piece;
}
export function newArtifactCollection(record=0,random=Math.random){
 const collection={version:1,pieces:[]};
 for(let i=0;i<Math.min(record,ARTIFACT_PIECE_COUNT);i++)drawArtifactPiece(collection,random);
 return collection;
}
export function validArtifactCollection(collection,record){
 return collection?.version===1&&Array.isArray(collection.pieces)
  &&collection.pieces.length===Math.min(record,ARTIFACT_PIECE_COUNT)
  &&new Set(collection.pieces).size===collection.pieces.length
  &&collection.pieces.every(id=>Number.isInteger(id)&&id>=0&&id<ARTIFACT_PIECE_COUNT);
}
