import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../src/game/state.js';
import {step} from '../src/game/loop.js';

test('results wait until the streamer finishes all required announcements',()=>{
 const saved={...ctx};let pending=true,resultChecks=0;
 try{
  Object.assign(ctx,{
   startup:{phase:'running'},orientationBlocked:false,settingsOpen:false,
   combat:{finished:true,winner:null,finishedAt:0,celebrationUntil:0},
   game:{time:10},robots:[],streamerMascot:{hasRequiredAnnouncements:()=>pending},
   resultsPanel:{get hidden(){resultChecks++;return false;}}
  });
  step(.1);assert.equal(resultChecks,0);
  pending=false;step(.1);assert.equal(resultChecks,1);
 }finally{Object.assign(ctx,saved);}
});
