import {ASSETS,assetUrl} from '../assets/manifest.js';
import {listenForBackdropDismissal} from '../ui/dialog-backdrop.js';
import {archiveNote,ARCHIVE_NOTE_COUNT} from './archive-notes.js';

const senders={
 patient:{name:'Пациент',icon:ASSETS.textures.notePatient},
 doctor:{name:'Врач',icon:ASSETS.textures.noteDoctor},
 engineer:{name:'Инженер',icon:ASSETS.textures.noteEngineer},
 security:{name:'Охрана',icon:ASSETS.textures.noteSecurity},
};
const noteNumber=id=>'№ '+String(id).padStart(2,'0');

function noteButton(id){
 const sender=senders[archiveNote(id).role],number=noteNumber(id);
 return `<button type="button" class="tower-note-card" data-archive-note="${id}" aria-haspopup="dialog" aria-label="Записка ${number} · ${sender.name}">
  <img src="${assetUrl(sender.icon)}" alt="" width="64" height="64"><span>${number}</span>
 </button>`;
}

export function archiveCollectionMarkup(ids){
 const cards=[...ids].sort((a,b)=>a-b).map(noteButton).join('');
 return `<section class="tower-notes" aria-labelledby="tower-notes-title">
  <h3 id="tower-notes-title" class="tower-artifact-title">ЗАПИСКИ · ${ids.length}/${ARCHIVE_NOTE_COUNT}</h3>
  <div class="tower-note-grid">${cards}</div>
 </section>`;
}

export function archiveRewardMarkup(id){
 return `<section class="tower-note-reward" aria-label="Получена записка">${noteButton(id)}</section>`;
}

export function initializeArchiveNoteReader(root){
 const dialog=root.querySelector('#archive-note-reader');
 const heading=dialog.querySelector('#archive-note-number');
 const sender=dialog.querySelector('#archive-note-sender');
 const title=dialog.querySelector('#archive-note-title');
 const text=dialog.querySelector('#archive-note-text');
 const closeButton=dialog.querySelector('[data-paper-dismiss]');
 let trigger=null;

 function close(restoreFocus=true){
  if(dialog.open){
   if(typeof dialog.close==='function')dialog.close();
   else dialog.removeAttribute('open');
  }
  if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});
  trigger=null;
 }
 function read(event){
  const button=event.target.closest?.('button[data-archive-note]');
  if(!button||dialog.open)return;
  const note=archiveNote(Number(button.dataset.archiveNote));
  if(!note)return;
  trigger=button;
  heading.textContent='Записка '+noteNumber(note.id);
  sender.textContent='Отправитель: '+senders[note.role].name;
  title.textContent=note.title;
  text.textContent=note.text;
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  heading.focus({preventScroll:true});
  dialog.scrollTop=0;
 }
 function cancel(event){
  event.preventDefault();
  close();
 }

 closeButton.onclick=()=>close();
 const removeBackdropListener=listenForBackdropDismissal(dialog,close);
 dialog.addEventListener('cancel',cancel);
 root.addEventListener('click',read);
 const dispose=root.__disposeTag;
 root.__disposeTag=()=>{
  root.removeEventListener('click',read);
  dialog.removeEventListener('cancel',cancel);
  removeBackdropListener();
  closeButton.onclick=null;
  close(false);
  dispose();
 };
}
