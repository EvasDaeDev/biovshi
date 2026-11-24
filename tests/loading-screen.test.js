import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import {createLoadingScreen} from '../src/ui/loading-screen.js';

test('loader shows actual progress, status and one fixed streamer line without delaying completion',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const dom=new JSDOM(html,{
  url:'https://loading.test/',pretendToBeVisual:true
 });
 const win=dom.window;
 win.setInterval=()=>assert.fail('The streamer line needs no rotation timer');
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){this.url=url;}};
 const initial=win.document.getElementById('texture-loading');
 assert.equal(initial.textContent,'Запуск клиники…');
 const loader=createLoadingScreen({document:win.document});
 const element=loader.element;
 assert.doesNotMatch(element.textContent,/ЭКЦЕПРИ|ECCEPRY/i);
 const line='Музыка и звук влияют на восприятие игры. Не выключайте их!';
 assert.deepEqual([...element.querySelectorAll('.loading-tip')].map(node=>node.textContent),[line]);
 loader.update('Загружаем текстуры…',{done:3,total:8});
 assert.equal(element.querySelector('.loading-status').textContent,'Загружаем текстуры…');
 assert.equal(element.querySelector('.loading-percent').textContent,'38%');
 assert.equal(element.querySelector('.loading-fill').style.width,'38%');
 loader.update('Арена готова!',{done:6,total:6});
 assert.equal(element.querySelector('.loading-percent').textContent,'100%');
 assert.equal(element.querySelector('.loading-tip').textContent,line);
 loader.close();loader.close();
 assert.equal(win.document.getElementById('texture-loading'),null);
 dom.window.close();
});

test('loader can report a network error',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://loading.test/'});
 const win=dom.window;
 win.HTMLCanvasElement.prototype.getContext=()=>null;
 win.Image=class{set src(url){}};
 const loader=createLoadingScreen({document:win.document});
 loader.fail('Ошибка сети');
 assert.equal(loader.element.querySelector('.loading-status').textContent,'Ошибка сети');
 assert.equal(loader.element.getAttribute('aria-busy'),'false');
 loader.close();
 dom.window.close();
});

test('initial loading progress never resets between textures and scene preparation',()=>{
 const dom=new JSDOM('<body></body>',{url:'https://loading.test/'});
 const win=dom.window;
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
  loader.update('Поздняя загрузка',{done:6,total:6});
  assert.match(loader.element.querySelector('.loading-status').textContent,/Ошибка загрузки/);
  loader.element.querySelector('.loading-dismiss').click();
  assert.equal(loader.element.isConnected,false);
 }finally{loader.close();dom.window.close();}
});

test('loading status uses measured phases',()=>{
 const main=fs.readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/createLoadingScreen\(/);
 assert.match(main,/loading\?\.update\('Настраиваем графику арены/);
 assert.match(main,/loading\.close\(\)/);
 const css=fs.readFileSync(new URL('../styles/interface.css',import.meta.url),'utf8');
 assert.match(css,/loading-streamer/);
});
