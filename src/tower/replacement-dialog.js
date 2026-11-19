// Replacement chooser lives in the native top layer, above the Shelter dialog.
// Selection is a draft: no charge or equipment mutation until confirmation.
import {TOWER_MUTATIONS,TOWER_RARITIES} from './mutations.js';

export function chooseTowerModuleReplacement({root,installed,installName,price,onConfirm}){
  if(!installed.length)return;
  root.querySelector('#tower-module-replacement')?.remove();
  const doc=root.ownerDocument;
  const dialog=doc.createElement('dialog');
  dialog.id='tower-module-replacement';
  dialog.className='tower-replacement-dialog';
  dialog.setAttribute('aria-labelledby','tower-replacement-title');
  dialog.setAttribute('aria-modal','true');
  const heading=doc.createElement('header');
  const title=doc.createElement('h2');
  title.id='tower-replacement-title';title.textContent='ЗАМЕНА МОДУЛЯ';
  const close=doc.createElement('button');
  close.type='button';close.className='tower-replacement-close';close.textContent='×';
  close.setAttribute('aria-label','Закрыть выбор замены');
  heading.append(title,close);
  const note=doc.createElement('p');
  note.className='tower-replacement-explanation';
  note.textContent='Все шесть слотов заняты. Выбери установленный модуль, который будет снят. Он останется на складе.';
  const grid=doc.createElement('div');grid.className='tower-replacement-grid';
  const status=doc.createElement('p');status.className='tower-replacement-status';
  status.setAttribute('role','status');
  const footer=doc.createElement('footer');
  const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='ОТМЕНА';
  const apply=doc.createElement('button');apply.type='button';apply.className='tower-replacement-apply';
  apply.textContent='ЗАМЕНИТЬ И УСТАНОВИТЬ · '+price+' монет';
  apply.disabled=true;
  footer.append(cancel,apply);
  dialog.append(heading,note,grid,status,footer);
  let selected=null;
  const dispose=()=>{
    if(dialog.open&&typeof dialog.close==='function')dialog.close();
    dialog.removeAttribute('open');dialog.remove();
    if(doc.activeElement===doc.body||doc.activeElement===dialog)root.querySelector('.tower-mutation-install')?.focus({preventScroll:true});
  };
  const renderSelection=()=>{
    apply.disabled=!selected;
    for(const button of grid.children){
      const chosen=button.dataset.moduleId===selected;
      button.classList.toggle('is-selected',chosen);
      button.setAttribute('aria-pressed',String(chosen));
    }
    status.textContent=selected?'Установка «'+installName+'» · списание '+price+' монет. Снятый модуль останется на складе.':'Выбери модуль для замены.';
  };
  for(const item of installed){
    const mod=TOWER_MUTATIONS[item.type];
    const button=doc.createElement('button');button.type='button';
    button.className='tower-replacement-option';
    button.dataset.moduleId=item.id;
    button.setAttribute('aria-pressed','false');
    const name=doc.createElement('strong');name.textContent=mod?.name??item.type;
    const rarity=doc.createElement('small');rarity.textContent=TOWER_RARITIES[item.rarity]?.name??'';
    button.append(name,rarity);
    button.onclick=()=>{selected=item.id;renderSelection();};
    grid.append(button);
  }
  const finish=()=>{
    if(!selected)return;
    const id=selected;
    // Close the modal first: errors are shown by the established Shelter feedback.
    dispose();onConfirm(id);
  };
  close.onclick=cancel.onclick=dispose;
  apply.onclick=finish;
  dialog.addEventListener('cancel',event=>{event.preventDefault();dispose();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)dispose();});
  dialog.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();dispose();return;}
    if(event.key!=='Tab')return;
    const controls=[...dialog.querySelectorAll('button:not([disabled])')];
    const index=controls.indexOf(doc.activeElement);
    if(index===-1)return;
    if(event.shiftKey&&index===0){event.preventDefault();controls.at(-1)?.focus();}
    if(!event.shiftKey&&index===controls.length-1){event.preventDefault();controls[0]?.focus();}
  });
  root.append(dialog);
  if(typeof dialog.showModal==='function')dialog.showModal();
  else dialog.setAttribute('open','');
  renderSelection();grid.querySelector('button')?.focus();
}
