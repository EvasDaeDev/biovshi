import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraTargetBounds,cameraUpdate} from '../src/render/camera.js';
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
  const keys=['startup','paused','combat','robots','camera','CAMERA_MIN','CAMERA_FULL','fieldWidth','fieldHeight','fieldSide','svg','timerOutput','cache'];
  const old=Object.fromEntries(keys.map(key=>[key,ctx[key]]));
  const oldDocument=globalThis.document;
  const svg={setAttribute(k,v){this[k]=v;}};
  const timerOutput={setAttribute(){}};
  try{
    globalThis.document={hidden:false};
    Object.assign(ctx,{startup:{phase:'running'},paused:false,combat:{finished:false},
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
