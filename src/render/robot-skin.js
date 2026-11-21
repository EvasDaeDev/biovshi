import {limbKey} from '../robot/body.js';
import {patientSkin,patientGarage} from '../game/patients.js';
import { ASSETS, assetUrl } from '../assets/manifest.js';
import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';
import {towerUpgradeAtlas,towerUpgradeRarity,towerRaritySvgFilter} from '../tower/upgrade-appearance.js';
import {createSkinReadiness} from './skin-readiness.js';

// r_01..r_04: 256×256, 4×4 cells. All joint axes use y=32.
// Head and chest anchors are explicitly calibrated in atlas pixels;
// their span also controls texture scale through skinMatrix.
// An ordinary hit gives only the exact contacted bone a subtle red flash.
// A critical hit keeps the existing crit/sever VFX instead of stacking tints.
// The damage event writes ONLY the directly hit segment; neither child nor
// sibling segments inherit this effect. Criticals are tracked separately.
export const SEGMENT_HIT_TINT=.40;
export const SEGMENT_HIT_TINT_SEC=.30;
export const SEGMENT_CRIT_TINT_SEC=.48;
export function recordSegmentHitTint(robot,key,time,damage){
 if(damage>=2){
  robot.segmentHitTints?.delete(key);
  (robot.segmentCritTints??=new Map()).set(key,time);
 }else{
  robot.segmentCritTints?.delete(key);
  (robot.segmentHitTints??=new Map()).set(key,time);
 }
}
// Flat ordinary flash: 40% for 300 ms, then immediately off.
export function segmentHitTint(time,hitAt){
 if(!Number.isFinite(hitAt)||!Number.isFinite(time))return 0;
 const age=time-hitAt;
 return age>=0&&age<SEGMENT_HIT_TINT_SEC?SEGMENT_HIT_TINT:0;
}
// Critical flash: 100% additive red at impact, smoothly fades to zero.
export function segmentCritTint(time,hitAt){
 if(!Number.isFinite(hitAt)||!Number.isFinite(time))return 0;
 const age=time-hitAt;
 return age>=0&&age<SEGMENT_CRIT_TINT_SEC?
  1-age/SEGMENT_CRIT_TINT_SEC:0;
}
export function segmentHitTintMatrix(strength){
 const keep=1-strength;
 return [keep,0,0,0,strength,
         0,keep,0,0,0,
         0,0,keep,0,0,
         0,0,0,1,0];
}

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

function createPiece(key,url,parent,part=ROBOT_PARTS[key],rarity=0) {
  if (!part) return null;
  const group=el('g',{'data-skin-segment':key,stroke:'none',...(rarity?{'data-tower-rarity':rarity}:{}),
    ...(rarity?{filter:towerRaritySvgFilter(ctx.svg,rarity)}:{})},parent);
  const viewport=el('svg',{
    x:0,y:0,width:64,height:64,
    viewBox:`${part.col*64} ${part.row*64} 64 64`,
    overflow:'hidden',preserveAspectRatio:'none',
  },group);
  const image=el('image',{
    href:url,x:0,y:0,width:256,height:256,preserveAspectRatio:'none',
    style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':'',
  },viewport);
  return {group,viewport,image,part,url,rarity,critOverlay:null};
}

