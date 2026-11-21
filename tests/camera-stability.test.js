import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraReset,cameraTargetBounds,cameraUpdate} from '../src/render/camera.js';
import {ctx} from '../src/game/state.js';

const capsule=(x,y,r=7)=>({a:{x,y},b:{x:x+6,y:y+6},r});
test('camera framing ignores attacks, head turns and moving appendages',()=>{
  const a={x:140,y:210,capsules:[capsule(140,210)]};
  const b={x:520,y:490,capsules:[capsule(520,490)]};
  const original=cameraTargetBounds([a,b]);
  a.capsules=[capsule(-200,800,90),capsule(550,-400,12)];
  b.capsules=[capsule(800,800,12)];
  assert.deepEqual(cameraTargetBounds([a,b]),original,
    'animated appendages cannot change zoom or centre');
  b.x+=50;
  assert.equal(cameraTargetBounds([a,b]).right,original.right+50,
    'real body movement still changes the group bounds');
});

test('camera stays still for stationary patients despite changing skeletons',()=>{
  const keys=['mode','startup','paused','combat','robots','camera','CAMERA_MIN','CAMERA_FULL','fieldWidth','fieldHeight','fieldSide','svg','timerOutput','cache'];
  const old=Object.fromEntries(keys.map(key=>[key,ctx[key]]));
  const oldDocument=globalThis.document;
  const svg={setAttribute(k,v){this[k]=v;}};
  const timerOutput={setAttribute(){}};
  try{
    globalThis.document={hidden:false};
    Object.assign(ctx,{mode:'spectator',startup:{phase:'running'},paused:false,combat:{finished:false},
      robots:[{id:0,x:170,y:200,visible:true,mobile:true,capsules:[capsule(170,200)]},
              {id:1,x:490,y:480,visible:true,mobile:true,capsules:[capsule(490,480)]}],
      camera:{x:0,y:0,size:700},CAMERA_MIN:200,CAMERA_FULL:716,
      fieldWidth:900,fieldHeight:600,fieldSide:600,svg,timerOutput,cache:new WeakMap()});
    for(let i=0;i<480;i++)cameraUpdate(1/30);
    const before={...ctx.camera};
    const viewBefore=svg.viewBox;
    for(let i=0;i<120;i++){
      ctx.robots[0].capsules=[capsule(170+100*Math.sin(i),200-70*Math.cos(i),25)];
      ctx.robots[1].capsules=[capsule(490+120*Math.cos(i),480+90*Math.sin(i),40)];
      cameraUpdate(1/30);
    }
    for(const key of ['x','y','size'])assert.ok(Math.abs(ctx.camera[key]-before[key])<.001,
      key+' must remain stable when only limbs move');
    assert.equal(svg.viewBox,viewBefore);
    ctx.robots[0].x+=120;
    for(let i=0;i<30;i++)cameraUpdate(1/30);
    assert.notEqual(svg.viewBox,viewBefore,'the camera still follows real movement');
  }finally{
    for(const key of keys)if(old[key]===undefined)delete ctx[key];else ctx[key]=old[key];
    globalThis.document=oldDocument;
  }
});


test('Tower starts wide and smoothly follows the player at half of the opening view',()=>{
  const keys=['mode','startup','paused','combat','robots','camera','CAMERA_MIN','CAMERA_FULL',
    'arenaDefinition','fieldWidth','fieldHeight','svg','timerOutput','cache'];
  const old=Object.fromEntries(keys.map(key=>[key,ctx[key]]));
  const oldDocument=globalThis.document;
  const svg={setAttribute(key,value){this[key]=value;}};
  const settle=()=>{
    for(let i=0;i<360;i++)cameraUpdate(1/30);
  };
  const centre=()=>[ctx.camera.x+ctx.camera.size/2,ctx.camera.y+ctx.camera.size/2];
  const near=(actual,wanted)=>assert.ok(Math.abs(actual-wanted)<.001,`${actual} != ${wanted}`);
  try{
    globalThis.document={hidden:false};
    const player={id:0,x:150,y:200,visible:true,mobile:true};
    const nearEnemy={id:1,x:640,y:120,visible:true,mobile:true};
    const farEnemy={id:2,x:630,y:510,visible:true,mobile:true};
    Object.assign(ctx,{mode:'tower',startup:{phase:'spawning'},paused:false,combat:{finished:false},
      robots:[player,nearEnemy,farEnemy],camera:{},CAMERA_MIN:200,CAMERA_FULL:716,
      arenaDefinition:{left:0,top:0,size:700},fieldWidth:900,fieldHeight:600,
      svg,timerOutput:{setAttribute(){}},cache:new WeakMap()});
    cameraReset();
    settle();
    assert.deepEqual(centre(),[350,350]);
    assert.equal(ctx.camera.size,716);
    ctx.startup.phase='running';
    cameraUpdate(1/30);
    assert.ok(ctx.camera.size<716&&ctx.camera.size>358,'transition is gradual');
    settle();
    assert.equal(ctx.camera.size,358);
    near(centre()[0],150);near(centre()[1],200);

    nearEnemy.x=180;nearEnemy.y=210;
    cameraUpdate(1/30);
    near(centre()[0],150);near(centre()[1],200);
    settle();
    near(ctx.camera.size,(30+84+200)*600/900);
    near(centre()[0],150);near(centre()[1],200);
    assert.ok(farEnemy.x>ctx.camera.x+ctx.camera.size,'a distant enemy does not widen the local fight');

    nearEnemy.mobile=false;
    player.x=320;player.y=220;
    const [oldX,oldY]=centre();
    cameraUpdate(2);
    assert.ok(Math.hypot(centre()[0]-oldX,centre()[1]-oldY)<14,'a stalled frame must not jump to the new centre');
    settle();
    assert.equal(ctx.camera.size,358);
    near(centre()[0],320);near(centre()[1],220);

    player.mobile=false;
    settle();
    near(centre()[0],320);near(centre()[1],220);

    ctx.paused=true;
    const pauseView=svg.viewBox;
    player.x=350;settle();
    assert.equal(svg.viewBox,pauseView,'pausing keeps the current shot');
  }finally{
    for(const key of keys)if(old[key]===undefined)delete ctx[key];else ctx[key]=old[key];
    globalThis.document=oldDocument;
  }
});
