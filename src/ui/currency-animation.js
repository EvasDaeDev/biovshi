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
// A queued transaction belongs to a particular UI screen, not a timer.
let pendingReplays=new Map();
let boundRoot=null,observer=null,frameId=null;
function reducedMotion(){
 const match=boundRoot?.ownerDocument?.defaultView?.matchMedia;
 return Boolean(match?.('(prefers-reduced-motion: reduce)').matches);
}
function visibleLayer(){
 if(!boundRoot)return null;
 for(const selector of ['#arena-settings','#gladiator-results','#bet-overlay','#tower-preparation','#launch-overlay']){
  const element=boundRoot.querySelector(selector);
  if(element&&!element.hidden&&!element.closest('[hidden]'))return element;
 }
 return null;
}
function visibleBalance(element){
 if(!element?.isConnected||element.closest('[hidden]')||boundRoot?.ownerDocument?.hidden)return false;
 const layer=visibleLayer();
 return !layer||layer.contains(element);
}
function visibleTarget(id,scopeSelector=null){
 if(!boundRoot)return false;
 const scope=scopeSelector?boundRoot.querySelector(scopeSelector):boundRoot;
 if(!scope||scope.closest('[hidden]'))return false;
 return Array.from(scope.querySelectorAll('[data-player-balance]')).some(element=>
  Number(element.dataset.playerBalance)===id&&visibleBalance(element));
}
function activatePending(){
 if(!currentSession||!boundRoot||!pendingReplays.size)return;
 const now=Date.now();let activated=false;
 for(const [key,change] of pendingReplays){
  if(change.session!==currentSession||currentSession.players?.[change.id]?.balance!==change.to){
   pendingReplays.delete(key);continue;
  }
  if(!visibleTarget(change.id,change.scopeSelector))continue;
  pendingReplays.delete(key);
  if(!reducedMotion()){
   changes.set(change.id,{from:change.from,to:change.to,started:now,scopeSelector:change.scopeSelector});
   activated=true;
  }else changes.delete(change.id);
 }
 if(activated){paint(now);schedule();}
}
function valueAt(change,now){
 return counterValue(change.from,change.to,(now-change.started)/COUNTER_DURATION_MS);
}
function paint(now=Date.now()){
 if(!boundRoot||!currentSession)return;
 for(const element of boundRoot.querySelectorAll('[data-player-balance]')){
  const id=Number(element.dataset.playerBalance),player=currentSession.players?.[id];
  if(!player)continue;
  const change=changes.get(id);
  const active=Boolean(change&&change.to===player.balance&&now<change.started+COUNTER_DURATION_MS
   &&!reducedMotion()&&visibleBalance(element)&&
   (!change.scopeSelector||element.closest(change.scopeSelector)));
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
  // Actual window open/close transitions, rather than guessed delays.
  const changed=records.some(record=>record.type==='attributes'&&record.attributeName==='hidden');
  const mounted=records.some(record=>record.type==='childList'&&
   [...record.addedNodes].some(node=>node.nodeType===1&&
    (node.matches?.('[data-player-balance]')||node.querySelector?.('[data-player-balance]'))));
  if(changed||mounted){activatePending();paint();}
 });
 observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden']});
}
export function trackPlayerBalances(session,root,{animate=true}={}){
 connect(root);
 if(!session?.players)return;
 if(session!==currentSession){
  currentSession=session;
  previousBalances=new Map(session.players.map(p=>[p.id,p.balance]));
  changes.clear();pendingReplays.clear();
  if(frameId!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(frameId);
  frameId=null;paint();return;
 }
 const now=Date.now();
 for(const player of session.players){
  const last=previousBalances.get(player.id);
  if(last!==undefined&&last!==player.balance){
   const existing=changes.get(player.id);
   const from=existing&&now<existing.started+COUNTER_DURATION_MS?valueAt(existing,now):last;
   if(animate&&!reducedMotion()&&from!==player.balance&&visibleTarget(player.id))
    changes.set(player.id,{from,to:player.balance,started:now});
   else changes.delete(player.id);
  }
  previousBalances.set(player.id,player.balance);
 }
 activatePending();
 paint(now);
 if(changes.size)schedule();
}

/**
 * Restart a display-only animation when its result screen is finally visible.
 * The ledger and saved balances are never modified.
 */
export function replayPlayerBalanceChanges(session,transitions,root,scopeSelector=null){
 trackPlayerBalances(session,root,{animate:false});
 if(!session||session!==currentSession||!Array.isArray(transitions))return;
 for(const {id,from,to} of transitions){
  if(!Number.isInteger(id)||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)
   ||from<0||from===to||session.players?.[id]?.balance!==to)continue;
  pendingReplays.set((scopeSelector??'visible')+':'+id,{session,id,from,to,scopeSelector});
 }
 activatePending();
}
