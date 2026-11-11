import test from 'node:test';
import assert from 'node:assert/strict';
import {ctx} from '../src/game/state.js';
import {staticContacts,resolveSurfaceContacts,capsulePolygonContact} from '../src/systems/surface-contact.js';
const wall={nx:-1,ny:0,c:0,length:1};
function stateAt(x,y=20,segment='arm-1-lower',radius=5){
 const foot={x,y},l={foot,from:{...foot},to:{...foot}};
 const s={x:20,y:20,chest:{x:20,y:20},spine:[],tail:[],vx:-10,vy:7,allLimbs:()=>[l],peerRobots:()=>[],makeCapsules:()=>[{a:{...foot},b:{...foot},r:radius,segment}]};return {s,l};
}
test('8 cm limb penetration corrects by 4 cm including the 1 cm release margin and carries all anchors',()=>{
 ctx.arenaPlanes=[wall];ctx.obstacles=[];const {s,l}=stateAt(-3),distance=Math.hypot(s.chest.x-l.foot.x,s.chest.y-l.foot.y);
 assert.equal(resolveSurfaceContacts(s),true);assert.equal(s.x,24);assert.equal(l.foot.x,1);assert.equal(l.from.x,1);assert.equal(l.to.x,1);
 assert.equal(Math.hypot(s.chest.x-l.foot.x,s.chest.y-l.foot.y),distance);assert.equal(s.vx,0);assert.equal(s.vy,7,'tangential velocity survives');
 for(let i=0;i<60;i++)assert.equal(resolveSurfaceContacts(s),false);assert.equal(s.x,24,'release margin prevents repeated correction jitter');
});
test('the same 5 cm limb allowance works against polygons and resolves two-wall corners',()=>{
 ctx.arenaPlanes=[];ctx.obstacles=[{points:[{x:0,y:0},{x:20,y:0},{x:20,y:40},{x:0,y:40}]}];
 const {s,l}=stateAt(3);assert.equal(capsulePolygonContact(s.makeCapsules()[0],ctx.obstacles[0]).depth,8);assert.equal(resolveSurfaceContacts(s),true);assert.equal(l.foot.x,-1);
 ctx.obstacles=[];ctx.arenaPlanes=[wall,{nx:0,ny:-1,c:0,length:1}];const corner=stateAt(-3,-3);assert.equal(resolveSurfaceContacts(corner.s),true);assert.equal(corner.l.foot.x,1);assert.equal(corner.l.foot.y,1);
});
test('heads get zero penetration allowance, while limbs within allowance need no correction',()=>{
 ctx.arenaPlanes=[wall];ctx.obstacles=[];const head=stateAt(-3,20,'head');assert.equal(resolveSurfaceContacts(head.s),true);assert.ok(head.l.foot.x>=5);
 const limb=stateAt(1);assert.equal(resolveSurfaceContacts(limb.s),false);assert.equal(limb.s.x,20);
});
test('opposing contacts do not cause oscillation or force a patient through a narrow gap',()=>{
 ctx.arenaPlanes=[wall,{nx:1,ny:0,c:3,length:1}];ctx.obstacles=[];const {s,l}=stateAt(1.5,20,'leg-1-upper',10);
 for(let i=0;i<20;i++)assert.equal(resolveSurfaceContacts(s),false);assert.equal(l.foot.x,1.5);assert.equal(s.x,20);
});
test('a correction cannot newly push the torso into another patient',()=>{
 ctx.arenaPlanes=[wall];ctx.obstacles=[];const {s,l}=stateAt(-3);
 const base=s.makeCapsules;s.makeCapsules=()=>[...base(),{a:{...s.chest},b:{...s.chest},r:3,segment:'spine-0'}];
 s.peerRobots=()=>[{capsules:[{a:{x:27,y:20},b:{x:27,y:20},r:3,segment:'spine-0'}]}];
 assert.equal(resolveSurfaceContacts(s),false);assert.equal(l.foot.x,-3);assert.equal(s.chest.x,20);
});