export function createRobotSkin(robot) {
  const assetKey=robot.body?.skinKey??['robotA','robotB','robotC','robotD'][patientSkin(robot.id)];
  const url=assetUrl(ASSETS.textures[assetKey]);
  if (!url || ctx.textureAssets?.[assetKey]?.loaded===false) return;
  const limbs=el('g',{'data-skin-layer':'limbs',display:'none'},robot.limbG);
  const body=el('g',{'data-skin-layer':'body',display:'none'},robot.bodyG);
  const pieces=new Map();
  const skin=robot.skin={url,limbs,body,pieces,ready:false};
  const activate=ready=>{
    const wasReady=skin.ready;
    if(ready)robot.detachFallback();else robot.ensureFallback();
    skin.ready=ready;
    robot.neck.style.stroke=ready?'#a78a70':'';
    for(const node of [limbs,body])attr(node,'display',ready?'':'none');
    attr(robot.actor,'data-skin-ready',ready);
    if(wasReady!==ready)robot.draw(0);
  };
  // Back-to-front body order; head remains above the chest, limbs below it.
  const parts=robot.skinParts??ROBOT_PARTS;
  const keys=robot.skinParts?Object.keys(parts):[...Object.keys(ROBOT_PARTS).filter(k=>/^(arm|leg)/.test(k)),
    'spine-3','spine-2','spine-1','spine-0','head'];
  // Extra anatomical cells must finish loading before removing the vector
  // silhouette. The normal actor renderer retains its previous fast path.
  const guarded=Boolean(robot.skinParts)&&ctx.mode==='tower'&&robot.id===0;
  const gate=guarded?createSkinReadiness(keys,()=>activate(true),()=>activate(false)):null;
  if(guarded)robot.ensureFallback();
  for(const key of keys) {
    const android=robot.prosthetics.includes(key)&&ctx.textureAssets?.robotAndroid?.loaded!==false;
    const replacement=ctx.mode==='tower'&&robot.id===0?
      towerUpgradeAtlas(patientGarage()?.[0],key):null;
    const spriteUrl=replacement?assetUrl(replacement):
      android?assetUrl(ASSETS.textures.robotAndroid):url;
    const rarity=replacement?towerUpgradeRarity(patientGarage()?.[0],key):0;
    const piece=createPiece(key,spriteUrl,/^(arm|leg)/.test(key)?limbs:body,parts[key],rarity);
    piece.image.parentNode.setAttribute('data-fallback-src',android?assetUrl(ASSETS.textures.robotAndroid):url);
    piece.image.addEventListener('load',()=>{
      if(gate)gate.loaded(key);else activate(true);
    },{once:true});
    if(replacement){
      piece.image.addEventListener('error',()=>{
        const fallbackUrl=android?assetUrl(ASSETS.textures.robotAndroid):url;
        if(piece.url!==fallbackUrl){
          piece.url=fallbackUrl;
          attr(piece.image,'href',fallbackUrl);
          return;
        }
        if(gate)gate.failed(key);else activate(false);
      });
    }else piece.image.addEventListener('error',()=>{
      if(gate)gate.failed(key);else activate(false);
    });
    pieces.set(key,piece);
  }
  attr(robot.actor,'data-skin','r_0'+(robot.id+1));
  if(ctx.textureAssets?.[assetKey]?.loaded&&!guarded)activate(true);
  // The fallback is not just attached; it must already have visible geometry
  // while asynchronous SVG <image> elements decode.
  if(guarded)robot.draw(0);
}

