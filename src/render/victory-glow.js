import { CONFIG } from '../config.js';
import { ctx } from '../game/state.js';
import { attr, el } from './svg.js';

// Filter the combined silhouette, excluding the identity label. Merge the
// untouched texture last; subtract its alpha so gold only appears outside it.
export function paintVictoryGlow(robot, active) {
  if (!active) {
    attr(robot.figure, 'filter', 'none');
    return;
  }
  const range = CONFIG.effects.victoryGlowRangeCm;
  if (!robot.victoryGlow) {
    const id = 'tag7hop-victory-glow-' + robot.id;
    const filter = el('filter', {
      id, filterUnits:'userSpaceOnUse', primitiveUnits:'userSpaceOnUse',
      'color-interpolation-filters':'sRGB',
    }, ctx.defs);
    el('feMorphology', {in:'SourceAlpha', operator:'dilate', radius:range*.2, result:'spread'}, filter);
    el('feGaussianBlur', {in:'spread', stdDeviation:range*4/15, result:'blur'}, filter);
    el('feComposite', {in:'blur', in2:'SourceAlpha', operator:'out', result:'outer'}, filter);
    const gold = el('feFlood', {'flood-color':'#ffd66b', result:'gold'}, filter);
    el('feComposite', {in:'gold', in2:'outer', operator:'in', result:'halo'}, filter);
    const merge = el('feMerge', {}, filter);
    el('feMergeNode', {in:'halo'}, merge);
    el('feMergeNode', {in:'SourceGraphic'}, merge);
    robot.victoryGlow = {id, filter, gold};
  }
  const {id, filter, gold} = robot.victoryGlow;
  const t = robot.reduced ? 0 : Math.max(0, ctx.game.time-(ctx.combat.finishedAt??ctx.game.time));
  const shimmer = .5+.5*Math.sin(t*2.1);
  attr(gold, 'flood-color', `rgb(255 ${Math.round(178+48*shimmer)} ${Math.round(48+72*shimmer)})`);
  attr(gold, 'flood-opacity', (.72+.18*shimmer).toFixed(3));
  // A compact world-space surface keeps blur cost bounded and leaves room for
  // sprite edges beyond the physical bones, plus the ~30 cm falloff (3 sigma).
  const caps = robot.api.capsules;
  const pad = range+20;
  const left = Math.min(robot.x,...caps.map(c=>c.minX-c.r))-pad;
  const top = Math.min(robot.y,...caps.map(c=>c.minY-c.r))-pad;
  const right = Math.max(robot.x,...caps.map(c=>c.maxX+c.r))+pad;
  const bottom = Math.max(robot.y,...caps.map(c=>c.maxY+c.r))+pad;
  for (const [key,value] of Object.entries({x:left,y:top,width:right-left,height:bottom-top}))
    attr(filter,key,value.toFixed(3));
  attr(robot.figure,'filter','url(#'+id+')');
}
