import { ASSETS, assetUrl } from '../assets/manifest.js';
import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';

// r_01..r_04: 256×256, 4×4 cells. All joint axes use y=32.
// Head and chest anchors are explicitly calibrated in atlas pixels;
// their span also controls texture scale through skinMatrix.
export const ROBOT_PARTS = {
  head: {col:0,row:0,from:33,to:8},
  // Translate the entire chest 22 px right; preserve its 24 px anchor span.
  'spine-0': {col:1,row:0,from:30,to:54,widthScale:4/3},
  'spine-1': {col:2,row:0,from:8,to:32,widthScale:4/3},
  'spine-2': {col:3,row:0,from:8,to:32,widthScale:4/3},
  'spine-3': {col:0,row:1,from:8,to:32,widthScale:4/3},
  'arm--1-upper': {col:0,row:2},
  'arm--1-lower': {col:1,row:2},
  'arm-1-upper': {col:2,row:2},
  'arm-1-lower': {col:3,row:2},
  'leg--1-upper': {col:0,row:3},
  'leg--1-lower': {col:1,row:3},
  'leg-1-upper': {col:2,row:3},
  'leg-1-lower': {col:3,row:3},
};

export function skinMatrix(a,b,part) {
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
  const from=part.from??8,to=part.to??56;
  // Width changes perpendicular to the bone; its length and joint anchors stay fixed.
  // All four torso sections widen visually; limb roots come from unchanged kinematics.
  const sx=length/(to-from),sy=sx*(part.widthScale??1);
  const ux=length?dx/length:1,uy=length?dy/length:0;
  const A=ux*sx,B=uy*sx,C=-uy*sy,D=ux*sy;
  return [A,B,C,D,a.x-A*from-C*32,a.y-B*from-D*32];
}

function createPiece(key,url,parent) {
  const part=ROBOT_PARTS[key];
  if (!part) return null;
  const group=el('g',{'data-skin-segment':key,stroke:'none'},parent);
  const viewport=el('svg',{
    x:0,y:0,width:64,height:64,
    viewBox:`${part.col*64} ${part.row*64} 64 64`,
    overflow:'hidden',preserveAspectRatio:'none',
  },group);
  const image=el('image',{
    href:url,x:0,y:0,width:256,height:256,preserveAspectRatio:'none',
    style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':'',
  },viewport);
  return {group,image,part};
}

export function createRobotSkin(robot) {
  const assetKey=['robotA','robotB','robotC','robotD'][robot.id];
  const url=assetUrl(ASSETS.textures[assetKey]);
  if (!url) return;
  const limbs=el('g',{'data-skin-layer':'limbs',display:'none'},robot.limbG);
  const body=el('g',{'data-skin-layer':'body',display:'none'},robot.bodyG);
  const pieces=new Map();
  const vectors=[robot.torso,robot.head,robot.nose,robot.mouth,
    robot.shoulderBar,robot.pelvicBar,...robot.spineBones,...robot.spineDots,
    ...robot.horns,...robot.spheres,
    ...[...robot.arms,...robot.legs].flatMap(l=>[l.upper,l.lower,l.joint,l.endShape])];
  const skin=robot.skin={url,limbs,body,pieces,vectors,ready:false};
  const activate=ready=>{
    skin.ready=ready;
    for(const node of vectors)node.style.visibility=ready?'hidden':'';
    robot.neck.style.stroke=ready?'#a78a70':'';
    for(const node of [limbs,body])attr(node,'display',ready?'':'none');
    attr(robot.actor,'data-skin-ready',ready);
  };
  // Back-to-front body order; head remains above the chest, limbs below it.
  const keys=[...Object.keys(ROBOT_PARTS).filter(k=>/^(arm|leg)/.test(k)),
    'spine-3','spine-2','spine-1','spine-0','head'];
  for(const key of keys) {
    const piece=createPiece(key,url,/^(arm|leg)/.test(key)?limbs:body);
    piece.image.addEventListener('load',()=>activate(true),{once:true});
    piece.image.addEventListener('error',()=>activate(false));
    pieces.set(key,piece);
  }
  attr(robot.actor,'data-skin','r_0'+(robot.id+1));
}

export function paintRobotSkin(robot,strikePose=null) {
  if (!robot.skin) return;
  const position=(key,a,b)=>{
    const piece=robot.skin.pieces.get(key);
    attr(piece.group,'display',robot.healthy(key)?'':'none');
    if (robot.healthy(key))attr(piece.group,'transform',
      'matrix('+skinMatrix(a,b,piece.part).join(' ')+')');
  };
  for(let i=0;i<4;i++) {
    position('spine-'+i,robot.spine[i],robot.spine[i+1]);
  }
  const head=robot.headCenter;
  const offset=strikePose?.kind==='head'?{
    x:strikePose.tip.x-strikePose.base.x,y:strikePose.tip.y-strikePose.base.y,
  }:{x:0,y:0};
  const dx=Math.cos(robot.headFrame.angle)*10*ctx.scale;
  const dy=Math.sin(robot.headFrame.angle)*10*ctx.scale;
  position('head',{x:head.x+offset.x-dx,y:head.y+offset.y-dy},
    {x:head.x+offset.x+dx,y:head.y+offset.y+dy});
  for(const limb of [...robot.arms,...robot.legs]) {
    if (!limb.pose) continue;
    const [a,joint,end]=limb.pose,key=`${limb.kind}-${limb.side}-`;
    const stump=strikePose?.kind==='arm'&&strikePose.limb===limb&&!strikePose.complete;
    position(key+'upper',a,stump?strikePose.tip:joint);
    position(key+'lower',joint,end);
  }
}

export function snapshotRobotSkin(robot,key) {
  if (!robot.skin?.ready) return null;
  const piece=robot.skin.pieces.get(key);
  if (!piece?.group.getAttribute('transform')) return null;
  const transforms=[];
  // Include jump scaling, recoil and the actor offset, but not camera/viewBox.
  for(let node=piece.group;node&&node!==ctx.actorsG;node=node.parentNode) {
    const transform=node.getAttribute?.('transform');
    if (transform)transforms.unshift(transform);
  }
  return {key,url:robot.skin.url,transform:transforms.join(' ')};
}

export function drawDetachedSkin(snapshot,parent) {
  const piece=createPiece(snapshot.key,snapshot.url,parent);
  if (!piece) return false;
  attr(piece.group,'transform',snapshot.transform);
  return true;
}
