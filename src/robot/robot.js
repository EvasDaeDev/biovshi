import { clamp } from '../utils/math.js';
import { descendants, finishMobility, leakOrigin, reactToHit, robotDamage, robotFailFromOilLoss, segmentGeometry } from "./anatomy.js";
import { allLimbs, attackPose, handEnd, handRest, headFrameAt, hornPoints, layoutBody, legRest, lengths, limbFrame, local, mixPose, origin, rest, savePose, sphereCenters, updateExtraLimbs, updateTail } from "./kinematics.js";
import { clearBone, clearCircle, clearanceAt, edgeClearance, freeBlockedJoint, limbClear, makeCapsules, nearestSurface, rigClear, validContact } from "./collision.js";
import { contacts, currentTargetVisible, hasGoal, retreatFromBoundary, robotTick, steerTo, updateHead, watchProgress } from "./locomotion.js";
import { coverOffset, hopHeight, jumpTick, lifted, planIdleHops, reboundPlan, reboundTick, robotBeginApproach, robotBeginCover, robotBeginScene, robotCanCover, robotCancelCover, robotCoverGap, robotEndScene, robotPerformIdle, robotPounce, robotReboundFrom, robotSetVisible, robotStartle, sceneEnvelope, scheduleIdle, settleHands, updateIdleHops, updateIdleScene, updateScene } from "./scenes.js";
import { bodyTransform, draw, robotPaint, visiblePoint, visionAngle, visualOffset, visualRotation } from "../render/robot.js";
import { el } from "../render/svg.js";
import { CONFIG } from "../config.js";
import { ctx } from "../game/state.js";
import { limbColor } from "../utils/colors.js";
import { ik } from "../utils/math.js";
import { robotCanSee } from "./perception.js";
import { createRobotSkin } from '../render/robot-skin.js';
import { createTorsoShadow } from '../render/ground-spots.js';
export
// Один робот: скелет, опоры, хвост, анимации и отрисовка.
function createRobot(id, start) {
  const robotState = {
    id,
    start
  };
  robotState.descendants = descendants.bind(null, robotState);
  robotState.segmentGeometry = segmentGeometry.bind(null, robotState);
  robotState.leakOrigin = leakOrigin.bind(null, robotState);
  robotState.finishMobility = finishMobility.bind(null, robotState);
  robotState.reactToHit = reactToHit.bind(null, robotState);
  robotState.local = local.bind(null, robotState);
  robotState.headFrameAt = headFrameAt.bind(null, robotState);
  robotState.allLimbs = allLimbs.bind(null, robotState);
  robotState.limbFrame = limbFrame.bind(null, robotState);
  robotState.handEnd = handEnd.bind(null, robotState);
  robotState.attackPose = attackPose.bind(null, robotState);
  robotState.hornPoints = hornPoints.bind(null, robotState);
  robotState.sphereCenters = sphereCenters.bind(null, robotState);
  robotState.updateExtraLimbs = updateExtraLimbs.bind(null, robotState);
  robotState.updateTail = updateTail.bind(null, robotState);
  robotState.layoutBody = layoutBody.bind(null, robotState);
  robotState.handRest = handRest.bind(null, robotState);
  robotState.legRest = legRest.bind(null, robotState);
  robotState.origin = origin.bind(null, robotState);
  robotState.lengths = lengths.bind(null, robotState);
  robotState.rest = rest.bind(null, robotState);
  robotState.savePose = savePose.bind(null, robotState);
  robotState.mixPose = mixPose.bind(null, robotState);
  robotState.clearanceAt = clearanceAt.bind(null, robotState);
  robotState.clearCircle = clearCircle.bind(null, robotState);
  robotState.clearBone = clearBone.bind(null, robotState);
  robotState.limbClear = limbClear.bind(null, robotState);
  robotState.rigClear = rigClear.bind(null, robotState);
  robotState.freeBlockedJoint = freeBlockedJoint.bind(null, robotState);
  robotState.edgeClearance = edgeClearance.bind(null, robotState);
  robotState.nearestSurface = nearestSurface.bind(null, robotState);
  robotState.validContact = validContact.bind(null, robotState);
  robotState.makeCapsules = makeCapsules.bind(null, robotState);
  robotState.hasGoal = hasGoal.bind(null, robotState);
  robotState.currentTargetVisible = currentTargetVisible.bind(null, robotState);
  robotState.steerTo = steerTo.bind(null, robotState);
  robotState.retreatFromBoundary = retreatFromBoundary.bind(null, robotState);
  robotState.watchProgress = watchProgress.bind(null, robotState);
  robotState.contacts = contacts.bind(null, robotState);
  robotState.updateHead = updateHead.bind(null, robotState);
  robotState.coverOffset = coverOffset.bind(null, robotState);
  robotState.scheduleIdle = scheduleIdle.bind(null, robotState);
  robotState.hopHeight = hopHeight.bind(null, robotState);
  robotState.planIdleHops = planIdleHops.bind(null, robotState);
  robotState.updateIdleHops = updateIdleHops.bind(null, robotState);
  robotState.sceneEnvelope = sceneEnvelope.bind(null, robotState);
  robotState.settleHands = settleHands.bind(null, robotState);
  robotState.lifted = lifted.bind(null, robotState);
  robotState.updateIdleScene = updateIdleScene.bind(null, robotState);
  robotState.updateScene = updateScene.bind(null, robotState);
  robotState.reboundPlan = reboundPlan.bind(null, robotState);
  robotState.reboundTick = reboundTick.bind(null, robotState);
  robotState.jumpTick = jumpTick.bind(null, robotState);
  robotState.visualOffset = visualOffset.bind(null, robotState);
  robotState.visualRotation = visualRotation.bind(null, robotState);
  robotState.visiblePoint = visiblePoint.bind(null, robotState);
  robotState.bodyTransform = bodyTransform.bind(null, robotState);
  robotState.draw = draw.bind(null, robotState);
  robotState.visionAngle = visionAngle.bind(null, robotState);
  robotState.glowId = 'tag7hop-glow-' + robotState.id;
  robotState.gradient = el('radialGradient', {
    id: robotState.glowId,
    gradientUnits: 'objectBoundingBox',
    cx:.5,cy:.5,r:.5
  }, ctx.lightGradients);
  for (const [offset, opacity] of [[0, 1], [.3, 1], [.55, .8], [.8, .3], [1, 0]]) el('stop', {
    offset,
    'stop-color': 'black',
    'stop-opacity': opacity
  }, robotState.gradient);
  robotState.vision = null;
  robotState.lightBeam = null;
  robotState.poolGradient = el('radialGradient', {
    id: 'tag7hop-pool-' + robotState.id,
    gradientUnits: 'objectBoundingBox',
    cx:.5,cy:.5,r:.5
  }, ctx.lightGradients);
  for (const [offset, opacity] of [[0, .17], [.5, .07], [1, 0]]) el('stop', {
    offset,
    'stop-color': 'var(--night-light)',
    'stop-opacity': opacity
  }, robotState.poolGradient);
  robotState.pool = el('circle', {
    cx:0,cy:0,r:CONFIG.light.nearbyRadiusCm,
    class: 'neon-pool',
    fill: 'url(#tag7hop-pool-' + robotState.id + ')'
  }, ctx.conesG);
  robotState.nearLight = el('circle', {
    cx:0,cy:0,r:CONFIG.light.nearbyRadiusCm,
    fill:'url(#'+robotState.glowId+')'
  },ctx.lightHoles);
  robotState.actor = el('g', {
    class: 'robot'
  }, ctx.actorsG);
  robotState.floor = el('g', {}, ctx.groundG);
  ctx.defs.querySelector('#tag7hop-victory-glow-'+robotState.id)?.remove();
  robotState.figure = el('g', {'data-robot-figure':robotState.id}, robotState.actor);
  robotState.limbG = el('g', {}, robotState.figure);
  robotState.bodyG = el('g', {}, robotState.figure);
  robotState.label = el('text', {
    class: 'robot-label',
    'text-anchor': 'middle'
  }, robotState.actor);
  robotState.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  robotState.x = robotState.start.x;
  robotState.y = robotState.start.y;
  robotState.angle = robotState.start.angle;
  robotState.vx = 0;
  robotState.vy = 0;
  robotState.t = 0;
  robotState.gait = 0;
  robotState.gaitBlend = 0;
  robotState.mode = 'crawl';
  robotState.eatTime = 0;
  robotState.bite = {
    x: 0,
    y: 0
  };
  robotState.target = {
    x: 0,
    y: 0
  };
  robotState.pelvis = {
    x: 0,
    y: 0,
    angle: 0
  };
  robotState.chest = {
    x: 0,
    y: 0,
    angle: 0
  };
  robotState.spine = [];
  robotState.tail = [];
  robotState.headFrame = {
    x: 0,
    y: 0,
    angle: 0
  };
  robotState.look = 0;
  robotState.turnRate = 0;
  robotState.arms = [];
  robotState.legs = [];
  robotState.extraLimbs = [];
  robotState.headCenter = {
    x: 0,
    y: 0
  };
  robotState.mouthPoint = {
    x: 0,
    y: 0
  };
  robotState.gazeYaw = robotState.start.angle;
  robotState.scanAngle = 0;
  robotState.scanDirection = 1;
  robotState.stuckFor = 0;
  robotState.recoveryUntil = 0;
  robotState.routePadding = 70 * ctx.scale;
  robotState.recoveries = 0;
  robotState.route = [];
  robotState.routeGoal = null;
  robotState.routeIndex = 0;
  robotState.requestedSpeed = 0;
  robotState.behavior = 'wander';
  robotState.nextStop = Infinity;
  robotState.currentIntent = {
    goal: {
      x: robotState.start.x + 50,
      y: robotState.start.y
    },
    speed: 0,
    mode: 'patrol',
    lookPoint: null
  };
  robotState.gesture = {
    kind: '',
    time: 0,
    weight: 0
  };
  robotState.hp = new Map();
  robotState.broken = new Set();
  robotState.hitAt = new Map();
  robotState.segments = ['head', ...Array.from({
    length: 4
  }, (_, i) => 'spine-' + i), ...['arm', 'leg'].flatMap(kind => [-1, 1].flatMap(side => [`${kind}-${side}-upper`, `${kind}-${side}-lower`])), ...(robotState.id === 3 ? Array.from({
    length: CONFIG.robot.tailSegments
  }, (_, i) => 'tail-' + i) : [])];
  robotState.maxHp = key => key === 'head' ? 5 : key === 'spine-3' ? 4 : CONFIG.combat.healthPerSegment;
  robotState.isDamageable = key => key !== 'spine-0';
  robotState.DAMAGEABLE_HP_TOTAL = robotState.segments.filter(robotState.isDamageable).reduce((sum, key) => sum + robotState.maxHp(key), 0);
  // 39 HP
  robotState.segments.forEach(key => robotState.hp.set(key, robotState.maxHp(key)));
  // Anatomical tree. Chest is the root: arms/head are attached there;
  // spine-0..3 form a front-to-back chain, with legs attached to the pelvis.
  robotState.parent = new Map([['spine-0', null], ['head', null]]);
  for (let i = 1; i < 4; i++) robotState.parent.set('spine-' + i, 'spine-' + (i - 1));
  for (const kind of ['arm', 'leg']) for (const side of [-1, 1]) {
    const upper = `${kind}-${side}-upper`,
      lower = `${kind}-${side}-lower`;
    robotState.parent.set(upper, kind === 'arm' ? null : 'spine-3');
    robotState.parent.set(lower, upper);
  }
  // Children of a severed node detach with it, regardless of remaining HP.
  robotState.healthy = key => !robotState.broken.has(key);
  robotState.hasHead = () => robotState.healthy('head');
  robotState.healthyLimb = l => robotState.healthy(`${l.kind}-${l.side}-upper`) && robotState.healthy(`${l.kind}-${l.side}-lower`);
  let anatomyRevision=-1,anatomy;
  const anatomyCounts=()=>{
    if(anatomyRevision!==robotState.broken.size){
      anatomyRevision=robotState.broken.size;
      anatomy={
        limbs:[...robotState.arms,...robotState.legs].filter(robotState.healthyLimb).length,
        arms:robotState.arms.filter(l=>robotState.healthy(`arm-${l.side}-upper`)).length,
        spine:Array.from({length:4},(_,i)=>'spine-'+i).filter(robotState.healthy).length,
      };
    }
    return anatomy;
  };
  robotState.movementLimbs = () => anatomyCounts().limbs;
  robotState.bledOut = false;
  robotState.hitReaction = null;
  robotState.recoilX = 0;
  robotState.recoilY = 0;
  robotState.mobile = () => robotState.movementLimbs() > 0 && !robotState.bledOut;
  robotState.armCount = () => anatomyCounts().arms;
  robotState.spineCount = () => anatomyCounts().spine;
  robotState.limbIntegrity = () => robotState.movementLimbs() / 4;
  robotState.anatomyColor = () => limbColor(robotState.movementLimbs(), 4);
  robotState.locomotion = () => clamp((.25 + .75 * robotState.movementLimbs() / 4) * (.50 + .50 * robotState.spineCount() / 4), 0, 1);
  robotState.turnAbility = () => clamp(.38 + .62 * robotState.spineCount() / 4, 0, 1) * (robotState.hasHead() ? 1 : .5);
  robotState.peerRobots = () => ctx.robots.filter(r => r.id !== robotState.id && r.mobile && Math.hypot(r.x - robotState.x, r.y - robotState.y) < 220 && !(robotState.leap?.kind === 'rebound' && robotState.leap.launched && r.id === robotState.leap.victim) && !(r.actualPose.leap?.kind === 'rebound' && r.actualPose.leap.launched && r.actualPose.leap.victim === robotState.id));
  robotState.extraWeight = 0;
  robotState.extraActive = false;
  robotState.trail = [];
  robotState.trailNodes = Array.from({
    length: CONFIG.trails.limit
  }, () => el('circle', {
    opacity: 0,
    r: CONFIG.trails.radiusCm,
    fill: 'var(--night-trail)',
    stroke: 'none'
  }, ctx.trailsG));
  robotState.lastFootTouches = new WeakMap();
  robotState.visible = true;
  createTorsoShadow(robotState);
  robotState.attackVisual = null;
  robotState.reboundEscape = null;
  robotState.coverHeightStart = 0;
  robotState.scene = null;
  robotState.headMotion = 0;
  robotState.leap = null;
  robotState.lastLeap = -99;
  robotState.fearCooldown = -99;
  robotState.idleKinds = ['stretch', 'scratch', 'hops'];
  robotState.idleSequence = robotState.id;
  robotState.nextIdleAt = ctx.game.time + 8 + robotState.id * 3;
  robotState.neck = el('path', {'stroke-width':3*ctx.scale}, robotState.bodyG);
  for (const side of [-1,1]) for (const kind of ['arm','leg']) {
    const l={kind,side,phase:1,foot:{x:0,y:0},from:{x:0,y:0},to:{x:0,y:0}};
    (kind==='arm'?robotState.arms:kind==='leg'?robotState.legs:robotState.extraLimbs).push(l);
  }
  robotState.horns=[];robotState.spheres=[];robotState.spineBones=[];robotState.spineDots=[];
  robotState.tailPath=null;robotState.tailDots=[];robotState.tailBones=[];
  robotState.ensureFallback=()=>{
    if(!robotState.fallbackBody){
      robotState.fallbackBody=el('g',{'data-robot-fallback':'body'},robotState.bodyG);
      robotState.fallbackLimbs=el('g',{'data-robot-fallback':'limbs'},robotState.limbG);
      robotState.sphereLayer = el('g', {
        class: 'sphere-under-spine'
      }, robotState.fallbackBody);
      robotState.torso = el('path', {
        fill: 'none',
        class: 'shirt',
        'stroke-width': CONFIG.robot.vertebraBaseCm * ctx.scale
      }, robotState.fallbackBody);
      robotState.spineBones = Array.from({
        length: 4
      }, () => el('path', {
        fill: 'none',
        class: 'shirt',
        'stroke-width': CONFIG.robot.vertebraBaseCm * ctx.scale
      }, robotState.fallbackBody));
      robotState.head = el('ellipse', {
        class: 'head'
      }, robotState.fallbackBody);
      robotState.nose = el('path', {
        'stroke-width': 2 * ctx.scale,
        fill: 'none'
      }, robotState.fallbackBody);
      robotState.mouth = el('ellipse', {
        fill: 'var(--foreground)',
        stroke: 'none'
      }, robotState.fallbackBody);
      robotState.pelvicBar = el('path', {
        'stroke-width': 3 * ctx.scale
      }, robotState.fallbackBody);
      robotState.shoulderBar = el('path', {
        class: 'shirt',
        fill: 'none',
        'stroke-width': 3 * ctx.scale,
        'stroke-linecap': 'round'
      }, robotState.fallbackBody);
      robotState.horns = robotState.id === 1 ? [-1, 1].map(() => el('path', {
        class: 'robot-horn',
        fill: 'none',
        'stroke-width': 3 * ctx.scale,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      }, robotState.fallbackBody)) : [];
      robotState.spheres = robotState.id === 2 ? [-1, 1].map(() => el('circle', {
        class: 'head robot-sphere',
        r: CONFIG.robot.sphereRadiusCm,
        'stroke-width': 3 * ctx.scale
      }, robotState.sphereLayer)) : [];
      robotState.spineDots = Array.from({
        length: 5
      }, () => el('circle', {
        r: 2 * ctx.scale,
        fill: 'var(--background)'
      }, robotState.fallbackBody));
      for(const l of [...robotState.arms,...robotState.legs])Object.assign(l,{
        upper:el('path',{'stroke-width':3*ctx.scale,fill:'none'},robotState.fallbackLimbs),
        lower:el('path',{'stroke-width':3*ctx.scale,fill:'none'},robotState.fallbackLimbs),
        joint:el('circle',{r:3*ctx.scale},robotState.fallbackLimbs),
        endShape:el('circle',{r:3*ctx.scale},robotState.fallbackLimbs),
      });
    }
    robotState.bodyG.insertBefore(robotState.fallbackBody,robotState.neck);
    robotState.limbG.insertBefore(robotState.fallbackLimbs,robotState.limbG.firstChild);
  };
  robotState.detachFallback=()=>{
    robotState.fallbackBody?.remove();robotState.fallbackLimbs?.remove();
  };
  const skinKey=['robotA','robotB','robotC','robotD'][robotState.id];
  if(!ctx.textureAssets?.[skinKey]?.loaded)robotState.ensureFallback();
  robotState.boundaryBlockedFor = 0;
  robotState.boundaryRecovery = false;
  robotState.recoveryDirection = null;
  robotState.recoverySwing = null;
  robotState.recoveryStepIndex = 0;
  robotState.recoveryStartedAt = 0;
  robotState.api = {
    id: robotState.id,
    actor: robotState.actor,
    vision: robotState.vision,
    label: robotState.label,
    lightBeam: robotState.lightBeam,
    nearLight: robotState.nearLight,
    flashHitLight() { robotState.lightHitAt = ctx.game.time; },
    gradient: robotState.gradient,
    capsules: [],
    get x() {
      return robotState.x;
    },
    get y() {
      return robotState.y;
    },
    get angle() {
      return robotState.angle;
    },
    get eye() {
      return robotState.local(robotState.headFrame, 25 + robotState.headMotion, 0);
    },
    get gaze() {
      return robotState.headFrame.angle;
    },
    get center() {
      return robotState.local(robotState.chest, -18, 0);
    },
    get velocity() {
      return {
        x: robotState.vx,
        y: robotState.vy
      };
    },
    get state() {
      return robotState.scene ? robotState.mode : robotState.leap ? robotState.leap.kind === 'rebound' ? ctx.game.time - robotState.leap.started < robotState.leap.turnDuration ? 'turn-rebound' : 'rebound' : robotState.leap.launched ? 'pounce' : 'pounce-turn' : robotState.currentIntent.mode;
    },
    get limbs() {
      return robotState.allLimbs();
    },
    get extraLimbs() {
      return robotState.extraLimbs;
    },
    get extraWeight() {
      return robotState.extraWeight;
    },
    get extraActive() {
      return robotState.extraActive;
    },
    get segmentCount() {
      return robotState.segments.length - robotState.broken.size;
    },
    get segmentTotal() {
      return robotState.segments.length;
    },
    get movementLimbs() {
      return robotState.movementLimbs();
    },
    get armCount() {
      return robotState.armCount();
    },
    get spineCount() {
      return robotState.spineCount();
    },
    get limbIntegrity() {
      return robotState.limbIntegrity();
    },
    get robotColor() {
      return robotState.anatomyColor();
    },
    get locomotion() {
      return robotState.locomotion();
    },
    get turnAbility() {
      return robotState.turnAbility();
    },
    attackPose(p) {
      return robotState.attackPose(p);
    },
    get attackSources() {
      const result = [];
      for (const l of [...robotState.arms,...robotState.legs]) if (robotState.healthy(`${l.kind}-${l.side}-upper`)) {
        const whole = robotState.healthy(`${l.kind}-${l.side}-lower`);
        const [u, v] = robotState.lengths(l),
          shoulder = robotState.origin(l);
        const joint = ik(shoulder, robotState.handEnd(l), u, v, l.side).joint;
        result.push({
          kind: l.kind,
          side: l.side,
          point: whole ? {
            ...l.foot
          } : {
            ...joint
          },
          key: `${l.kind}-${l.side}-${whole ? 'lower' : 'upper'}`,
          reachFactor: whole ? 1 : .5
        });
      }
      if (robotState.hasHead()) result.push({
        kind: 'head',
        side: 0,
        point: robotState.api.eye,
        key: 'head'
      });
      return result;
    },
    get mobile() {
      return robotState.mobile();
    },
    reactToHit(attacker, segment) {
      robotState.reactToHit(attacker, segment);
    },
    failFromOilLoss: robotFailFromOilLoss.bind(null, robotState),
    get hasHead() {
      return robotState.hasHead();
    },
    get destroyed() {
      return robotState.broken.size === robotState.segments.length;
    },
    get hp() {
      return robotState.hp;
    },
    get maxHp() {
      return robotState.maxHp;
    },
    get damageableHpTotal() {
      return robotState.DAMAGEABLE_HP_TOTAL;
    },
    isDamageable(key) {
      return robotState.isDamageable(key);
    },
    damage: robotDamage.bind(null, robotState),
    get actualPose() {
      return {
        chest: robotState.chest,
        pelvis: robotState.pelvis,
        spine: robotState.spine,
        headFrame: robotState.headFrame,
        look: robotState.look,
        headMotion: robotState.headMotion,
        scene: robotState.scene,
        leap: robotState.leap,
        tail: robotState.tail,
        offset: robotState.visualOffset()
      };
    },
    leakOrigin(key) {
      return robotState.leakOrigin(key);
    },
    get trail() {
      return robotState.trail;
    },
    get trailNodes() {
      return robotState.trailNodes;
    },
    get recoveryCount() {
      return robotState.recoveries;
    },
    get visible() {
      return robotState.visible;
    },
    setVisible: robotSetVisible.bind(null, robotState),
    canSee: robotCanSee.bind(null, robotState),
    clear() {
      return robotState.rigClear();
    },
    performIdle: robotPerformIdle.bind(null, robotState),
    startle: robotStartle.bind(null, robotState),
    canCover: robotCanCover.bind(null, robotState),
    beginApproach: robotBeginApproach.bind(null, robotState),
    trackCover(victim) {
      robotState.attackVisual = robotState.coverOffset(victim);
    },
    coverGap: robotCoverGap.bind(null, robotState),
    cancelCover: robotCancelCover.bind(null, robotState),
    beginCover: robotBeginCover.bind(null, robotState),
    reboundFrom: robotReboundFrom.bind(null, robotState),
    redirectPounce(goal) {
      if (robotState.leap && robotState.leap.kind !== 'rebound' && !robotState.leap.launched) robotState.leap.goal = {
        ...goal
      };
    },
    pounce: robotPounce.bind(null, robotState),
    beginScene: robotBeginScene.bind(null, robotState),
    endScene: robotEndScene.bind(null, robotState),
    tick: robotTick.bind(null, robotState),
    paint: robotPaint.bind(null, robotState)
  };
  robotState.layoutBody(0);
  for (const l of robotState.allLimbs()) {
    l.foot = robotState.rest(l);
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
    l.phase = 1;
  }
  for (const l of robotState.extraLimbs) {
    l.foot = robotState.local(robotState.spine[2], 0, l.side * 16);
    l.from = {
      ...l.foot
    };
    l.to = {
      ...l.foot
    };
  }
  robotState.api.capsules = robotState.makeCapsules();
  createRobotSkin(robotState);
  return robotState.api;
}
// Слух — короткие звуковые импульсы от шагов, а не знание позиции врага.
