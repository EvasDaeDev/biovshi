// Neutral patient pose using the combat anatomy and real limb length coefficients.
import {limbRig,PATIENT_HEAD_OFFSET} from '../robot/body.js';
import {CONFIG} from '../config.js';
import {towerPatientAnatomy} from './anatomy.js';
const scale=CONFIG.robot.scale*3.2;
const stride=CONFIG.robot.vertebraBaseCm*scale;
const add=(p,dx,dy,len=1)=>[p[0]+dx*len,p[1]+dy*len];
export function towerUpgradePose(patient){
 const anatomy=towerPatientAnatomy(patient);
 const count=anatomy?.spineSegments??4;
 const limbs=anatomy?.limbs??[-1,1].flatMap(side=>['arm','leg'].map(kind=>({kind,side,key:`${kind}-${side}`})));
 const spine=Array.from({length:count+1},(_,i)=>[290-i*stride,100]);
 const pose={};
 for(let i=0;i<count;i++)pose[`spine-${i}`]=[spine[i],spine[i+1]];
 const neck=add(spine[0],1,0,PATIENT_HEAD_OFFSET*scale);
 // The head atlas points forward from its first anchor toward its second.
 // Reversed anchors rotate the face 180 degrees in the surgery preview.
 pose.head=[add(neck,-1,0,10*scale),add(neck,1,0,10*scale)];
 for(const limb of limbs){
  const {kind,side,key}=limb,extra=key.includes('-graft');
  const spineIndex=limb.anchor===undefined?(kind==='arm'?0:count):Math.min(count,limb.anchor);
  const rig=limbRig(anatomy,limb),[rootX,rootY]=rig.root;
  const root=add(spine[spineIndex],rootX,side*rootY,scale);
  const factor=scale*(limb.lengthScale??1);
  const [upper,lower]=rig.lengths.map(length=>length*factor);
  const a=extra?(kind==='arm'?.30:-.45):(kind==='arm'?.58:-.75);
  const b=side*Math.sqrt(1-a*a);
  const joint=add(root,a,b,upper);
  const a2=extra?(kind==='arm'?.36:-.5):(kind==='arm'?.74:-.8);
  const tip=add(joint,a2,side*Math.sqrt(1-a2*a2),lower);
  pose[`${key}-upper`]=[root,joint];
  pose[`${key}-lower`]=[joint,tip];
 }
 return pose;
}
export function towerPoseFit(pose,{width=470,height=200,padding=22}={}){
 const points=Object.values(pose).flat();
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const left=Math.min(...xs)-12,right=Math.max(...xs)+12;
 const top=Math.min(...ys)-18,bottom=Math.max(...ys)+18;
 const factor=Math.min((width-2*padding)/(right-left),(height-2*padding)/(bottom-top));
 return `translate(${width/2-factor*(left+right)/2} ${height/2-factor*(top+bottom)/2}) scale(${factor})`;
}
