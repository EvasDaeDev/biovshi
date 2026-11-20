import {formatChips} from './currency.js';
// Shared explicit confirmation for paid Tower actions. A native dialog stays in
// the top layer even when a Shelter dialog is already open.
export function confirmGameAction({root,title,details=[],cost,confirmLabel='ПОДТВЕРДИТЬ',onConfirm}){
 const doc=root.ownerDocument;
 const existing=root.querySelector('#game-action-confirm');
 if(existing){
  if(existing.open&&typeof existing.close==='function')existing.close();
  existing.remove();
 }
 const dialog=doc.createElement('dialog');
 dialog.id='game-action-confirm';
 dialog.className='game-action-confirm';
 dialog.setAttribute('aria-modal','true');
 dialog.setAttribute('aria-labelledby','game-action-confirm-title');
 const header=doc.createElement('header');
 const heading=doc.createElement('h2');heading.id='game-action-confirm-title';heading.textContent=title;
 const close=doc.createElement('button');close.type='button';close.textContent='×';
 close.className='game-action-confirm-close';close.setAttribute('aria-label','Закрыть подтверждение');
 header.append(heading,close);
 const body=doc.createElement('div');body.className='game-action-confirm-details';
 for(const detail of details){
  if(!detail)continue;
  const p=doc.createElement('p');p.textContent=detail;body.append(p);
 }
 const footer=doc.createElement('footer');
 const cancel=doc.createElement('button');cancel.type='button';cancel.textContent='ОТМЕНА';
 const ok=doc.createElement('button');ok.type='button';ok.className='game-action-confirm-submit';
 ok.textContent=confirmLabel;
 if(Number.isFinite(cost))ok.insertAdjacentHTML('beforeend',' · −'+formatChips(cost));
 footer.append(cancel,ok);dialog.append(header,body,footer);
 const previous=doc.activeElement;
 let finished=false;
 const dismiss=()=>{
  if(finished)return;
  finished=true;
  if(dialog.open&&typeof dialog.close==='function')dialog.close();
  dialog.removeAttribute('open');dialog.remove();
  if(previous?.isConnected&&!previous.closest('[hidden]'))previous.focus({preventScroll:true});
 };
 const submit=()=>{
  if(finished)return;
  dismiss();
  onConfirm?.();
 };
 close.onclick=cancel.onclick=dismiss;
 ok.onclick=submit;
 dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});
 dialog.addEventListener('click',event=>{if(event.target===dialog)dismiss();});
 dialog.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();dismiss();return;}
  if(event.key!=='Tab')return;
  const buttons=[close,cancel,ok],i=buttons.indexOf(doc.activeElement);
  if(event.shiftKey&&i===0){event.preventDefault();ok.focus();}
  else if(!event.shiftKey&&i===buttons.length-1){event.preventDefault();close.focus();}
 });
 root.append(dialog);
 if(typeof dialog.showModal==='function')dialog.showModal();
 else dialog.setAttribute('open','');
 cancel.focus();
 return dialog;
}
