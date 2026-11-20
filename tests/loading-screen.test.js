import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {createLoadingScreen,LOADING_TIP_MS,LOADING_TIPS} from '../src/ui/loading-screen.js';

test('branded loader shows title, actual progress, status and streamer advice without delaying completion',()=>{
 const dom=new JSDOM('<div id="texture-loading">Подготовка арены…</div><main id="game"></main>',{
  url:'https://loading.test/',pretendToBeVisual:true
 });
 const win=dom.window;
 let tips=0,cleared=0,frames=0;
 win.setInterval=(fn,ms)=>{assert.equal(ms,1500);tips++;return 31;};
 win.clearInterval=id=>{assert.equal(id,31);cleared++;};
 win.requestAnimationFrame=()=>++frames;win.cancelAnimationFrame=()=>{};
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){this.url=url;}};
 const loader=createLoadingScreen({document:win.document,random:()=>0});
 const element=loader.element;
 assert.equal(element.querySelector('.loading-title').textContent,'БИОВШИ');
 assert.equal(element.querySelector('.loading-tip').textContent,LOADING_TIPS[0]);
 assert.equal(tips,1);assert.equal(LOADING_TIP_MS,1500);
 loader.update('Загружаем текстуры…',{done:3,total:8});
 assert.equal(element.querySelector('.loading-status').textContent,'Загружаем текстуры…');
 assert.equal(element.querySelector('.loading-percent').textContent,'38%');
 assert.equal(element.querySelector('.loading-fill').style.width,'38%');
 loader.update('Арена готова!',{done:6,total:6});
 assert.equal(element.querySelector('.loading-percent').textContent,'100%');
 loader.close();loader.close();
 assert.equal(cleared,1);
 assert.equal(win.document.getElementById('texture-loading'),null);
 dom.window.close();
});

test('loader can report an error and stops rotating tips',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://loading.test/'});
 const win=dom.window;let cancelled=0;
 win.setInterval=()=>7;win.clearInterval=()=>{cancelled++;};
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){}};
 const loader=createLoadingScreen({document:win.document});
 loader.fail('Ошибка сети');
 assert.equal(loader.element.querySelector('.loading-status').textContent,'Ошибка сети');
 assert.equal(loader.element.getAttribute('aria-busy'),'false');
 loader.close();
 assert.equal(cancelled,1);
 dom.window.close();
});

test('initial loading progress never resets between textures and scene preparation',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://loading.test/'});
 const win=dom.window;
 win.setInterval=()=>1;win.clearInterval=()=>{};
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){}};
 const loader=createLoadingScreen({document:win.document,staged:true});
 try{
  loader.update('Текстуры',{done:8,total:10,phase:'textures'});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'36%');
  loader.update('Текстуры загружены',{done:10,total:10,phase:'textures'});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'45%');
  loader.update('Готовим арену',{done:0,total:6});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'45%');
  loader.update('Сцена',{done:3,total:6});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'73%');
  loader.update('Старая асинхронная операция',{done:1,total:6});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'73%');
  loader.update('Готово',{done:6,total:6});
  assert.equal(loader.element.querySelector('.loading-percent').textContent,'100%');
 }finally{loader.close();dom.window.close();}
});

test('failed loading screen remains visible until its own close action',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://loading.test/'});
 const win=dom.window;
 let cleared=0;
 win.setInterval=()=>1;win.clearInterval=()=>{cleared++;};
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){}};
 const loader=createLoadingScreen({document:win.document});
 try{
  loader.update('Подготовка',{done:2,total:6});
  loader.fail('Ошибка загрузки арены. Повторите действие.');
  assert.equal(loader.element.isConnected,true);
  assert.equal(loader.element.getAttribute('role'),'alert');
  assert.equal(loader.element.getAttribute('aria-busy'),'false');
  assert.equal(loader.element.querySelector('.loading-dismiss').hidden,false);
  assert.equal(cleared,1);
  loader.update('Поздняя загрузка',{done:6,total:6});
  assert.match(loader.element.querySelector('.loading-status').textContent,/Ошибка загрузки/);
  loader.element.querySelector('.loading-dismiss').click();
  assert.equal(loader.element.isConnected,false);
 }finally{loader.close();dom.window.close();}
});

test('loading status uses measured phases and texture completions',()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const preload=fs.readFileSync(new URL('../src/assets/preload.js',import.meta.url),'utf8');
 assert.match(main,/createLoadingScreen\(/);
 assert.match(main,/loading\?\.update\('Настраиваем графику арены/);
 assert.match(main,/progress\.close\(\)/);
 assert.match(preload,/onProgress\?\.\(completed,files\.length\)/);
 const css=fs.readFileSync(new URL('../styles/interface.css',import.meta.url),'utf8');
 assert.match(css,/loading-title/);assert.match(css,/loading-streamer/);
});
