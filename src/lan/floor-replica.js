import {ctx} from '../game/state.js';
import {createOilDrop} from '../render/effects.js';
import {queueFloorPatch} from './floor-sync.js';

export function createFloorReplica() {
  const pending = [], visible = new Map();
  return {
    receive(patch) { queueFloorPatch(pending, patch); },
    paint(gameTime) {
      while (pending.length && pending[0].time <= gameTime) {
        const {reset, add, remove, trails} = pending.shift();
        const removed = new Set();
        for (const id of reset ? visible.keys() : remove) {
          const drop = visible.get(id);
          if (!drop) continue;
          removed.add(drop);
          visible.delete(id);
          drop.node.remove();
          ctx.settledOilDrops?.delete(drop);
        }
        if (removed.size) ctx.combat.oilDrops = ctx.combat.oilDrops.filter(drop => !removed.has(drop));
        if (reset) for (const robot of ctx.robots) robot.trail.length = 0;
        for (const [id, robot, x, y, radius, born, coolant, index, angle] of add) {
          if (!visible.has(id)) visible.set(id, createOilDrop(robot, x, y, radius, coolant ? 'coolant' : 'blood',
            {born, variant: {index, angle}}));
        }
        for (const [id, points] of trails) {
          const trail = ctx.robots[id].trail;
          trail.splice(0, trail.length, ...points.map(([x, y, time]) => ({x, y, time})));
        }
      }
    },
  };
}