export function paintRobotSkin(robot,strikePoses=[]) {
  if (!robot.skin?.ready) return;
  const strikePose=strikePoses.find(p=>p.kind==='head');
  const position=(key,a,b)=>{
    const piece=robot.skin.pieces.get(key);
    if(!piece)return;
    const healthy=robot.healthy(key);
    attr(piece.group,'display',healthy?'':'none');
    if(!healthy)return;
    attr(piece.group,'transform','matrix('+skinMatrix(a,b,piece.part).join(' ')+')');
    const normalAt=robot.segmentHitTints?.get(key);
    const strength=segmentHitTint(ctx.game.time,normalAt);
    // The 40% tint is applied to the cropped texture viewport, not its
    // bone group (which could also hold ornaments / other geometry).
    attr(piece.viewport,'data-hit-tint',strength.toFixed(4));
    if(strength>0){
      if(!piece.hitFilter){
        const id='tag7hop-hit-tint-'+robot.id+'-'+key.replace(/[^a-z0-9-]/gi,'_');
        const filter=el('filter',{id,x:'-10%',y:'-10%',width:'120%',height:'120%'},ctx.defs);
        const matrix=el('feColorMatrix',{type:'matrix'},filter);
        piece.hitFilter={matrix,id};
      }
      attr(piece.viewport,'filter','url(#'+piece.hitFilter.id+')');
      attr(piece.hitFilter.matrix,'values',segmentHitTintMatrix(strength).join(' '));
    }else{
      if(piece.hitFilter)attr(piece.viewport,'filter','none');
      if(normalAt!==undefined)robot.segmentHitTints.delete(key);
    }
    const critAt=robot.segmentCritTints?.get(key);
    const crit=segmentCritTint(ctx.game.time,critAt);
    if(crit>0){
      if(!piece.critOverlay){
        // A second clipped atlas sprite draws in additive mode. For SVG the
        // plus-lighter blend works on the actual image; Pixi maps this
        // special viewport to a native sprite with blendMode='add'.
        const overlay=el('svg',{
          x:0,y:0,width:64,height:64,
          viewBox:`${piece.part.col*64} ${piece.part.row*64} 64 64`,
          overflow:'hidden',preserveAspectRatio:'none',
          'data-hit-crit-overlay':'true',
          'data-fallback-src':piece.viewport.getAttribute('data-fallback-src')??piece.url,
          style:'mix-blend-mode:plus-lighter'
        },piece.group);
        const id='tag7hop-crit-tint-'+robot.id+'-'+key.replace(/[^a-z0-9-]/gi,'_');
        const filter=el('filter',{id,x:'-10%',y:'-10%',width:'120%',height:'120%'},ctx.defs);
        el('feColorMatrix',{type:'matrix',values:segmentHitTintMatrix(1).join(' ')},filter);
        const image=el('image',{href:piece.image.getAttribute('href'),x:0,y:0,width:256,height:256,
          preserveAspectRatio:'none',filter:'url(#'+id+')',
          style:CONFIG.rendering.texturePixelated?'image-rendering:crisp-edges;image-rendering:pixelated':''},overlay);
        piece.critOverlay={viewport:overlay,image};
      }
      // Follow fallback skin changes: overlay must use the same atlas cell.
      attr(piece.critOverlay.image,'href',piece.image.getAttribute('href'));
      attr(piece.critOverlay.viewport,'opacity',crit.toFixed(4));
      attr(piece.critOverlay.viewport,'display','');
    }else{
      if(piece.critOverlay)attr(piece.critOverlay.viewport,'display','none');
      if(critAt!==undefined)robot.segmentCritTints.delete(key);
    }
  };
  for(let i=0;i<(robot.spineSegmentTotal??4);i++) {
    position('spine-'+i,robot.spine[i],robot.spine[i+1]);
  }
  const head=robot.headCenter;
  const offset=strikePose?.kind==='head'?{
    x:strikePose.tip.x-strikePose.base.x,y:strikePose.tip.y-strikePose.base.y,
  }:{x:0,y:0};
  const dx=Math.cos(robot.headFrame.angle)*10*(robot.body?.headSizeFactor??1)*(robot.scale??ctx.scale);
  const dy=Math.sin(robot.headFrame.angle)*10*(robot.body?.headSizeFactor??1)*(robot.scale??ctx.scale);
  position('head',{x:head.x+offset.x-dx,y:head.y+offset.y-dy},
    {x:head.x+offset.x+dx,y:head.y+offset.y+dy});
  for(const limb of [...robot.arms,...robot.legs]) {
    if (!limb.pose) continue;
    const [a,joint,end]=limb.pose,key=`${limbKey(limb)}-`;
    position(key+'upper',a,joint);
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
  return {key,part:piece.part,url:piece.url,rarity:piece.rarity,transform:transforms.join(' '),hat:key==='head'?patientGarage()?.[robot.id]?.head?.hat:null};
}

export function drawDetachedSkin(snapshot,parent) {
  const piece=createPiece(snapshot.key,snapshot.url,parent,snapshot.part,snapshot.rarity??0);
  if (!piece) return false;
  attr(piece.group,'transform',snapshot.transform);
  if(snapshot.hat){const hat=createHat(snapshot.hat,parent);attr(hat,'transform',snapshot.transform);}
  return true;
}

export function createHat(hat,parent){
  const viewport=el('svg',{x:0,y:0,width:64,height:64,viewBox:'0 0 64 64',overflow:'hidden',preserveAspectRatio:'none'},parent);
  el('image',{href:assetUrl(ASSETS.textures['hat'+hat]),x:0,y:0,width:64,height:64},viewport);
  return viewport;
}
export function paintHeadDecor(robot,strikePose){
  const hat=!robot.mobile()&&robot.decorHatId?robot.decorHatId:patientGarage()?.[robot.id]?.head?.hat;
  if(robot.decorHatId!==hat){robot.decorHat?.remove();robot.decorHat=hat?createHat(hat,robot.bodyG):null;robot.decorHatId=hat;}
  if(!robot.decorHat)return;
  attr(robot.decorHat,'display',robot.healthy('head')?'':'none');
  const dx=Math.cos(robot.headFrame.angle)*10*(robot.body?.headSizeFactor??1)*(robot.scale??ctx.scale),dy=Math.sin(robot.headFrame.angle)*10*(robot.body?.headSizeFactor??1)*(robot.scale??ctx.scale);
  const offset=strikePose?.kind==='head'?{x:strikePose.tip.x-strikePose.base.x,y:strikePose.tip.y-strikePose.base.y}:{x:0,y:0};
  const head=robot.headCenter;
  attr(robot.decorHat,'transform','matrix('+skinMatrix({x:head.x+offset.x-dx,y:head.y+offset.y-dy},{x:head.x+offset.x+dx,y:head.y+offset.y+dy},ROBOT_PARTS.head).join(' ')+')');
}
