import test from 'node:test';
import assert from 'node:assert/strict';
import {betNewSession} from '../src/betting/ledger.js';
import {towerFor,completeTower,rewardTower,buyTowerSurgery,buyTowerInsurance,validTower} from '../src/tower/model.js';
import {chooseTowerMutation} from '../src/tower/mutations.js';
import {towerAvailableDonors,validTowerDonors,donorLengthScale} from '../src/tower/donors.js';
import {towerPatientAnatomy} from '../src/tower/anatomy.js';
function reachSix(){
 const session=betNewSession(['Игрок'],1000),run=towerFor(session,0);
 while(run.level<6)completeTower(session,0,true,()=>.2);
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 return {session,run};
}
test('only personally credited kills award donor tissue',()=>{
 const {session,run}=reachSix();run.preparing=false;
 assert.equal(rewardTower(session,0,1,1),false);
 assert.equal(run.donorTissues.length,0);
 assert.equal(rewardTower(session,0,1,0),true);
 assert.equal(rewardTower(session,0,1,0),false);
 assert.equal(run.donorTissues.length,2);
 assert.equal(towerAvailableDonors(run,'transplant_arm').length,1);
 assert.equal(towerAvailableDonors(run,'transplant_leg').length,1);
 assert.equal(validTowerDonors(run.donorTissues),true);
});
test('tissue consumption, credits, real anatomy and insurance',()=>{
 const {session,run}=reachSix();
 run.preparing=false;rewardTower(session,0,1,0);completeTower(session,0,true,()=>.2);
 while(run.level<11){
  if(run.mutationDraft)chooseTowerMutation(run,run.mutationDraft.options[0]);
  completeTower(session,0,true,()=>.2);
 }
 assert.ok(chooseTowerMutation(run,run.mutationDraft.options[0]));
 const tissue=towerAvailableDonors(run,'transplant_arm')[0],before=session.players[0].balance;
 assert.equal(buyTowerSurgery(session,0,'transplant_arm','arm-1-upper',tissue.id),600);
 assert.equal(session.players[0].balance,before-600);
 assert.ok(!run.donorTissues.some(d=>d.id===tissue.id));
 assert.deepEqual(run.surgeries[0],{site:'arm-1-upper',procedure:'transplant_arm',donorId:tissue.id,donorProfile:tissue.profile});
 assert.equal(towerPatientAnatomy(run).limbs.length,5);
 assert.equal(validTower(run),true);
 buyTowerInsurance(session,0);
 const next=completeTower(session,0,false);
 assert.deepEqual(next.surgeries,run.surgeries);
 assert.deepEqual(next.donorTissues,run.donorTissues);
 assert.equal(validTower(next),true);
});
test('boss donor changes physical length, mass and turn rate',()=>{
 assert.equal(donorLengthScale('boss','arm'),1.25);
 const b=towerPatientAnatomy({surgeries:[
  {site:'arm-1-upper',procedure:'transplant_arm',donorId:'5:1:arm',donorProfile:'boss'}]});
 const arm=b.limbs.find(l=>l.key==='arm-1-graft');
 assert.equal(arm.lengthScale,1.25);assert.equal(arm.massScale,1.35);
 assert.ok(b.turnFactor<1);assert.ok(b.speedFactor<1);
});
test('forged donor IDs and double spending are rejected',()=>{
 const {run}=reachSix();
 run.donorTissues=[{id:'25:1:arm',kind:'arm',profile:'boss'}];
 assert.equal(validTower(run),false);
 run.donorTissues=[{id:'5:1:arm',kind:'arm',profile:'boss'}];
 assert.equal(validTower(run),true);
 run.surgeries=[{site:'arm-1-upper',procedure:'transplant_arm',donorId:'5:1:arm',donorProfile:'boss'}];
 assert.equal(validTower(run),false);
 run.donorTissues=[];
 assert.equal(validTower(run),true);
});
