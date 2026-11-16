import {COIN_ICON} from './currency.js';

// Presentation only: the session ledger is the single source of truth.
const pretty = amount => Number(amount).toLocaleString('ru-RU');
export const COUNTER_DURATION_MS=650;
export function counterValue(from,to,progress){
 const t=Math.max(0,Math.min(1,progress));
 return Math.round(from+(to-from)*(1-(1-t)**3));
}
export function playerBalanceMarkup(id,balance){
 // Re-rendered windows join an in-flight animation immediately, without
 // waiting for MutationObserver's next microtask or the next animation frame.
 const now=Date.now(),change=changes.get(Number(id));
 const active=Boolean(change&&change.to===balance&&currentSession?.players?.[Number(id)]?.balance===balance
  &&now<change.started+COUNTER_DURATION_MS&&!reducedMotion());
 const kind=active?(change.to>change.from?' is-credit':' is-debit'):'';
 const amount=active?valueAt(change,now):balance;
 return '<span class="currency-counter'+kind+'" data-player-balance="'+Number(id)+'" data-balance-target="'+Number(balance)+'"><span class="currency-counter-value">'+pretty(amount)+'</span> '+COIN_ICON+'</span>';
}
let currentSession=null,previousBalances=new Map(),changes=new Map();
let boundRoot=null,observer=null,frameId=null;
function reducedMotion(){
 const match=boundRoot?.ownerDocument?.defaultView?.matchMedia;
 return Boolean(match?.('(prefers-reduced-motion: reduce)').matches);
}
function valueAt(change,now){
 return counterValue(change.from,change.to,(now-change.started)/COUNTER_DURATION_MS);
}
function paint(now=Date.now()){
 if(!boundRoot||!currentSession)return;
 for(const element of boundRoot.querySelectorAll('[data-player-balance]')){
  const id=Number(element.dataset.playerBalance),player=currentSession.players?.[id];
  if(!player)continue;
  const change=changes.get(id),active=Boolean(change&&now<change.started+COUNTER_DURATION_MS&&!reducedMotion());
  element.dataset.balanceTarget=String(player.balance);
  element.classList.toggle('is-credit',active&&change.to>change.from);
  element.classList.toggle('is-debit',active&&change.to<change.from);
  const number=element.querySelector('.currency-counter-value');
  if(number)number.textContent=pretty(active?valueAt(change,now):player.balance);
 }
}
function advance(){
 frameId=null;
 const now=Date.now();
 for(const [id,change] of changes)if(now>=change.started+COUNTER_DURATION_MS)changes.delete(id);
 paint(now);
 if(changes.size)schedule();
}
function schedule(){
 if(frameId!==null||typeof requestAnimationFrame!=='function')return;
 frameId=requestAnimationFrame(advance);
}
function connect(root){
 if(!root||root===boundRoot)return;
 observer?.disconnect();boundRoot=root;
 const Observer=root.ownerDocument?.defaultView?.MutationObserver;
 if(!Observer)return;
 observer=new Observer(records=>{
  // Ignore animated Text nodes; rehydrate wallets added by another screen.
  if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&
   (node.matches?.('[data-player-balance]')||node.querySelector?.('[data-player-balance]')))))paint();
 });
 observer.observe(root,{subtree:true,childList:true});
}
export function trackPlayerBalances(session,root){
 connect(root);
 if(!session?.players)return;
 if(session!==currentSession){
  currentSession=session;
  previousBalances=new Map(session.players.map(p=>[p.id,p.balance]));
  changes.clear();
  if(frameId!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frameId);
  frameId=null;paint();return;
 }
 const now=Date.now();
 for(const player of session.players){
  const last=previousBalances.get(player.id);
  if(last!==undefined&&last!==player.balance){
   const existing=changes.get(player.id);
   const from=existing&&now<existing.started+COUNTER_DURATION_MS?valueAt(existing,now):last;
   if(!reducedMotion()&&from!==player.balance)changes.set(player.id,{from,to:player.balance,started:now});
   else changes.delete(player.id);
  }
  previousBalances.set(player.id,player.balance);
 }
 paint(now);
 if(changes.size)schedule();
}
