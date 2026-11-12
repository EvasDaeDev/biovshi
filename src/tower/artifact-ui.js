import {ASSETS,assetUrl} from '../assets/manifest.js';
import {ARTIFACT_NAMES,ARTIFACT_COUNT,PIECES_PER_ARTIFACT,ARTIFACT_PIECE_COUNT} from './artifacts.js';

export function artifactCollectionMarkup(collection,newPiece=null){
 const pieces=collection.pieces;
 const awarded=Number.isInteger(newPiece)&&pieces.includes(newPiece);
 const newArtifact=awarded?Math.floor(newPiece/PIECES_PER_ARTIFACT):null;
 const countFor=artifact=>pieces.filter(id=>Math.floor(id/PIECES_PER_ARTIFACT)===artifact).length;
 const revealedName=artifact=>countFor(artifact)===PIECES_PER_ARTIFACT?ARTIFACT_NAMES[artifact]:null;
 const note=awarded?`НОВЫЙ ФРАГМЕНТ${revealedName(newArtifact)?' · '+revealedName(newArtifact):''} · ${countFor(newArtifact)}/4`:pieces.length===ARTIFACT_PIECE_COUNT?'КОЛЛЕКЦИЯ СОБРАНА':'КОЛЛЕКЦИЯ АРТЕФАКТОВ';
 return `<section class="tower-artifacts" aria-label="Коллекция артефактов">
  <p class="artifact-award-note" role="status">${note}</p>
  <div class="artifact-grid">${Array.from({length:ARTIFACT_COUNT},(_,artifact)=>{
   const count=countFor(artifact),complete=count===PIECES_PER_ARTIFACT;
   return `<figure class="artifact${complete?' is-complete':''}" aria-label="${revealedName(artifact)??`Неизвестный артефакт ${artifact+1}`}: ${count} из 4 фрагментов${awarded&&newArtifact===artifact?', получен новый фрагмент':''}">
    <div class="artifact-image"><img class="artifact-silhouette" src="${assetUrl(ASSETS.textures[`artifact${artifact+1}_bg`])}" alt="" width="256" height="256">
    ${Array.from({length:PIECES_PER_ARTIFACT},(_,part)=>{
     const id=artifact*PIECES_PER_ARTIFACT+part;
     return pieces.includes(id)?`<img class="artifact-piece${awarded&&id===newPiece?' is-new':''}" data-piece="${id}" src="${assetUrl(ASSETS.textures[`artifact${artifact+1}_${part+1}`])}" alt="" width="256" height="256">`:'';
    }).join('')}</div>
    <figcaption>${revealedName(artifact)??'???'} · ${count}/4${complete?' · СОБРАН':''}</figcaption>
   </figure>`;
  }).join('')}</div>
  ${awarded&&countFor(newArtifact)===PIECES_PER_ARTIFACT?`<p class="artifact-completed" role="status">АРТЕФАКТ СОБРАН · ${ARTIFACT_NAMES[newArtifact]}</p>`:''}
 </section>`;
}
