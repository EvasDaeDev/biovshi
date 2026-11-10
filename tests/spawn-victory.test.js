import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnFacingAngle} from '../src/game/arena.js';
import {robotCelebrateVictory,robotContinueVictory} from '../src/robot/scenes.js';
import {ctx} from '../src/game/state.js';

test('each spawn slot faces arena centre for 7 m ward and 4 m ring',()=>{
  for(const boundary of [{left:0,top:0,size:700},{left:150,top:150,size:400}]){
    const cx=boundary.left+boundary.size/2,cy=boundary.top+boundary.size/2;
    const d=55;
    const slots=[{x:cx,y:boundary.top+d},{x:boundary.left+d,y:cy},
      {x:boundary.left+boundary.size-d,y:cy},
      {x:cx,y:boundary.top+boundary.size-d}];
    for(const p of slots){
      const a=spawnFacingAngle(p,boundary);
      assert.ok(Math.abs(Math.atan2(Math.sin(a-Math.atan2(cy-p.y,cx-p.x)),
        Math.cos(a-Math.atan2(cy-p.y,cx-p.x))))<1e-10);
      assert.ok((cx-p.x)*Math.cos(a)+(cy-p.y)*Math.sin(a)>0);
    }
  }
});

test('winning gesture plays exactly two or three complete identical cycles',()=>{
  const oldCombat=ctx.combat,oldTime=ctx.game.time;
  try{
    for(const [choice,expected] of [[0,2],[.99,3]]){
      ctx.game.time=100;
      ctx.combat={finished:true,winner:0,celebrationUntil:0};
      let count=0,kind=null;
      const state={
        id:0,scene:null,leap:null,idleKinds:['stretch','scratch','hops'],
        arms:[{side:1}],healthy:()=>true,mobile:()=>true,
        api:{
          endScene(){state.scene=null;},
          performIdle(selected){
            if(kind===null)kind=selected;
            assert.equal(selected,kind);
            count++;
            state.scene={started:ctx.game.time,ends:ctx.game.time+1.8};
            return true;
          }
        }
      };
      const result=robotCelebrateVictory(state,()=>choice);
      assert.equal(result,kind);
      assert.equal(state.victoryRepeatsLeft,expected-1);
      while(state.victoryRepeatsLeft>0){
        state.scene=null;
        ctx.game.time+=1.8;
        assert.equal(robotContinueVictory(state),true);
      }
      assert.equal(count,expected);
      state.scene=null;
      assert.equal(robotContinueVictory(state),false);
      assert.equal(count,expected,'celebration never restarts after repeats');
      assert.ok(ctx.combat.celebrationUntil>=100+expected*1.8);
    }
  }finally{ctx.combat=oldCombat;ctx.game.time=oldTime;}
});
