import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import jsdom from 'jsdom';
const {JSDOM,requestInterceptor}=jsdom;
import {ctx} from '../src/game/state.js';
import {initializeGame} from '../src/game/initialize.js';
import {betNewSession} from '../src/betting/ledger.js';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sdk=fs.readFileSync(new URL('../public/vendor/telegram-web-app-65.js',import.meta.url));
const metadata=JSON.parse(fs.readFileSync(new URL('../public/vendor/telegram-web-app-65.json',import.meta.url),'utf8'));

test('official SDK snapshot matches its recorded upstream hash',()=>{
 assert.equal(crypto.createHash('sha256').update(sdk).digest('hex'),metadata.sha256);
 assert.equal(metadata.source,'https://telegram.org/js/telegram-web-app.js?65');
});

for(const suffix of ['', 'test/'])test(`real SDK bootstraps from the game origin at /biovshi/${suffix} with no Telegram CDN access`,async()=>{
 const requests=[],native=[];
 const resources={interceptors:[requestInterceptor(request=>{
  requests.push(request.url);
  if(request.url===`https://example.test/biovshi/${suffix}vendor/telegram-web-app-65.js`)return new Response(sdk,{headers:{'Content-Type':'application/javascript'}});
  return new Response('',{headers:{'Content-Type':'text/css'}});
 })]};
 const dom=new JSDOM(html,{url:`https://example.test/biovshi/${suffix}#tgWebAppPlatform=ios&tgWebAppVersion=8.0`,runScripts:'dangerously',resources,pretendToBeVisual:true,
  beforeParse(win){
   win.console.log=()=>{};
   win.TelegramWebviewProxy={postEvent:(name,data)=>native.push([name,data])};
   Object.defineProperties(win,{innerWidth:{value:852,writable:true},innerHeight:{value:393,writable:true}});
  }});
 const win=dom.window;
 try{
  await new Promise((resolve,reject)=>{
   if(win.__telegramSDK?.state==='loaded'){resolve();return;}
   const timer=setTimeout(()=>reject(Error('Local SDK did not load')),2000);
   win.addEventListener('telegram-sdk-ready',()=>{clearTimeout(timer);resolve();},{once:true});
   win.addEventListener('telegram-sdk-error',()=>{clearTimeout(timer);reject(Error('Local SDK failed'));},{once:true});
  });
  assert.equal(win.__telegramSDK.state,'loaded');assert.equal(win.Telegram.WebApp.platform,'ios');assert.equal(win.Telegram.WebApp.version,'8.0');
  assert.ok(!requests.some(url=>url.startsWith('https://telegram.org/')));
  for(const key of ['document','localStorage','Event'])globalThis[key]=win[key];
  globalThis.matchMedia=()=>({matches:true});globalThis.ResizeObserver=class{observe(){}disconnect(){}};
  globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};ctx.arenaRenderer=null;
  initializeGame({session:betNewSession(['Игрок'],100),entry:'betting'});ctx.platform.ready();
  assert.equal(ctx.platform.isTelegram,true);assert.equal(ctx.platform.diagnostics().platform,'ios');assert.ok(native.some(([name])=>name==='web_app_request_fullscreen'));
  win.Telegram.WebView.receiveEvent('fullscreen_changed',{is_fullscreen:true});
  win.Telegram.WebView.receiveEvent('safe_area_changed',{top:0,left:59,right:59,bottom:20});
  win.Telegram.WebView.receiveEvent('content_safe_area_changed',{top:48,left:0,right:0,bottom:0});
  const diagnostic=ctx.platform.diagnostics();assert.equal(diagnostic.fullscreen.confirmed,true);assert.deepEqual(diagnostic.effective,{top:48,left:59,right:59,bottom:20});
  assert.equal(diagnostic.sdk.state,'loaded');assert.ok(diagnostic.fullscreen.attempts>0);
 }finally{ctx.root?.ownerDocument===win.document&&ctx.root.__disposeTag?.();win.close();}
});

test('a script download failure is diagnosed and the loader can retry',()=>{
 const bootstrap=html.match(/<!-- telegram-sdk:start -->[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
 const dom=new JSDOM(html,{url:'https://example.test/biovshi/test/#tgWebAppPlatform=ios&tgWebAppVersion=8.0',runScripts:'outside-only'});
 try{
  const win=dom.window;win.eval(bootstrap);
  let scripts=win.document.querySelectorAll('script[src$="/vendor/telegram-web-app-65.js"]');assert.equal(scripts.length,1);
  scripts[0].dispatchEvent(new win.Event('error'));assert.equal(win.__telegramSDK.state,'error');assert.ok(win.__telegramSDK.error);
  win.__loadTelegramSDK();scripts=win.document.querySelectorAll('script[src$="/vendor/telegram-web-app-65.js"]');assert.equal(scripts.length,2);assert.equal(win.__telegramSDK.state,'loading');
 }finally{dom.window.close();}
});
