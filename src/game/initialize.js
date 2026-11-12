import {initializeStreamerMascot} from '../ui/streamer-mascot.js';
import {towerEnemyCount} from '../tower/model.js';
import {arenaDefinition} from './arenas.js';
import {initializeCombatLog} from '../ui/combat-log.js';
import {bettingLoad,bettingSave} from '../betting/storage.js';
import {betCommit,betRefund} from '../betting/ledger.js';
import {bettingOpen,bettingHud} from '../betting/ui.js';
import {formatChips} from '../ui/currency.js';
import {initializeHints} from '../ui/hints.js';
import { initializeArenaExpand } from '../ui/arena-expand.js';
import { initializeSettings } from '../ui/settings.js';
import { initializeOrientation } from '../ui/orientation.js';
import { createWalls } from '../render/walls.js';
import { createObstacleLights } from '../render/ground-spots.js';
import { initializeHitEffects } from '../render/hit-effects.js';
import { initializePerformance } from '../render/performance.js';
import { clamp } from '../utils/math.js';
import { random } from '../utils/random.js';
import { ctx } from "./state.js";
import { fitField, togglePause, toggleSpeed, setTimeScale } from "../ui/controls.js";
import { CONFIG } from "../config.js";
import { obstacleVertices, polygonPlanes, rebuildRobots } from "./arena.js";
import { attr, el } from "../render/svg.js";
import { makeRobotCard } from "../ui/telemetry.js";
import { drawGrid, drawFloorDecals } from "../render/arena.js";
import { beginGame, resetRound } from "./session.js";
import { cameraReset } from "../render/camera.js";
import { paint } from "../render/frame.js";
import { bettingCancel, bettingInit } from "../betting/ui.js";
import { resetFrameClock } from "./clock.js";
import { frame } from "./loop.js";
export function initializeGame({textures=null,arenaId='ward',session=null,entry='auto',tower=null}={}) {
  // Dispose against the old bindings, then start from the original scene markup.
  // Reusing mutated SVG definitions can bake the previous arena into new layers.
  const root=document.getElementById('robot-tag-hops-v22');
  root.__disposeTag?.();
  const svg=root.querySelector('#tag7hop-field');
  if(root.__arenaSvgTemplate===undefined)root.__arenaSvgTemplate=svg.innerHTML;
  else svg.innerHTML=root.__arenaSvgTemplate;
  ctx.mode=tower?'tower':'spectator';
  root.dataset.gameMode=ctx.mode;
  if(tower)ctx.betting=session;
  ctx.towerRun=tower;
  ctx.towerGarage=tower?Array.from({length:towerEnemyCount(tower)+1},(_,id)=>({stats:id===0?[...tower.stats]:[3,3,3],head:null})):null;
  ctx.textureAssets=textures;
  ctx.root = root;
  ctx.svg = ctx.root.querySelector('#tag7hop-field');
  ctx.grid = ctx.root.querySelector('#tag7hop-grid');
  ctx.conesG = ctx.root.querySelector('#tag7hop-cones');
  ctx.groundG = ctx.root.querySelector('#tag7hop-ground');
  ctx.actorsG = ctx.root.querySelector('#tag7hop-actors');
  ctx.button = ctx.root.querySelector('#tag7hop-pause');
  ctx.speedButton = ctx.root.querySelector('#tag7hop-speed');
  ctx.resetButton = ctx.root.querySelector('#tag7hop-reset');
  ctx.timerOutput = ctx.root.querySelector('#tag7hop-timer');
  ctx.status = ctx.root.querySelector('#tag7hop-status');
  ctx.roles = ctx.root.querySelector('#tag7hop-roles');
  ctx.lightHoles = ctx.root.querySelector('#tag7hop-light-holes');
  ctx.lightGradients = ctx.root.querySelector('#tag7hop-gradients');
  ctx.trailsG = ctx.root.querySelector('#tag7hop-trails');
  ctx.pulsesG = ctx.root.querySelector('#tag7hop-pulses');
  ctx.sparksG = ctx.root.querySelector('#tag7hop-sparks');
  ctx.scoreG = ctx.root.querySelector('#tag7hop-score');
  ctx.arenaContent = ctx.root.querySelector('#tag7hop-arena-content');
  ctx.NS = 'http://www.w3.org/2000/svg';
  ctx.floorImage?.remove();ctx.floorImage=null;ctx.floorCanvas=null;
  ctx.arenaId=arenaDefinition(arenaId).id;ctx.arenaDefinition=arenaDefinition(arenaId);
  for (const g of [ctx.grid, ctx.conesG, ctx.groundG, ctx.actorsG, ctx.lightHoles, ctx.lightGradients, ctx.trailsG, ctx.pulsesG, ctx.sparksG, ctx.scoreG]) g.replaceChildren();
  ctx.roles.replaceChildren();
  ctx.intro = ctx.root.querySelector('#tag7hop-intro');
  ctx.startButton = ctx.root.querySelector('#tag7hop-start');
  ctx.resultsPanel = ctx.root.querySelector('#gladiator-results');
  ctx.resultsAgain = ctx.root.querySelector('#gladiator-results-again');
  ctx.resultsProcedure=ctx.root.querySelector('#gladiator-results-procedure');
  ctx.resultsTitle = ctx.root.querySelector('#gladiator-results-title');
  ctx.resultsSummary = ctx.root.querySelector('#gladiator-results-summary');
  ctx.resultsTotals = ctx.root.querySelector('#gladiator-results-totals');
  ctx.resultsRows = ctx.root.querySelector('#gladiator-results-rows');
  ctx.startup = {
    phase: 'intro',
    elapsed: 0,
    nextIndex: 0,
    order: []
  };
  ctx.intro.hidden = false;
  ctx.disposed = false;
  ctx.paused = false;
  ctx.settingsOpen = false;
  ctx.telemetryPortraitsReady = false;
  ctx.frameId = 0;
  ctx.cameraDebt = 0;
  ctx.observer = null;
  ctx.root.__disposeTag = () => {
    ctx.disposed = true;
    ctx.observer?.disconnect();
    if (ctx.frameId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(ctx.frameId);
    ctx.startButton.onclick = null;
    ctx.resultsAgain.onclick = null;
    if(ctx.resultsProcedure)ctx.resultsProcedure.onclick=null;
    ctx.button.onclick = null;
    ctx.speedButton.onclick = null;
    const qualityControl = ctx.root.querySelector('#graphics-quality');
    if (qualityControl) qualityControl.onchange = null;
    ctx.svg.onclick = null;
    ctx.resetButton.onclick = null;
    globalThis.removeEventListener?.('resize', fitField);
    globalThis.visualViewport?.removeEventListener('resize', fitField);
  };
  ctx.cache = new WeakMap();
  setTimeScale(1);
  ctx.liquidAtlasSources=null;
  initializePerformance();
  ctx.SAFE_LIMB_COLOR = [101, 238, 255];
  ctx.WARNING_LIMB_COLOR = [255, 214, 64];
  ctx.CRITICAL_LIMB_COLOR = [255, 72, 72];
  ctx.mixChannel = (a, b, t) => Math.round(a + (b - a) * clamp(t, 0, 1));
  ctx.OIL_HUES = Array.from({length:4}, (_,i)=>i*CONFIG.oil.hueSpreadDeg/3);
  ctx.scale = CONFIG.robot.scale;
  ctx.w = 700;
  ctx.h = 700;
  ctx.HEAD_LIMIT = CONFIG.vision.headScanDeg * Math.PI / 180;
  ctx.SCAN_SPEED = CONFIG.vision.scanSpeedDeg * Math.PI / 180;
  ctx.TRACK_SPEED = CONFIG.vision.trackingSpeedDeg * Math.PI / 180;
  ctx.TRACK_LIMIT = Math.PI / 2;
  ctx.ROBOT_COUNT = tower?towerEnemyCount(tower)+1:4;
  ctx.obstacles = ctx.arenaDefinition.obstacles.map(b => ({
    ...b,
    points: obstacleVertices(b)
  }));
  ctx.robots = [];
  ctx.planeCache = new WeakMap();
  ctx.arenaBoundary = {
    left: ctx.arenaDefinition.left,
    right: ctx.arenaDefinition.left+ctx.arenaDefinition.size,
    top: ctx.arenaDefinition.top,
    bottom: ctx.arenaDefinition.top+ctx.arenaDefinition.size,
    cut: ctx.arenaDefinition.cut,
    points: ctx.arenaDefinition.points
  };
  ctx.arenaBoundary.points = obstacleVertices(ctx.arenaBoundary);
  ctx.arenaPlanes = polygonPlanes(ctx.arenaBoundary);
  ctx.blockG = ctx.root.querySelector('#tag7hop-block');
  ctx.blockG.replaceChildren();
  ctx.root.querySelector('#tag7hop-obstacle-outlines')?.remove();
  ctx.root.querySelector('#tag7hop-arena-clip')?.remove();
  ctx.root.querySelector('#tag7hop-ambient-filter')?.remove();
  ctx.root.querySelector('#tag7hop-ambient-glow')?.remove();
  ctx.fieldClip = el('clipPath', {
    id: 'tag7hop-arena-clip',
    clipPathUnits: 'userSpaceOnUse'
  }, ctx.svg);
  el('polygon', {
    points: ctx.arenaBoundary.points.map(p => p.x + ',' + p.y).join(' ')
  }, ctx.fieldClip);
  // Обрезаем внутренний слой в координатах поля, а не корневой SVG в CSS-пикселях.
  attr(ctx.svg, 'clip-path', 'none');
  attr(ctx.root.querySelector('#tag7hop-arena-content'), 'clip-path', 'url(#tag7hop-arena-clip)');
  // Stationary ambient lighting, baked once before the arena becomes interactive.
  ctx.darkness = ctx.root.querySelector('#tag7hop-darkness');
  ctx.defs = ctx.svg.querySelector('defs');
  ctx.ambientBlur = el('filter', {
    id: 'tag7hop-ambient-filter',
    filterUnits: 'userSpaceOnUse',
    x: -180,
    y: -180,
    width: 1060,
    height: 1060
  }, ctx.defs);
  el('feGaussianBlur', {
    stdDeviation: 5
  }, ctx.ambientBlur);
  ctx.ambientGlowG = el('g', {
    id: 'tag7hop-ambient-glow',
    'pointer-events': 'none',
    'clip-path': 'url(#tag7hop-arena-clip)',
    filter: 'url(#tag7hop-ambient-filter)',
    style: 'mix-blend-mode:screen'
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(ctx.ambientGlowG, ctx.darkness.nextSibling);
  ctx.outlineG = el('g', {
    id: 'tag7hop-obstacle-outlines',
    'pointer-events': 'none',
    fill: 'none',
    stroke: CONFIG.arena.outlineColor,
    'stroke-width': CONFIG.arena.outlineWidthCm
  }, ctx.svg);
  el('polygon', {
    points: ctx.arenaBoundary.points.map(p => p.x + ',' + p.y).join(' '),
    id: 'tag7hop-arena-border',
    'vector-effect': 'non-scaling-stroke',
    'stroke-linejoin': 'round',
    'stroke-width': 2,
    'aria-label': ctx.arenaDefinition.name
  }, ctx.outlineG);
  for (const b of ctx.obstacles) {
    const bounds = {
      points: b.points.map(p => p.x + ',' + p.y).join(' ')
    };
    el('polygon', bounds, ctx.blockG);
    el('polygon', bounds, ctx.outlineG);
  }
  // Gradient over 60 cm from walls and obstacles, about half as
  // bright as the robots' nearby illumination. The gradient is made of soft
  // concentric bands inside the luminance mask; black means LESS darkness.
  ctx.ambientBands = [{
    width: 110,
    opacity: .012
  }, {
    width: 96,
    opacity: .015
  }, {
    width: 82,
    opacity: .018
  }, {
    width: 68,
    opacity: .022
  }, {
    width: 52,
    opacity: .026
  }, {
    width: 38,
    opacity: .03
  }, {
    width: 24,
    opacity: .036
  }, {
    width: 9,
    opacity: .045
  }];
  ctx.ambientPolygons = [ctx.arenaBoundary.points, ...ctx.obstacles.map(b => b.points)];
  ctx.ambientLights=[];
  for (const vertices of ctx.ambientPolygons) {
    const source=el('g',{'data-ambient-light':ctx.ambientLights.length,opacity:CONFIG.light.ambientIntensity},ctx.ambientGlowG);
    ctx.ambientLights.push(source);
    const points = vertices.map(p => p.x + ',' + p.y).join(' ');
    for (const band of ctx.ambientBands) el('polygon', {
      points,
      fill: 'none',
      stroke: CONFIG.light.ambientColor,
      'stroke-opacity': band.opacity,
      'stroke-width': band.width,
      'stroke-linejoin': 'round'
    }, source);
  }
  ctx.root.querySelector('#tag7hop-guide-visuals')?.remove();
  ctx.gridMinorNode = undefined;
  ctx.gridMajorNode = undefined;
  ctx.gridBaseMinor = undefined;
  ctx.gridBaseMajor = undefined;
  ctx.game = {time: 0, events: []};
  ctx.round = {
    elapsedSec: 0
  };
  ctx.seed = Math.floor(Math.random() * 4294967296) >>> 0;
  ctx.agentAI = Array.from({
    length: ctx.ROBOT_COUNT
  }, (_, id) => ({
    goal: null,
    goalUntil: 0,
    patrolIndex: id,
    nextChoice: 0,
    threat: null,
    threatUntil: 0,
    yieldUntil: 0,
    yieldFrom: null,
    stuckAt: 0,
    lastPosition: null,
    moved: 0,
    seeingHunter: false,
    seenHunterId: null,
    wasFleeing: false,
    sensedPoint: null,
    sensedUntil: 0,
    sensedId: null,
    sensedType: null,
    searchHoldUntil: 0,
    lastHitAt: -100,
    profile: null,
    side: 0,
    sideUntil: 0,
    sideTarget: null,
    pursuitTarget: null,
    bestPursuitDistance: null,
    progressAt: 0,
    orbitBreakUntil: 0,
    orbitGoal: null
  }));
  ctx.patrolPoints = [{
    x: 270,
    y: 100
  }, {
    x: 555,
    y: 145
  }, {
    x: 440,
    y: 600
  }, {
    x: 145,
    y: 555
  }];
  if(ctx.arenaDefinition.patrolPoints)ctx.patrolPoints=ctx.arenaDefinition.patrolPoints.map(p=>({...p}));
  if(ctx.arenaId==='ring')ctx.patrolPoints=[{x:350,y:230},{x:470,y:350},{x:350,y:470},{x:230,y:350}];
  ctx.pulses = [];
  ctx.pulseNodes = Array.from({
    length: 6
  }, () => el('circle', {
    r: 0,
    opacity: 0
  }, ctx.pulsesG));
  ctx.sparks = [];
  ctx.sparkNodes = Array.from({
    length: CONFIG.rendering.sparks ? CONFIG.effects.particleLimit : 0
  }, () => el('path', {
    opacity: 0
  }, ctx.sparksG));
  ctx.combat = {
    finished: false,
    winner: null,
    finishedAt: null,
    celebrationUntil: 0,
    nextStrike: Array(ctx.ROBOT_COUNT).fill(0),
    debris: [],
    oilLeaks: [],
    oilDrops: [],
    unarmedDeadline: Array(ctx.ROBOT_COUNT).fill(null),
    pending: Array(ctx.ROBOT_COUNT).fill(null),
    retreatUntil: Array(ctx.ROBOT_COUNT).fill(0),
    retreatFrom: Array(ctx.ROBOT_COUNT).fill(-1),
    focus: Array(ctx.ROBOT_COUNT).fill(-1),
    focusUntil: Array(ctx.ROBOT_COUNT).fill(0),
    strikes: 0,
    hits: 0,
    lastPositions: Array(ctx.ROBOT_COUNT).fill(null),
    stationaryFor: Array(ctx.ROBOT_COUNT).fill(0),
    escapeUntil: Array(ctx.ROBOT_COUNT).fill(0),
    escapeGoal: Array(ctx.ROBOT_COUNT).fill(null),
    escapeSide: Array.from({
      length: ctx.ROBOT_COUNT
    }, () => random() < .5 ? -1 : 1),
    lastHitTime: 0,
    fighterHits: Array(ctx.ROBOT_COUNT).fill(0),
    fighterTaken: Array(ctx.ROBOT_COUNT).fill(0),
    fighterSwings: Array(ctx.ROBOT_COUNT).fill(0),
    detached: []
  };
  for(const id of ['gladiator-oil','gladiator-detached-anatomy','gladiator-debris','gladiator-swings','gladiator-sever-flashes'])ctx.svg.querySelector('#'+id)?.remove();
  ctx.oilG = el('g', {
    id: 'gladiator-oil',
    'pointer-events': 'none'
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(ctx.oilG, ctx.actorsG);
  ctx.detachedG = el('g', {
    id: 'gladiator-detached-anatomy',
    'pointer-events': 'none'
  }, ctx.arenaContent);
  ctx.arenaContent.insertBefore(ctx.detachedG, ctx.actorsG);
  ctx.schematicModuleMap = {
    'arm--1-upper': ['arm--1-upper', 'arm--1-lower'],
    'arm--1-lower': ['arm--1-upper', 'arm--1-lower'],
    'arm-1-upper': ['arm-1-upper', 'arm-1-lower'],
    'arm-1-lower': ['arm-1-upper', 'arm-1-lower'],
    'leg--1-upper': ['leg--1-upper', 'leg--1-lower'],
    'leg--1-lower': ['leg--1-upper', 'leg--1-lower'],
    'leg-1-upper': ['leg-1-upper', 'leg-1-lower'],
    'leg-1-lower': ['leg-1-upper', 'leg-1-lower'],
    'head': ['head'],
    'spine-0': ['spine-0'],
    'spine-1': ['spine-1'],
    'spine-2': ['spine-2'],
    'spine-3': ['spine-3']
  };
  ctx.cardNodes = Array.from({
    length: ctx.ROBOT_COUNT
  }, (_, id) => makeRobotCard(id));
  ctx.arenaAccent = {
    flashes: []
  };
  ctx.severFlashG = el('g', {
    id: 'gladiator-sever-flashes',
    'pointer-events': 'none'
  }, ctx.arenaContent);
  ctx.intents = [];
  ctx.brainDebt = 0;
  initializeHitEffects();
  drawGrid();
  drawFloorDecals();
  rebuildRobots();
  ctx.button.disabled = ctx.speedButton.disabled = ctx.resetButton.disabled = true;
  ctx.startButton.onclick = beginGame;
  attr(ctx.root.querySelector('#tag7hop-darkness'), 'opacity', CONFIG.light.darknessOpacity);
  ctx.stage = ctx.root.querySelector('.tag7hop-stage');
  ctx.fieldSide = ctx.fieldWidth = ctx.fieldHeight = 0;
  ctx.observer = new ResizeObserver(fitField);
  for (const node of [ctx.root, ctx.root.querySelector('.tag7hop-main'), ctx.root.querySelector('.atmosphere-controls')]) ctx.observer.observe(node);
  globalThis.addEventListener?.('resize', fitField);
  globalThis.visualViewport?.addEventListener('resize', fitField);
  fitField();
  // Smooth group-following camera. World units are centimeters; all collision,
  // pathfinding and damage checks continue to use unchanged 0..700 coordinates.
  createWalls();
  createObstacleLights();
  // The clock is a screen-space overlay, not part of the clipped floor.
  ctx.svg.appendChild(ctx.timerOutput);
  ctx.CAMERA_OUTSET = Math.max(0, CONFIG.arena.wallThicknessCm) + Math.max(0, CONFIG.arena.outerWallDepthCm) + CONFIG.arena.wallViewMarginCm;
  ctx.CAMERA_FULL = ctx.arenaDefinition.size + 2 * ctx.CAMERA_OUTSET;
  ctx.CAMERA_MIN = 200;
  ctx.CAMERA_MARGIN = 200;
  ctx.camera = {
    x: -ctx.CAMERA_OUTSET,
    y: -ctx.CAMERA_OUTSET,
    size: ctx.CAMERA_FULL
  };
  cameraReset();
  paint();
  ctx.startButton.focus?.();
  ctx.resetButton.textContent = 'Отменить бой';
  ctx.resetButton.onclick = () => {
    if (ctx.startup.phase === 'running') {
      bettingCancel();
      resetRound();
    }
  };
  ctx.resultsAgain.onclick = () => resetRound('betting');
  if(ctx.resultsProcedure)ctx.resultsProcedure.onclick=()=>resetRound('procedure');
  ctx.button.onclick = togglePause;
  ctx.speedButton.onclick = toggleSpeed;
  // click также обрабатывает одиночный тап; отдельный touch-обработчик удвоил бы переключение.
  ctx.svg.onclick = ctx.mode==='tower'?null:()=>{if(ctx.mode!=='tower'&&ctx.startup.phase==='running'){togglePause();}};
  ctx.svg.style.setProperty('touch-action', 'manipulation');
  ctx.svg.style.setProperty('cursor', ctx.mode==='tower'?'default':'pointer');
  resetFrameClock();
  const gameDocument = ctx.root.ownerDocument;
  gameDocument.addEventListener('visibilitychange', resetFrameClock);
  const disposeWithVisibility = ctx.root.__disposeTag;
  ctx.root.__disposeTag = () => {
    gameDocument.removeEventListener('visibilitychange', resetFrameClock);
    disposeWithVisibility();
  };
  ctx.paintAt = -Infinity;
  initializeOrientation();
  ctx.frameId = requestAnimationFrame(frame);
  // Local pari-mutuel ledger. All values are whole virtual chips.
  ctx.BET_STORAGE = 'biovshi.local-totalizator.v1';
  ctx.betOverlay = ctx.root.querySelector('#bet-overlay');
  ctx.betContent = ctx.root.querySelector('#bet-content');
  ctx.betTitle = ctx.root.querySelector('#bet-title');
  ctx.betHud = ctx.root.querySelector('#bet-hud');
  ctx.BET_COLORS = ['#65eeff', '#ffb36b', '#ff397b', '#b961ff'];
  ctx.betting = null;
  ctx.betStorageAvailable = true;
  ctx.betNotice = '';
  ctx.betFormat = formatChips;
  ctx.betEscape = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]);
  ctx.exhibition=false;ctx.afterSetup=entry==='setup'?'procedure':'betting';
  if(tower){
    delete ctx.root.dataset.betRound;
    ctx.betting=session;ctx.betHud.hidden=true;ctx.intro.hidden=true;ctx.betOverlay.hidden=true;ctx.resultsPanel.hidden=true;ctx.startup.phase='tower-ready';
  }else if(entry==='auto'){
    ctx.betting=session??bettingLoad();ctx.exhibition=true;
    if(ctx.betting){
      betRefund(ctx.betting);
      if(ctx.betting.phase==='settled'){ctx.betting.round++;ctx.betting.phase='betting';ctx.betting.bets=[];}
      betCommit(ctx.betting,ctx.betting.players.map(p=>({player:p.id,robot:p.id%4,amount:0})));
      bettingSave();bettingHud();
    }else{ctx.betHud.hidden=true;delete ctx.root.dataset.betRound;}
    ctx.intro.hidden=true;ctx.betOverlay.hidden=true;ctx.resultsPanel.hidden=true;ctx.startup.phase='demo';
  }else if(session){ctx.betting=session;bettingOpen();}
  else bettingInit();
  initializeCombatLog();
  initializeStreamerMascot();
  const logToggle=ctx.root.querySelector('#combat-log-toggle');
  logToggle.onclick=()=>{ctx.combatLog.hidden=!ctx.combatLog.hidden;logToggle.setAttribute('aria-expanded',String(!ctx.combatLog.hidden));logToggle.textContent=ctx.combatLog.hidden?'▾':'▴';const label=ctx.combatLog.hidden?'Показать журнал':'Скрыть журнал';logToggle.setAttribute('aria-label',label);if(logToggle.hasAttribute('data-hint'))logToggle.dataset.hint=label;else logToggle.title=label;};
  initializeSettings();
  initializeArenaExpand();
  initializeHints();
}
